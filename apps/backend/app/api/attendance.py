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
    AttendanceSession,
    AttendanceStatus,
    AcademicYear,
    DailyAttendance,
    EventAttendance,
    Role,
    Rombel,
    ScheduleEvent,
    ScheduleEventType,
    Student,
    Subject,
    Teacher,
    User,
)
from app.schemas import (
    ActiveScheduleSummary,
    AttendanceConfigOut,
    AttendanceSessionOpen,
    AttendanceSessionOut,
    DailyOut,
    DailyRecord,
    EventAttendanceOut,
    EventAttendanceRecord,
    ScheduleAttendanceStat,
    ScheduleEventOut,
    StudentAttendanceStat,
    TeacherDashboardStatsOut,
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


def _local_today() -> date:
    return datetime.now(ATTENDANCE_TIMEZONE).date()


def _get_kbm_schedule(db: Session, schedule_event_id: UUID, day: date) -> ScheduleEvent:
    schedule = db.get(ScheduleEvent, schedule_event_id)
    if (
        not schedule
        or schedule.event_type != ScheduleEventType.KBM
        or schedule.day_of_week != day.weekday()
        or not db.query(AcademicYear)
        .filter(
            AcademicYear.id == schedule.academic_year_id,
            AcademicYear.is_active.is_(True),
        )
        .first()
    ):
        raise HTTPException(status_code=422, detail="Jadwal tidak aktif untuk hari ini")
    return schedule


def _require_schedule_teacher(
    schedule: ScheduleEvent | None, user: User, db: Session
) -> None:
    if user.role != Role.GURU:
        return
    if schedule is None:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
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


def _session_out(db: Session, session: AttendanceSession) -> AttendanceSessionOut:
    opener = db.get(User, session.opened_by) if session.opened_by else None
    return AttendanceSessionOut(
        id=session.id,
        schedule_event_id=session.schedule_event_id,
        session_date=session.session_date,
        opened_by=session.opened_by,
        opened_by_name=opener.full_name if opener else None,
        opened_at=session.opened_at,
        closed_by=session.closed_by,
        closed_at=session.closed_at,
        is_open=session.closed_at is None,
    )


@router.post("/daily/sessions/open", response_model=AttendanceSessionOut)
def open_daily_session(
    payload: AttendanceSessionOpen,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Open (or reopen) the attendance session of a KBM schedule for today.

    The session is persisted and unique per schedule and date, so a page
    reload, another teacher, or the next schedule on the same day can never
    continue the previous teacher's attendance scope.
    """

    today = _local_today()
    schedule = _get_kbm_schedule(db, payload.schedule_event_id, today)
    _require_schedule_teacher(schedule, user, db)
    session = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.schedule_event_id == schedule.id,
            AttendanceSession.session_date == today,
        )
        .first()
    )
    if session:
        if session.closed_at is not None:
            session.closed_at = None
            session.closed_by = None
            db.commit()
            db.refresh(session)
    else:
        session = AttendanceSession(
            schedule_event_id=schedule.id,
            session_date=today,
            opened_by=user.id,
        )
        db.add(session)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            session = (
                db.query(AttendanceSession)
                .filter(
                    AttendanceSession.schedule_event_id == schedule.id,
                    AttendanceSession.session_date == today,
                )
                .first()
            )
            if not session:
                raise
        else:
            db.refresh(session)
    return _session_out(db, session)


@router.get("/daily/sessions", response_model=list[AttendanceSessionOut])
def list_daily_sessions(
    attendance_date: date | None = None,
    schedule_event_id: UUID | None = None,
    current: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(AttendanceSession).filter(
        AttendanceSession.session_date == (attendance_date or _local_today())
    )
    if schedule_event_id:
        query = query.filter(AttendanceSession.schedule_event_id == schedule_event_id)
    if current.role == Role.GURU:
        teacher = (
            db.query(Teacher)
            .filter(Teacher.user_id == current.id, Teacher.is_active.is_(True))
            .first()
        )
        if not teacher:
            return []
        teacher_schedules = db.query(ScheduleEvent.id).filter(
            ScheduleEvent.teacher_id == teacher.id
        )
        query = query.filter(AttendanceSession.schedule_event_id.in_(teacher_schedules))
    return [
        _session_out(db, session)
        for session in query.order_by(AttendanceSession.opened_at).all()
    ]


@router.post("/daily/sessions/{session_id}/close", response_model=AttendanceSessionOut)
def close_daily_session(
    session_id: UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    session = db.get(AttendanceSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi absensi tidak ditemukan")
    schedule = db.get(ScheduleEvent, session.schedule_event_id)
    _require_schedule_teacher(schedule, user, db)
    if session.closed_at is None:
        session.closed_at = datetime.now(timezone.utc)
        session.closed_by = user.id
        db.commit()
        db.refresh(session)
    return _session_out(db, session)


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
    session = db.get(AttendanceSession, payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi absensi tidak ditemukan")
    if session.session_date != _local_today():
        raise HTTPException(
            status_code=422, detail="Sesi absensi sudah tidak berlaku"
        )
    if session.closed_at is not None:
        raise HTTPException(status_code=422, detail="Sesi absensi sudah ditutup")
    schedule = _get_kbm_schedule(db, session.schedule_event_id, session.session_date)
    _require_schedule_teacher(schedule, user, db)
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
    attendance_date = session.session_date
    record_filter = (
        DailyAttendance.student_id == student.id,
        DailyAttendance.schedule_event_id == schedule.id,
        DailyAttendance.date == attendance_date,
    )
    record = db.query(DailyAttendance).filter(*record_filter).first()
    if payload.check_in:
        if record and record.check_in_time:
            return {
                **DailyOut.model_validate(record).model_dump(),
                "already_recorded": True,
            }
        late_threshold = datetime.combine(
            attendance_date, schedule.start_time
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
            schedule_event_id=schedule.id,
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
        existing = db.query(DailyAttendance).filter(*record_filter).first()
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
    session_id: UUID | None = None,
    schedule_event_id: UUID | None = None,
    current: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(DailyAttendance, Student.full_name).join(
        Student, Student.id == DailyAttendance.student_id
    )
    if session_id:
        session = db.get(AttendanceSession, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Sesi absensi tidak ditemukan")
        schedule = db.get(ScheduleEvent, session.schedule_event_id)
        _require_schedule_teacher(schedule, current, db)
        query = query.filter(
            DailyAttendance.schedule_event_id == session.schedule_event_id,
            DailyAttendance.date == session.session_date,
        )
    else:
        if attendance_date:
            query = query.filter(DailyAttendance.date == attendance_date)
        if schedule_event_id:
            query = query.filter(
                DailyAttendance.schedule_event_id == schedule_event_id
            )
        if current.role == Role.GURU:
            teacher = (
                db.query(Teacher)
                .filter(Teacher.user_id == current.id, Teacher.is_active.is_(True))
                .first()
            )
            if not teacher:
                return []
            teacher_schedules = db.query(ScheduleEvent.id).filter(
                ScheduleEvent.teacher_id == teacher.id
            )
            query = query.filter(
                DailyAttendance.schedule_event_id.in_(teacher_schedules)
            )
    if student_id:
        query = query.filter(DailyAttendance.student_id == student_id)
    return [
        {
            **DailyOut.model_validate(record).model_dump(),
            "student_name": student_name,
        }
        for record, student_name in query.order_by(
            DailyAttendance.date.desc(), Student.full_name
        ).all()
    ]


@router.get("/teacher/dashboard-stats", response_model=TeacherDashboardStatsOut)
def get_teacher_dashboard_stats(
    current: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    teacher = None
    if current.role == Role.GURU:
        teacher = (
            db.query(Teacher)
            .filter(Teacher.user_id == current.id, Teacher.is_active.is_(True))
            .first()
        )
        if not teacher:
            raise HTTPException(
                status_code=404, detail="Profil guru aktif tidak ditemukan"
            )
    else:
        # Admin testing fallback: pick first active teacher
        teacher = db.query(Teacher).filter(Teacher.is_active.is_(True)).first()
        if not teacher:
            raise HTTPException(
                status_code=404, detail="Belum ada guru yang terdaftar"
            )

    teacher_name = teacher.user.full_name if teacher.user else current.full_name
    now_local = datetime.now(ATTENDANCE_TIMEZONE)
    today = now_local.date()
    now_time = now_local.time()

    # Active academic year
    active_year = (
        db.query(AcademicYear).filter(AcademicYear.is_active.is_(True)).first()
    )
    year_id = active_year.id if active_year else None

    # Teacher's schedules today (KBM)
    today_schedules_query = (
        db.query(ScheduleEvent)
        .filter(
            ScheduleEvent.teacher_id == teacher.id,
            ScheduleEvent.event_type == ScheduleEventType.KBM,
            ScheduleEvent.day_of_week == today.weekday(),
        )
    )
    if year_id:
        today_schedules_query = today_schedules_query.filter(
            ScheduleEvent.academic_year_id == year_id
        )
    today_schedules = today_schedules_query.order_by(ScheduleEvent.start_time).all()

    # Determine currently active or upcoming schedule
    active_sched_event = None
    is_active_now = False

    for s in today_schedules:
        if s.start_time <= now_time <= s.end_time:
            active_sched_event = s
            is_active_now = True
            break

    if not active_sched_event:
        for s in today_schedules:
            if s.start_time > now_time:
                active_sched_event = s
                break

    if not active_sched_event and today_schedules:
        active_sched_event = today_schedules[0]

    active_summary = None
    if active_sched_event:
        rombel = db.get(Rombel, active_sched_event.rombel_id)
        subject = db.get(Subject, active_sched_event.subject_id)
        students_in_rombel = (
            db.query(Student)
            .filter(
                Student.rombel_id.in_(active_sched_event.rombel_ids),
                Student.is_active.is_(True),
            )
            .all()
        )
        total_students = len(students_in_rombel)
        student_ids = [st.id for st in students_in_rombel]

        records_today = (
            db.query(DailyAttendance)
            .filter(
                DailyAttendance.student_id.in_(student_ids),
                DailyAttendance.date == today,
                DailyAttendance.schedule_event_id == active_sched_event.id,
            )
            .all()
            if student_ids
            else []
        )
        hadir_cnt = sum(
            1 for r in records_today if r.status == AttendanceStatus.HADIR
        )
        terlambat_cnt = sum(
            1 for r in records_today if r.status == AttendanceStatus.TERLAMBAT
        )
        recorded_cnt = len(records_today)
        unrecorded_cnt = max(0, total_students - recorded_cnt)

        active_summary = ActiveScheduleSummary(
            schedule_id=active_sched_event.id,
            title=active_sched_event.title,
            rombel_name=rombel.name if rombel else "-",
            subject_name=subject.name if subject else "-",
            start_time=active_sched_event.start_time,
            end_time=active_sched_event.end_time,
            is_currently_active=is_active_now,
            total_students=total_students,
            recorded_count=recorded_cnt,
            hadir_count=hadir_cnt,
            terlambat_count=terlambat_cnt,
            unrecorded_count=unrecorded_cnt,
        )

    # All schedules of this teacher (for attendance rates per schedule/class)
    all_teacher_schedules = (
        db.query(ScheduleEvent)
        .filter(
            ScheduleEvent.teacher_id == teacher.id,
            ScheduleEvent.event_type == ScheduleEventType.KBM,
        )
        .all()
    )

    all_rombel_ids = set()
    for s in all_teacher_schedules:
        all_rombel_ids.update(s.rombel_ids)
    teacher_schedule_ids = [s.id for s in all_teacher_schedules]

    # Schedule attendance rates
    schedule_rates: list[ScheduleAttendanceStat] = []
    for s in all_teacher_schedules:
        rombel = db.get(Rombel, s.rombel_id)
        subject = db.get(Subject, s.subject_id)
        students_in_s = (
            db.query(Student)
            .filter(Student.rombel_id.in_(s.rombel_ids), Student.is_active.is_(True))
            .all()
        )
        s_student_ids = [st.id for st in students_in_s]
        s_total_students = len(students_in_s)

        if s_student_ids:
            total_attendance_records = (
                db.query(DailyAttendance)
                .filter(
                    DailyAttendance.student_id.in_(s_student_ids),
                    DailyAttendance.schedule_event_id == s.id,
                )
                .all()
            )
            total_recs = len(total_attendance_records)
            present_recs = sum(
                1
                for r in total_attendance_records
                if r.status in (AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT)
            )
            rate = round((present_recs / total_recs * 100.0), 1) if total_recs > 0 else 0.0
        else:
            present_recs = 0
            rate = 0.0

        schedule_rates.append(
            ScheduleAttendanceStat(
                schedule_id=s.id,
                title=s.title,
                rombel_name=rombel.name if rombel else "-",
                subject_name=subject.name if subject else "-",
                day_of_week=s.day_of_week,
                start_time=s.start_time,
                end_time=s.end_time,
                total_students=s_total_students,
                present_count=present_recs,
                attendance_rate=rate,
            )
        )

    # Sort schedule attendance rates descending
    schedule_rates.sort(key=lambda x: x.attendance_rate, reverse=True)

    # Calculate student attendance statistics for students in this teacher's classes
    teacher_students = (
        db.query(Student)
        .filter(Student.rombel_id.in_(all_rombel_ids), Student.is_active.is_(True))
        .all()
        if all_rombel_ids
        else []
    )

    student_stats_list: list[StudentAttendanceStat] = []
    for st in teacher_students:
        rombel = db.get(Rombel, st.rombel_id)
        records = (
            db.query(DailyAttendance)
            .filter(
                DailyAttendance.student_id == st.id,
                DailyAttendance.schedule_event_id.in_(teacher_schedule_ids),
            )
            .all()
        )
        hadir_c = sum(1 for r in records if r.status == AttendanceStatus.HADIR)
        terlambat_c = sum(
            1 for r in records if r.status == AttendanceStatus.TERLAMBAT
        )
        izin_c = sum(1 for r in records if r.status == AttendanceStatus.IZIN)
        sakit_c = sum(1 for r in records if r.status == AttendanceStatus.SAKIT)
        alpa_c = sum(1 for r in records if r.status == AttendanceStatus.ALPA)
        total_rec = len(records)
        unexcused = alpa_c + sakit_c + izin_c
        att_rate = (
            round(((hadir_c + terlambat_c) / total_rec * 100.0), 1)
            if total_rec > 0
            else 0.0
        )

        student_stats_list.append(
            StudentAttendanceStat(
                student_id=st.id,
                full_name=st.full_name,
                nisn=st.nisn,
                rombel_name=rombel.name if rombel else "-",
                hadir_count=hadir_c,
                terlambat_count=terlambat_c,
                izin_count=izin_c,
                sakit_count=sakit_c,
                alpa_count=alpa_c,
                total_unexcused=unexcused,
                total_recorded=total_rec,
                attendance_rate=att_rate,
            )
        )

    # Top absent students: sort by alpa desc, unexcused desc, hadir asc
    # Filter to students who have at least 1 absence (unexcused > 0)
    top_absent = sorted(
        [s for s in student_stats_list if s.total_unexcused > 0],
        key=lambda x: (x.alpa_count, x.total_unexcused, -x.hadir_count),
        reverse=True,
    )[:5]

    # Top diligent students: sort by attendance_rate desc, hadir_count desc, alpa asc
    # Filter to students who have records
    top_diligent = sorted(
        [s for s in student_stats_list if s.total_recorded > 0],
        key=lambda x: (x.attendance_rate, x.hadir_count, -x.alpa_count),
        reverse=True,
    )[:5]

    return TeacherDashboardStatsOut(
        teacher_name=teacher_name,
        today_date=today,
        active_schedule=active_summary,
        today_schedules_count=len(today_schedules),
        top_absent_students=top_absent,
        top_diligent_students=top_diligent,
        schedule_attendance_rates=schedule_rates,
    )
