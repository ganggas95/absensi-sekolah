"""Regression tests for persisted, per-schedule KBM attendance sessions.

The bug: opening the attendance page only changed client state. The database
only had one row per student and date, so a second teacher entering the same
rombel on the same day saw (and was blocked by) the previous teacher's records.
"""

from datetime import datetime, time
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.deps import current_user
from app.main import app
from app.models import (
    AcademicYear,
    DailyAttendance,
    Role,
    Rombel,
    ScheduleEvent,
    ScheduleEventType,
    Student,
    Subject,
    Teacher,
    User,
)

TIMEZONE = ZoneInfo("Asia/Makassar")


def _user(username: str, full_name: str, role: Role) -> User:
    return User(
        id=uuid4(),
        username=username,
        hashed_password="unused",
        full_name=full_name,
        role=role,
    )


def test_sessions_are_persisted_and_isolated_per_schedule_and_teacher():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    today = datetime.now(TIMEZONE).date()
    year = AcademicYear(year_name="2026/2027", is_active=True)
    subject = Subject(code="MAT", name="Matematika")
    rombel = Rombel(name="Kelas 7A", academic_year=year)
    teacher_a_user = _user("guru-a", "Guru A", Role.GURU)
    teacher_b_user = _user("guru-b", "Guru B", Role.GURU)
    admin_user = _user("admin-sesi", "Admin", Role.ADMIN)
    session.add_all([year, subject, rombel, teacher_a_user, teacher_b_user, admin_user])
    session.flush()
    teacher_a = Teacher(user_id=teacher_a_user.id)
    teacher_b = Teacher(user_id=teacher_b_user.id)
    session.add_all([teacher_a, teacher_b])
    session.flush()
    schedule_a = ScheduleEvent(
        event_type=ScheduleEventType.KBM,
        title="Matematika Pagi",
        academic_year_id=year.id,
        rombel_id=rombel.id,
        subject_id=subject.id,
        teacher_id=teacher_a.id,
        day_of_week=today.weekday(),
        start_time=time(0, 0),
        end_time=time(23, 59),
    )
    schedule_b = ScheduleEvent(
        event_type=ScheduleEventType.KBM,
        title="Matematika Siang",
        academic_year_id=year.id,
        rombel_id=rombel.id,
        subject_id=subject.id,
        teacher_id=teacher_b.id,
        day_of_week=today.weekday(),
        start_time=time(0, 0),
        end_time=time(23, 59),
    )
    student = Student(nisn="SESI-1", full_name="Siswa Sesi", rombel_id=rombel.id)
    session.add_all([schedule_a, schedule_b, student])
    session.commit()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    try:
        app.dependency_overrides[current_user] = lambda: teacher_a_user
        opened_a = client.post(
            "/api/v1/attendance/daily/sessions/open",
            json={"schedule_event_id": str(schedule_a.id)},
        )
        assert opened_a.status_code == 200
        session_a_id = opened_a.json()["id"]
        assert opened_a.json()["is_open"] is True

        recorded_a = client.post(
            "/api/v1/attendance/daily/record",
            json={"session_id": session_a_id, "id_siswa": str(student.id)},
        )
        assert recorded_a.status_code == 200
        assert recorded_a.json()["schedule_event_id"] == str(schedule_a.id)
        assert recorded_a.json()["already_recorded"] is False

        # Reloading the page restores the persisted session instead of a new one.
        restored_a = client.get(
            "/api/v1/attendance/daily/sessions",
            params={"schedule_event_id": str(schedule_a.id)},
        )
        assert [item["id"] for item in restored_a.json()] == [session_a_id]

        # Teacher B only sees their own schedules/sessions, never teacher A's.
        app.dependency_overrides[current_user] = lambda: teacher_b_user
        leaked_sessions = client.get("/api/v1/attendance/daily/sessions")
        assert leaked_sessions.json() == []
        leaked_logs = client.get("/api/v1/attendance/daily")
        assert leaked_logs.json() == []
        foreign_session_logs = client.get(
            "/api/v1/attendance/daily", params={"session_id": session_a_id}
        )
        assert foreign_session_logs.status_code == 403
        foreign_record = client.post(
            "/api/v1/attendance/daily/record",
            json={"session_id": session_a_id, "id_siswa": str(student.id)},
        )
        assert foreign_record.status_code == 403

        opened_b = client.post(
            "/api/v1/attendance/daily/sessions/open",
            json={"schedule_event_id": str(schedule_b.id)},
        )
        assert opened_b.status_code == 200
        session_b_id = opened_b.json()["id"]
        assert session_b_id != session_a_id
        # The other teacher's session starts empty for the very same student.
        assert (
            client.get(
                "/api/v1/attendance/daily", params={"session_id": session_b_id}
            ).json()
            == []
        )
        recorded_b = client.post(
            "/api/v1/attendance/daily/record",
            json={"session_id": session_b_id, "id_siswa": str(student.id)},
        )
        assert recorded_b.status_code == 200
        assert recorded_b.json()["already_recorded"] is False
        assert recorded_b.json()["schedule_event_id"] == str(schedule_b.id)

        # A repeated scan is only a duplicate inside the same session.
        duplicate_b = client.post(
            "/api/v1/attendance/daily/record",
            json={"session_id": session_b_id, "id_siswa": str(student.id)},
        )
        assert duplicate_b.json()["already_recorded"] is True
        assert session.query(DailyAttendance).count() == 2

        app.dependency_overrides[current_user] = lambda: teacher_a_user
        logs_a = client.get(
            "/api/v1/attendance/daily", params={"session_id": session_a_id}
        )
        assert [row["student_id"] for row in logs_a.json()] == [str(student.id)]

        app.dependency_overrides[current_user] = lambda: admin_user
        admin_sessions = client.get("/api/v1/attendance/daily/sessions")
        assert {item["id"] for item in admin_sessions.json()} == {
            session_a_id,
            session_b_id,
        }
        assert all(item["is_open"] for item in admin_sessions.json())
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_closed_session_rejects_records_until_reopened():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    today = datetime.now(TIMEZONE).date()
    year = AcademicYear(year_name="2026/2028", is_active=True)
    subject = Subject(code="IPA", name="IPA")
    rombel = Rombel(name="Kelas 8A", academic_year=year)
    teacher_user = _user("guru-c", "Guru C", Role.GURU)
    session.add_all([year, subject, rombel, teacher_user])
    session.flush()
    teacher = Teacher(user_id=teacher_user.id)
    session.add(teacher)
    session.flush()
    schedule = ScheduleEvent(
        event_type=ScheduleEventType.KBM,
        title="IPA",
        academic_year_id=year.id,
        rombel_id=rombel.id,
        subject_id=subject.id,
        teacher_id=teacher.id,
        day_of_week=today.weekday(),
        start_time=time(0, 0),
        end_time=time(23, 59),
    )
    student = Student(full_name="Siswa IPA", rombel_id=rombel.id)
    session.add_all([schedule, student])
    session.commit()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[current_user] = lambda: teacher_user
    client = TestClient(app)
    try:
        opened = client.post(
            "/api/v1/attendance/daily/sessions/open",
            json={"schedule_event_id": str(schedule.id)},
        ).json()
        closed = client.post(f"/api/v1/attendance/daily/sessions/{opened['id']}/close")
        assert closed.status_code == 200
        assert closed.json()["is_open"] is False
        rejected = client.post(
            "/api/v1/attendance/daily/record",
            json={"session_id": opened["id"], "id_siswa": str(student.id)},
        )
        assert rejected.status_code == 422
        assert rejected.json()["detail"] == "Sesi absensi sudah ditutup"

        reopened = client.post(
            "/api/v1/attendance/daily/sessions/open",
            json={"schedule_event_id": str(schedule.id)},
        )
        assert reopened.status_code == 200
        assert reopened.json()["id"] == opened["id"]
        assert reopened.json()["is_open"] is True
        accepted = client.post(
            "/api/v1/attendance/daily/record",
            json={"session_id": opened["id"], "id_siswa": str(student.id)},
        )
        assert accepted.status_code == 200
        assert accepted.json()["status"] in {"HADIR", "TERLAMBAT"}
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
