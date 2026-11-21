from datetime import date, datetime, time, timezone
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.deps import current_user
from app.main import app
from app.models import (
    AcademicYear,
    AttendanceStatus,
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
    User,
)


def test_admin_reports_filter_rows_and_export_pdf_and_xlsx():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = test_session()
    admin = User(
        id=uuid4(),
        username="report-admin",
        hashed_password="unused",
        full_name="Admin",
        role=Role.ADMIN,
    )
    teacher_user = User(
        id=uuid4(),
        username="report-guru",
        hashed_password="unused",
        full_name="Guru",
        role=Role.GURU,
    )
    year = AcademicYear(year_name="2090/2091", is_active=True)
    session.add_all([admin, teacher_user, year])
    session.flush()
    teacher = Teacher(user_id=teacher_user.id, nip="REPORT-001")
    rombel = Rombel(name="Kelas Laporan", academic_year_id=year.id)
    subject = Subject(code="REPORT", name="Matematika Laporan")
    session.add_all([teacher, rombel, subject])
    session.flush()
    student = Student(
        nisn="1234000001", full_name="Siswa Laporan", gender="L", rombel_id=rombel.id
    )
    period = ExamPeriod(
        academic_year_id=year.id,
        period_type=ExamPeriodType.GANJIL,
        start_date=date.today(),
        end_date=date.today(),
    )
    session.add_all([student, period])
    session.flush()
    kbm = ScheduleEvent(
        event_type=ScheduleEventType.KBM,
        title="KBM Matematika",
        academic_year_id=year.id,
        rombel_id=rombel.id,
        subject_id=subject.id,
        teacher_id=teacher.id,
        day_of_week=0,
        start_time=time(8),
        end_time=time(9),
    )
    kbm_other = ScheduleEvent(
        event_type=ScheduleEventType.KBM,
        title="KBM IPA",
        academic_year_id=year.id,
        rombel_id=rombel.id,
        subject_id=subject.id,
        teacher_id=teacher.id,
        day_of_week=0,
        start_time=time(10),
        end_time=time(11),
    )
    exam = ScheduleEvent(
        event_type=ScheduleEventType.EXAM,
        title="Ujian Matematika",
        academic_year_id=year.id,
        exam_period_id=period.id,
        rombel_id=rombel.id,
        subject_id=subject.id,
        teacher_id=teacher.id,
        schedule_date=date.today(),
        start_time=time(9),
        end_time=time(10),
    )
    session.add_all([kbm, kbm_other, exam])
    session.flush()
    session.add_all(
        [
            DailyAttendance(
                student_id=student.id,
                schedule_event_id=kbm.id,
                date=date.today(),
                check_in_time=datetime.now(timezone.utc),
                status=AttendanceStatus.HADIR,
            ),
            DailyAttendance(
                student_id=student.id,
                schedule_event_id=kbm_other.id,
                date=date.today(),
                check_in_time=datetime.now(timezone.utc),
                status=AttendanceStatus.IZIN,
            ),
            EventAttendance(
                schedule_event_id=exam.id,
                student_id=student.id,
                status=EventAttendanceStatus.IZIN,
                recorded_at=datetime.now(timezone.utc),
            ),
        ]
    )
    session.commit()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[current_user] = lambda: admin
    client = TestClient(app)
    try:
        daily = client.get(
            "/api/v1/reports/daily",
            params={
                "date_from": date.today().isoformat(),
                "date_to": date.today().isoformat(),
                "rombel_id": str(rombel.id),
                "student_id": str(student.id),
                "status": "HADIR",
            },
        )
        daily_all = client.get(
            "/api/v1/reports/daily",
            params={
                "date_from": date.today().isoformat(),
                "date_to": date.today().isoformat(),
            },
        )
        class_report = client.get(
            "/api/v1/reports/class",
            params={
                "rombel_id": str(rombel.id),
                "subject_id": str(subject.id),
                "schedule_event_id": str(kbm.id),
            },
        )
        other_class_report = client.get(
            "/api/v1/reports/class",
            params={"schedule_event_id": str(kbm_other.id)},
        )
        exam_report = client.get(
            "/api/v1/reports/exam",
            params={"exam_period_id": str(period.id), "rombel_id": str(rombel.id)},
        )
        assert (
            daily.status_code
            == class_report.status_code
            == other_class_report.status_code
            == exam_report.status_code
            == 200
        )
        # The same student has one record per schedule session on the same day.
        assert daily_all.status_code == 200
        assert daily_all.json()["total"] == 2
        assert daily_all.json()["summary"]["Hadir"] == 1
        assert daily_all.json()["summary"]["Izin"] == 1
        assert {row["subject"] for row in daily_all.json()["rows"]} == {
            "Matematika Laporan"
        }
        assert {row["session"] for row in daily_all.json()["rows"]} == {
            "KBM Matematika",
            "KBM IPA",
        }
        assert daily.json()["total"] == 1
        assert daily.json()["summary"]["Hadir"] == 1
        # Each KBM report is scoped to its own schedule session.
        assert class_report.json()["total"] == 1
        assert class_report.json()["rows"][0]["status"] == "HADIR"
        assert class_report.json()["rows"][0]["session"] == "KBM Matematika"
        assert other_class_report.json()["total"] == 1
        assert other_class_report.json()["rows"][0]["status"] == "IZIN"
        assert exam_report.json()["total"] == 1
        assert exam_report.json()["rows"][0]["status"] == "IZIN"
        assert (
            client.get(
                "/api/v1/reports/daily",
                params={"date_from": "2026-01-02", "date_to": "2026-01-01"},
            ).status_code
            == 422
        )
        assert (
            client.get(
                "/api/v1/reports/exam", params={"exam_period_id": str(uuid4())}
            ).status_code
            == 422
        )

        for path in (
            "/api/v1/reports/daily/export",
            "/api/v1/reports/class/export",
            "/api/v1/reports/exam/export",
        ):
            pdf = client.get(path, params={"format": "pdf"})
            xlsx = client.get(path, params={"format": "xlsx"})
            assert pdf.status_code == xlsx.status_code == 200
            assert pdf.headers["content-type"] == "application/pdf"
            assert pdf.content.startswith(b"%PDF-")
            assert xlsx.headers["content-type"].startswith(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            sheet = load_workbook(BytesIO(xlsx.content), read_only=True).active
            assert sheet["A1"].value == "Tanggal"
            assert sheet["B2"].value == "Siswa Laporan"
            sheet.parent.close()
        assert (
            client.get(
                "/api/v1/reports/daily/export", params={"format": "csv"}
            ).status_code
            == 422
        )

        app.dependency_overrides[current_user] = lambda: teacher_user
        assert client.get("/api/v1/reports/daily").status_code == 403
        assert client.get("/api/v1/reports/exam/export").status_code == 403
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
