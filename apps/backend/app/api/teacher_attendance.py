from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.attendance import ATTENDANCE_TIMEZONE
from app.core.config import get_settings
from app.db import get_db
from app.deps import current_user, get_network_ip, is_school_network, require_admin
from app.models import (
    AcademicYear,
    AttendanceStatus,
    Role,
    Rombel,
    ScheduleEvent,
    ScheduleEventType,
    Subject,
    Teacher,
    TeacherAttendance,
    User,
)
from app.schemas import (
    TeacherAttendanceOut,
    TeacherScheduleBrief,
    TeacherTodayOut,
)

router = APIRouter(prefix="/api/v1/attendance/teacher")

MSG_NOT_SCHOOL_NETWORK = (
    "Absensi guru hanya bisa dilakukan dari jaringan WiFi sekolah. "
    "Hubungkan perangkat ke WiFi sekolah lalu coba lagi."
)


def _current_teacher(user: User, db: Session) -> Teacher:
    if user.role != Role.GURU:
        raise HTTPException(status_code=403, detail="Akses Guru diperlukan")
    teacher = (
        db.query(Teacher)
        .filter(Teacher.user_id == user.id, Teacher.is_active.is_(True))
        .first()
    )
    if not teacher:
        raise HTTPException(
            status_code=404, detail="Profil guru aktif tidak ditemukan"
        )
    return teacher


def _today_schedules(db: Session, teacher: Teacher, today: date) -> list[ScheduleEvent]:
    return (
        db.query(ScheduleEvent)
        .join(AcademicYear, ScheduleEvent.academic_year_id == AcademicYear.id)
        .filter(
            ScheduleEvent.teacher_id == teacher.id,
            ScheduleEvent.event_type == ScheduleEventType.KBM,
            ScheduleEvent.day_of_week == today.weekday(),
            AcademicYear.is_active.is_(True),
        )
        .order_by(ScheduleEvent.start_time)
        .all()
    )


def _brief(db: Session, schedule: ScheduleEvent) -> TeacherScheduleBrief:
    rombel = db.get(Rombel, schedule.rombel_id)
    subject = db.get(Subject, schedule.subject_id)
    return TeacherScheduleBrief(
        schedule_id=schedule.id,
        title=schedule.title,
        rombel_name=rombel.name if rombel else "-",
        subject_name=subject.name if subject else "-",
        start_time=schedule.start_time,
        end_time=schedule.end_time,
    )


def _late_after(first_start: time) -> time:
    tolerance = get_settings().teacher_late_tolerance_minutes
    return (
        datetime.combine(date.today(), first_start) + timedelta(minutes=tolerance)
    ).time()


def _out(record: TeacherAttendance, already: bool = False) -> TeacherAttendanceOut:
    user = record.teacher.user if record.teacher else None
    return TeacherAttendanceOut(
        id=record.id,
        teacher_id=record.teacher_id,
        teacher_name=user.full_name if user else None,
        nip=record.teacher.nip if record.teacher else None,
        date=record.date,
        check_in_time=record.check_in_time,
        check_out_time=record.check_out_time,
        status=record.status,
        notes=record.notes,
        already_recorded=already,
    )


def _find_record(db: Session, teacher: Teacher, today: date) -> TeacherAttendance | None:
    return (
        db.query(TeacherAttendance)
        .filter(
            TeacherAttendance.teacher_id == teacher.id,
            TeacherAttendance.date == today,
        )
        .first()
    )


@router.get("/today", response_model=TeacherTodayOut)
def get_today(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    teacher = _current_teacher(user, db)
    now_local = datetime.now(ATTENDANCE_TIMEZONE)
    today = now_local.date()
    schedules = _today_schedules(db, teacher, today)
    record = _find_record(db, teacher, today)
    client_ip = get_network_ip(request)
    on_network = is_school_network(client_ip, request)
    first_start = schedules[0].start_time if schedules else None
    last_end = max((s.end_time for s in schedules), default=None)
    now_time = now_local.time().replace(tzinfo=None)

    can_check_in = bool(
        schedules
        and not (record and record.check_in_time)
        and now_time <= last_end
        and on_network
    )
    can_check_out = bool(
        record
        and record.check_in_time
        and not record.check_out_time
        and last_end is not None
        and now_time >= last_end
        and on_network
    )

    message = None
    if not schedules:
        message = "Tidak ada jadwal mengajar hari ini, absensi tidak diperlukan."
    elif not on_network:
        message = MSG_NOT_SCHOOL_NETWORK
        if client_ip:
            message += f" (IP terdeteksi: {client_ip})"
    elif record and record.check_out_time:
        message = "Absensi datang dan pulang hari ini sudah tercatat."
    elif record and record.check_in_time and now_time < last_end:
        message = f"Absen pulang dibuka setelah jam {last_end.strftime('%H:%M')}."
    elif not (record and record.check_in_time) and now_time > last_end:
        message = "Jam mengajar hari ini sudah selesai, absen datang ditutup."

    return TeacherTodayOut(
        date=today,
        server_time=now_local,
        has_schedule=bool(schedules),
        schedules=[_brief(db, s) for s in schedules],
        first_start=first_start,
        last_end=last_end,
        late_after=_late_after(first_start) if first_start else None,
        attendance=_out(record) if record else None,
        on_school_network=on_network,
        client_ip=client_ip,
        can_check_in=can_check_in,
        can_check_out=can_check_out,
        message=message,
    )


def _guard(request: Request, db: Session, user: User):
    teacher = _current_teacher(user, db)
    ip = get_network_ip(request)
    if not is_school_network(ip, request):
        suffix = f" (IP terdeteksi: {ip})" if ip else ""
        raise HTTPException(
            status_code=403, detail=MSG_NOT_SCHOOL_NETWORK + suffix
        )
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(ATTENDANCE_TIMEZONE)
    schedules = _today_schedules(db, teacher, now_local.date())
    if not schedules:
        raise HTTPException(
            status_code=422,
            detail="Tidak ada jadwal mengajar hari ini, absensi tidak diperlukan",
        )
    return teacher, ip, now_utc, now_local, schedules


@router.post("/check-in", response_model=TeacherAttendanceOut)
def check_in(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    teacher, ip, now_utc, now_local, schedules = _guard(request, db, user)
    today = now_local.date()
    existing = _find_record(db, teacher, today)
    if existing and existing.check_in_time:
        return _out(existing, already=True)
    last_end = max(s.end_time for s in schedules)
    if now_local.time().replace(tzinfo=None) > last_end:
        raise HTTPException(
            status_code=422,
            detail="Jam mengajar hari ini sudah selesai, absen datang ditutup",
        )
    late_dt = datetime.combine(today, _late_after(schedules[0].start_time))
    status_value = (
        AttendanceStatus.TERLAMBAT
        if now_local.replace(tzinfo=None) > late_dt
        else AttendanceStatus.HADIR
    )
    record = TeacherAttendance(
        teacher_id=teacher.id,
        date=today,
        check_in_time=now_utc,
        check_in_ip=ip,
        status=status_value,
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _find_record(db, teacher, today)
        if existing:
            return _out(existing, already=True)
        raise
    db.refresh(record)
    return _out(record)


@router.post("/check-out", response_model=TeacherAttendanceOut)
def check_out(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    teacher, ip, now_utc, now_local, schedules = _guard(request, db, user)
    today = now_local.date()
    record = _find_record(db, teacher, today)
    if not record or not record.check_in_time:
        raise HTTPException(
            status_code=422, detail="Anda belum absen datang hari ini"
        )
    if record.check_out_time:
        return _out(record, already=True)
    last_end = max(s.end_time for s in schedules)
    if now_local.time().replace(tzinfo=None) < last_end:
        raise HTTPException(
            status_code=422,
            detail=f"Absen pulang dibuka setelah jam {last_end.strftime('%H:%M')}",
        )
    record.check_out_time = now_utc
    record.check_out_ip = ip
    db.commit()
    db.refresh(record)
    return _out(record)


@router.get("/records", response_model=list[TeacherAttendanceOut])
def list_records(
    start_date: date | None = None,
    end_date: date | None = None,
    teacher_id: UUID | None = None,
    status: AttendanceStatus | None = None,
    limit: int = Query(500, ge=1, le=2000),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(TeacherAttendance)
    if start_date:
        query = query.filter(TeacherAttendance.date >= start_date)
    if end_date:
        query = query.filter(TeacherAttendance.date <= end_date)
    if teacher_id:
        query = query.filter(TeacherAttendance.teacher_id == teacher_id)
    if status:
        query = query.filter(TeacherAttendance.status == status)
    rows = (
        query.order_by(TeacherAttendance.date.desc(), TeacherAttendance.check_in_time)
        .limit(limit)
        .all()
    )
    return [_out(r) for r in rows]
