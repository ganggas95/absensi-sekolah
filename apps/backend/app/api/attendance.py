from datetime import date, datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import (
    AttendanceConfig,
    AttendanceStatus,
    AcademicYear,
    DailyAttendance,
    EventAttendance,
    Role,
    ScheduleEvent,
    ScheduleEventType,
    Student,
    Teacher,
    User,
)
from app.schemas import (
    AttendanceConfigOut,
    DailyOut,
    DailyRecord,
    EventAttendanceOut,
    EventAttendanceRecord,
    ScheduleEventOut,
)

router = APIRouter(prefix="/api/v1/attendance")
ATTENDANCE_TIMEZONE = ZoneInfo("Asia/Makassar")


@router.get("/config", response_model=AttendanceConfigOut)
def get_attendance_config(
    _: User = Depends(current_user), db: Session = Depends(get_db)
):
    config = (
        db.query(AttendanceConfig).filter(AttendanceConfig.is_active.is_(True)).first()
    )
    if not config:
        raise HTTPException(
            status_code=404, detail="Konfigurasi waktu absensi belum tersedia"
        )
    return config


@router.get("/daily/schedules", response_model=list[ScheduleEventOut])
def list_daily_schedules(
    current: User = Depends(current_user), db: Session = Depends(get_db)
):
    today = datetime.now(ATTENDANCE_TIMEZONE).date()
    query = (
        db.query(ScheduleEvent)
        .join(AcademicYear, ScheduleEvent.academic_year_id == AcademicYear.id)
        .filter(
            ScheduleEvent.event_type == ScheduleEventType.KBM,
            ScheduleEvent.day_of_week == today.weekday(),
            AcademicYear.is_active.is_(True),
        )
    )
    if current.role == Role.GURU:
        teacher = (
            db.query(Teacher)
            .filter(
                Teacher.user_id == current.id,
                Teacher.is_active.is_(True),
            )
            .first()
        )
        if not teacher:
            return []
        query = query.filter(ScheduleEvent.teacher_id == teacher.id)
    return query.order_by(ScheduleEvent.start_time).all()


@router.post("/daily/record", response_model=DailyOut)
def record_daily(
    payload: DailyRecord,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not payload.id_siswa and not payload.student_id and not payload.nisn:
        raise HTTPException(
            status_code=422, detail="id_siswa, student_id, atau nisn wajib diisi"
        )
    schedule = db.get(ScheduleEvent, payload.schedule_event_id)
    today = datetime.now(ATTENDANCE_TIMEZONE).date()
    if (
        not schedule
        or schedule.event_type != ScheduleEventType.KBM
        or schedule.day_of_week != today.weekday()
        or not db.query(AcademicYear)
        .filter(
            AcademicYear.id == schedule.academic_year_id,
            AcademicYear.is_active.is_(True),
        )
        .first()
    ):
        raise HTTPException(status_code=422, detail="Jadwal tidak aktif untuk hari ini")
    if user.role == Role.GURU:
        teacher = (
            db.query(Teacher)
            .filter(
                Teacher.user_id == user.id,
                Teacher.id == schedule.teacher_id,
                Teacher.is_active.is_(True),
            )
            .first()
        )
        if not teacher:
            raise HTTPException(
                status_code=403, detail="Jadwal ini bukan jadwal mengajar Anda"
            )
    student_identifier = payload.id_siswa or payload.student_id
    student = (
        db.get(Student, student_identifier)
        if student_identifier
        else db.query(Student).filter(Student.nisn == payload.nisn).first()
    )
    if not student or not student.is_active:
        raise HTTPException(
            status_code=404, detail="Siswa tidak ditemukan atau tidak aktif"
        )
    if student.rombel_id not in schedule.rombel_ids:
        raise HTTPException(
            status_code=422, detail="Siswa bukan peserta pada rombel jadwal ini"
        )
    now = datetime.now(timezone.utc)
    local_now = now.astimezone(ATTENDANCE_TIMEZONE)
    attendance_date = payload.date or local_now.date()
    record = (
        db.query(DailyAttendance)
        .filter(
            DailyAttendance.student_id == student.id,
            DailyAttendance.date == attendance_date,
        )
        .first()
    )
    if payload.check_in:
        if record and record.check_in_time:
            return {
                **DailyOut.model_validate(record).model_dump(),
                "already_recorded": True,
            }
        late_threshold = datetime.combine(
            local_now.date(), schedule.start_time
        ) + timedelta(minutes=10)
        status_value = (
            AttendanceStatus.TERLAMBAT
            if local_now.replace(tzinfo=None) > late_threshold
            else AttendanceStatus.HADIR
        )
    else:
        status_value = payload.status
    if not record:
        record = DailyAttendance(
            student_id=student.id,
            date=attendance_date,
            status=status_value,
            notes=payload.notes,
        )
        db.add(record)
    else:
        record.status = status_value
        if payload.notes is not None:
            record.notes = payload.notes
    if payload.check_in:
        record.check_in_time = now
    else:
        record.check_out_time = now
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(DailyAttendance)
            .filter(
                DailyAttendance.student_id == student.id,
                DailyAttendance.date == attendance_date,
            )
            .first()
        )
        if existing:
            return {
                **DailyOut.model_validate(existing).model_dump(),
                "already_recorded": True,
            }
        raise
    db.refresh(record)
    return record


@router.get("/event/{schedule_event_id}", response_model=list[EventAttendanceOut])
def list_event_attendance(
    schedule_event_id: UUID,
    current: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    event = db.get(ScheduleEvent, schedule_event_id)
    if not event or event.event_type != ScheduleEventType.EXAM:
        raise HTTPException(status_code=404, detail="Jadwal ujian tidak ditemukan")
    _require_exam_supervisor(event, current, db)

    rows = (
        db.query(Student, EventAttendance)
        .outerjoin(
            EventAttendance,
            (EventAttendance.student_id == Student.id)
            & (EventAttendance.schedule_event_id == schedule_event_id),
        )
        .filter(Student.rombel_id == event.rombel_id, Student.is_active.is_(True))
        .order_by(Student.full_name)
        .all()
    )
    return [
        EventAttendanceOut(
            student_id=student.id,
            full_name=student.full_name,
            nisn=student.nisn,
            status=attendance.status if attendance else None,
            recorded_at=attendance.recorded_at if attendance else None,
        )
        for student, attendance in rows
    ]


@router.post("/event/record", response_model=EventAttendanceOut)
def record_event_attendance(
    payload: EventAttendanceRecord,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    event = db.get(ScheduleEvent, payload.schedule_event_id)
    if not event or event.event_type != ScheduleEventType.EXAM:
        raise HTTPException(status_code=404, detail="Jadwal ujian tidak ditemukan")
    _require_exam_supervisor(event, user, db)
    student = db.get(Student, payload.student_id)
    if not student or not student.is_active:
        raise HTTPException(
            status_code=404, detail="Siswa tidak ditemukan atau tidak aktif"
        )
    if student.rombel_id != event.rombel_id:
        raise HTTPException(
            status_code=422, detail="Siswa bukan peserta pada rombel ujian ini"
        )

    existing = (
        db.query(EventAttendance)
        .filter(
            EventAttendance.schedule_event_id == event.id,
            EventAttendance.student_id == student.id,
        )
        .first()
    )
    if existing:
        return EventAttendanceOut(
            student_id=student.id,
            full_name=student.full_name,
            nisn=student.nisn,
            status=existing.status,
            recorded_at=existing.recorded_at,
            already_recorded=True,
        )

    attendance = EventAttendance(
        schedule_event_id=event.id,
        student_id=student.id,
        status=payload.status,
        notes=payload.notes,
        recorded_by=user.id,
    )
    db.add(attendance)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(EventAttendance)
            .filter(
                EventAttendance.schedule_event_id == event.id,
                EventAttendance.student_id == student.id,
            )
            .first()
        )
        if not existing:
            raise
        return EventAttendanceOut(
            student_id=student.id,
            full_name=student.full_name,
            nisn=student.nisn,
            status=existing.status,
            recorded_at=existing.recorded_at,
            already_recorded=True,
        )
    db.refresh(attendance)
    return EventAttendanceOut(
        student_id=student.id,
        full_name=student.full_name,
        nisn=student.nisn,
        status=attendance.status,
        recorded_at=attendance.recorded_at,
    )


def _require_exam_supervisor(event: ScheduleEvent, user: User, db: Session) -> None:
    if user.role == Role.ADMIN:
        return
    supervisor = (
        db.query(Teacher)
        .filter(
            Teacher.user_id == user.id,
            Teacher.id == event.teacher_id,
            Teacher.is_active.is_(True),
        )
        .first()
    )
    if not supervisor:
        raise HTTPException(
            status_code=403,
            detail="Absensi hanya dapat dikelola oleh guru pengawas ujian",
        )


@router.get("/daily", response_model=list[DailyOut])
def list_daily(
    attendance_date: date | None = None,
    student_id: UUID | None = None,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(DailyAttendance, Student.full_name).join(
        Student, Student.id == DailyAttendance.student_id
    )
    if attendance_date:
        query = query.filter(DailyAttendance.date == attendance_date)
    if student_id:
        query = query.filter(DailyAttendance.student_id == student_id)
    return [
        {
            **DailyOut.model_validate(record).model_dump(),
            "student_name": student_name,
        }
        for record, student_name in query.order_by(DailyAttendance.date.desc()).all()
    ]
