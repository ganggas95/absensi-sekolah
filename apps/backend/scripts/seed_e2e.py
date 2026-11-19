import os
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.engine import make_url

from app.db import SessionLocal
from app.models import (
    AcademicYear,
    AttendanceStatus,
    AttendanceConfig,
    DailyAttendance,
    EventAttendance,
    EventAttendanceStatus,
    ExamPeriod,
    ExamPeriodType,
    Role,
    Rombel,
    ScheduleEvent,
    ScheduleEventType,
    Student,
    Subject,
    Teacher,
    TeacherAttendance,
    TeacherSubject,
    User,
)
from app.security import hash_password


def main() -> None:
    database_url = make_url(os.environ.get("DATABASE_URL", ""))
    if (
        os.environ.get("E2E_TEST_MODE") != "1"
        or database_url.drivername != "postgresql+psycopg"
        or database_url.database != "absensi_e2e"
        or database_url.host != "db"
    ):
        raise SystemExit(
            "Refusing to seed: this script only supports the isolated E2E database."
        )

    today = datetime.now(ZoneInfo("Asia/Makassar")).date()
    db = SessionLocal()
    try:
        admin = User(
            username="e2e-admin",
            hashed_password=hash_password("e2e-admin-pass"),
            full_name="E2E Administrator",
            role=Role.ADMIN,
        )
        teacher_user = User(
            username="e2e-guru",
            hashed_password=hash_password("e2e-guru-pass"),
            full_name="E2E Guru",
            role=Role.GURU,
        )
        year = AcademicYear(year_name="2098/2099", is_active=True)
        db.add_all([admin, teacher_user, year])
        db.flush()

        teacher = Teacher(user_id=teacher_user.id, nip="E2E-001")
        rombel = Rombel(name="E2E Kelas 7A", academic_year_id=year.id)
        subject = Subject(code="E2E-MTK", name="E2E Matematika")
        db.add_all([teacher, rombel, subject])
        db.flush()
        db.add(TeacherSubject(teacher_id=teacher.id, subject_id=subject.id))
        student = Student(
            nisn="E2E-0001",
            full_name="E2E Siswa",
            gender="L",
            rombel_id=rombel.id,
        )
        report_student = Student(
            nisn="E2E-REPORT-1",
            full_name="E2E Report Siswa",
            gender="P",
            rombel_id=rombel.id,
        )
        period = ExamPeriod(
            academic_year_id=year.id,
            period_type=ExamPeriodType.GANJIL,
            start_date=today,
            end_date=today + timedelta(days=14),
        )
        db.add_all([student, report_student, period])
        db.flush()

        now = datetime.now(ZoneInfo("Asia/Makassar"))
        start_time = (
            (now - timedelta(minutes=5)).time().replace(second=0, microsecond=0)
        )
        end_time = (now + timedelta(minutes=30)).time().replace(second=0, microsecond=0)
        if end_time <= start_time:
            start_time, end_time = time(0, 0), time(23, 59)
        db.add_all(
            [
                AttendanceConfig(
                    config_name="E2E",
                    check_in_start=time(0, 0),
                    check_in_end=time(23, 59),
                    check_out_start=time(0, 0),
                    check_out_end=time(23, 59),
                    late_threshold=time(23, 59),
                ),
                ScheduleEvent(
                    event_type=ScheduleEventType.KBM,
                    title="E2E KBM",
                    academic_year_id=year.id,
                    rombel_id=rombel.id,
                    subject_id=subject.id,
                    teacher_id=teacher.id,
                    day_of_week=today.weekday(),
                    start_time=start_time,
                    end_time=end_time,
                ),
                ScheduleEvent(
                    event_type=ScheduleEventType.EXAM,
                    title="E2E Ujian Matematika",
                    academic_year_id=year.id,
                    exam_period_id=period.id,
                    rombel_id=rombel.id,
                    subject_id=subject.id,
                    teacher_id=teacher.id,
                    schedule_date=today,
                    start_time=time(10, 0),
                    end_time=time(11, 0),
                ),
            ]
        )
        db.flush()
        kbm = db.query(ScheduleEvent).filter(ScheduleEvent.title == "E2E KBM").one()
        exam = (
            db.query(ScheduleEvent)
            .filter(ScheduleEvent.title == "E2E Ujian Matematika")
            .one()
        )
        db.add_all(
            [
                DailyAttendance(
                    student_id=report_student.id,
                    date=today,
                    check_in_time=now.astimezone(ZoneInfo("UTC")),
                    status=AttendanceStatus.HADIR,
                    notes="Fixture laporan harian",
                ),
                TeacherAttendance(
                    teacher_id=teacher.id,
                    date=today,
                    check_in_time=now.astimezone(ZoneInfo("UTC")),
                    check_in_ip="10.0.0.7",
                    status=AttendanceStatus.TERLAMBAT,
                    notes="Fixture absensi guru",
                ),
                EventAttendance(
                    schedule_event_id=kbm.id,
                    student_id=report_student.id,
                    status=EventAttendanceStatus.HADIR,
                    notes="Fixture laporan KBM",
                ),
                EventAttendance(
                    schedule_event_id=exam.id,
                    student_id=report_student.id,
                    status=EventAttendanceStatus.IZIN,
                    notes="Fixture laporan ujian",
                ),
            ]
        )
        db.commit()
        print("Seeded isolated E2E users and school fixtures.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
