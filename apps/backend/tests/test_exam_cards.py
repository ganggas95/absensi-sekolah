from datetime import date, datetime, time, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import attendance as attendance_api
from app.db import Base, get_db
from app.deps import current_user, require_admin
from app.main import app
from app.models import (
    AcademicYear,
    AttendanceConfig,
    DailyAttendance,
    AcademicYear,
    EventAttendance,
    ExamPeriod,
    ExamPeriodType,
    Rombel,
    Role,
    ScheduleBreak,
    ScheduleEvent,
    ScheduleEventType,
    Student,
    Subject,
    Teacher,
    TeacherSubject,
    User,
)


def test_exam_cards_and_attendance_flow():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = test_session()

    academic_year = AcademicYear(year_name="2026/2027", is_active=True)
    subject = Subject(code="MAT", name="Matematika")
    rombel = Rombel(name="Kelas 7A", academic_year=academic_year)
    other_rombel = Rombel(name="Kelas 7B")
    session.add_all([academic_year, subject, rombel, other_rombel])
    session.flush()
    user = User(
        id=uuid4(),
        username="tester",
        hashed_password="unused",
        full_name="Pengawas",
        role=Role.ADMIN,
    )
    supervisor_user = User(
        id=uuid4(),
        username="supervisor",
        hashed_password="unused",
        full_name="Guru Pengawas",
        role=Role.GURU,
    )
    unrelated_user = User(
        id=uuid4(),
        username="unassigned",
        hashed_password="unused",
        full_name="Guru Lain",
        role=Role.GURU,
    )
    session.add_all([user, supervisor_user, unrelated_user])
    session.flush()
    period = ExamPeriod(
        academic_year_id=academic_year.id,
        period_type=ExamPeriodType.GANJIL,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 11, 30),
    )
    session.add(period)
    session.flush()
    supervisor = Teacher(user_id=supervisor_user.id)
    session.add(supervisor)
    session.flush()
    event = ScheduleEvent(
        event_type=ScheduleEventType.EXAM,
        title="Ujian Tengah Semester",
        academic_year_id=academic_year.id,
        rombel_id=rombel.id,
        subject_id=subject.id,
        teacher_id=supervisor.id,
        exam_period_id=period.id,
        schedule_date=date(2026, 10, 31),
        start_time=time(8, 0),
        end_time=time(10, 0),
    )
    student = Student(full_name="Siswa Satu", nisn=None, rombel_id=rombel.id)
    second_student = Student(full_name="Siswa Dua", rombel_id=rombel.id)
    other_student = Student(full_name="Siswa Lain", rombel_id=other_rombel.id)
    session.add_all([event, student, second_student, other_student])
    session.commit()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[current_user] = lambda: user
    app.dependency_overrides[require_admin] = lambda: user
    client = TestClient(app)
    try:
        updated_event = client.put(
            f"/api/v1/schedules/events/{event.id}",
            json={"title": "Ujian Tengah Semester Revisi", "description": "Revisi"},
        )
        event_path = f"/api/v1/attendance/event/{event.id}"
        preview = client.get(
            f"/api/v1/cards/exams/preview/{period.id}/{rombel.id}/{student.id}"
        )
        single_export = client.get(
            f"/api/v1/cards/exams/export/{period.id}/{rombel.id}/{student.id}"
        )
        bulk_export = client.post(
            "/api/v1/cards/exams/batch-print",
            json={"exam_period_id": str(period.id), "rombel_id": str(rombel.id)},
        )
        attendance_before = client.get(event_path)
        first_scan = client.post(
            "/api/v1/attendance/event/record",
            json={"schedule_event_id": str(event.id), "student_id": str(student.id)},
        )
        duplicate_scan = client.post(
            "/api/v1/attendance/event/record",
            json={"schedule_event_id": str(event.id), "student_id": str(student.id)},
        )
        attendance_after = client.get(event_path)
        ineligible_preview = client.get(
            f"/api/v1/cards/exams/preview/{period.id}/{rombel.id}/{other_student.id}"
        )
        no_year_preview = client.get(
            f"/api/v1/cards/exams/preview/{period.id}/{other_rombel.id}/{other_student.id}"
        )
        ineligible_scan = client.post(
            "/api/v1/attendance/event/record",
            json={
                "schedule_event_id": str(event.id),
                "student_id": str(other_student.id),
            },
        )
        exam_payload = {
            "event_type": "EXAM",
            "title": "Ujian Susulan",
            "academic_year_id": str(academic_year.id),
            "exam_period_id": str(period.id),
            "rombel_id": str(rombel.id),
            "subject_id": str(subject.id),
            "teacher_id": str(supervisor.id),
            "schedule_date": "2026-11-02",
            "start_time": "08:00:00",
            "end_time": "10:00:00",
        }
        unrelated_subject_teacher = client.post(
            "/api/v1/schedules/events", json=exam_payload
        )
        out_of_period_payload = {
            **exam_payload,
            "title": "Ujian di luar periode",
            "schedule_date": "2026-12-01",
        }
        out_of_period_schedule = client.post(
            "/api/v1/schedules/events", json=out_of_period_payload
        )
        wrong_year_rombel_schedule = client.post(
            "/api/v1/schedules/events",
            json={**exam_payload, "rombel_id": str(other_rombel.id)},
        )
        next_period_payload = {
            "academic_year_id": str(academic_year.id),
            "period_type": "GENAP",
            "start_date": "2027-03-01",
            "end_date": "2027-03-31",
        }
        created_period = client.post(
            "/api/v1/schedules/exam-periods", json=next_period_payload
        )
        listed_periods = client.get(
            "/api/v1/schedules/exam-periods",
            params={"academic_year_id": str(academic_year.id)},
        )
        invalid_period_range = client.post(
            "/api/v1/schedules/exam-periods",
            json={
                **next_period_payload,
                "period_type": "MID_SEMESTER",
                "start_date": "2027-04-01",
            },
        )
        kbm_payload = {
            **exam_payload,
            "event_type": "KBM",
            "title": "Jadwal KBM",
            "schedule_date": None,
            "day_of_week": 0,
            "exam_period_id": None,
        }
        unqualified_kbm_teacher = client.post(
            "/api/v1/schedules/events", json=kbm_payload
        )
        duplicate_period = client.post(
            "/api/v1/schedules/exam-periods",
            json={
                "academic_year_id": str(academic_year.id),
                "period_type": "GANJIL",
                "start_date": "2026-10-01",
                "end_date": "2026-11-30",
            },
        )
        conflicting_period_update = client.put(
            f"/api/v1/schedules/exam-periods/{period.id}",
            json={"end_date": "2026-10-15"},
        )
        used_period_type_update = client.put(
            f"/api/v1/schedules/exam-periods/{period.id}",
            json={"period_type": "GENAP"},
        )
        linked_period_delete = client.delete(
            f"/api/v1/schedules/exam-periods/{period.id}"
        )
        linked_year_delete = client.delete(
            f"/api/v1/management/academic-years/{academic_year.id}"
        )
        app.dependency_overrides[current_user] = lambda: supervisor_user
        supervisor_events = client.get("/api/v1/schedules/events?event_type=EXAM")
        supervisor_rombels = client.get("/api/v1/management/rombels")
        supervisor_students = client.get(
            "/api/v1/management/students",
            params={"rombel_id": str(rombel.id), "q": "Siswa Satu"},
        )
        supervisor_scan = client.post(
            "/api/v1/attendance/event/record",
            json={
                "schedule_event_id": str(event.id),
                "student_id": str(second_student.id),
            },
        )
        supervisor_roster = client.get(event_path)
        app.dependency_overrides[current_user] = lambda: unrelated_user
        unauthorized_scan = client.post(
            "/api/v1/attendance/event/record",
            json={
                "schedule_event_id": str(event.id),
                "student_id": str(second_student.id),
            },
        )
        unauthorized_roster = client.get(event_path)

        assert preview.status_code == 200
        assert updated_event.status_code == 200
        assert updated_event.json()["title"] == "Ujian Tengah Semester Revisi"
        assert updated_event.json()["description"] == "Revisi"
        assert preview.json()["nisn"] is None
        assert preview.json()["academic_year_name"] == academic_year.year_name
        assert preview.json()["exam_name"] == "Semester Ganjil"
        assert "exam_title" not in preview.json()
        assert "subject_name" not in preview.json()
        assert single_export.status_code == 200 and single_export.content.startswith(
            b"%PDF-"
        )
        assert b"/Count 2" in single_export.content
        assert bulk_export.status_code == 200 and bulk_export.content.startswith(
            b"%PDF-"
        )
        assert len(attendance_before.json()) == 2
        assert all(item["status"] is None for item in attendance_before.json())
        assert first_scan.status_code == 200 and first_scan.json()["status"] == "HADIR"
        assert (
            duplicate_scan.status_code == 200
            and duplicate_scan.json()["already_recorded"] is True
        )
        assert len(attendance_after.json()) == 2
        assert (
            next(
                item
                for item in attendance_after.json()
                if item["student_id"] == str(student.id)
            )["status"]
            == "HADIR"
        )
        assert ineligible_preview.status_code == 404
        assert no_year_preview.status_code == 422
        assert ineligible_scan.status_code == 422
        assert unrelated_subject_teacher.status_code == 201
        assert out_of_period_schedule.status_code == 422
        assert wrong_year_rombel_schedule.status_code == 422
        assert created_period.status_code == 201
        assert len(listed_periods.json()) == 2
        assert invalid_period_range.status_code == 422
        assert unqualified_kbm_teacher.status_code == 422
        assert duplicate_period.status_code == 409
        assert conflicting_period_update.status_code == 409
        assert used_period_type_update.status_code == 409
        assert linked_period_delete.status_code == 409
        assert linked_year_delete.status_code == 409
        assert len(supervisor_events.json()) == 2
        assert supervisor_rombels.status_code == 200
        assert any(item["id"] == str(rombel.id) for item in supervisor_rombels.json())
        assert [item["full_name"] for item in supervisor_students.json()] == [
            "Siswa Satu"
        ]
        assert (
            supervisor_scan.status_code == 200
            and supervisor_scan.json()["already_recorded"] is False
        )
        assert len(supervisor_roster.json()) == 2
        assert unauthorized_scan.status_code == 403
        assert unauthorized_roster.status_code == 403
        assert session.query(EventAttendance).count() == 2
        supervisor_record = (
            session.query(EventAttendance)
            .filter(EventAttendance.student_id == second_student.id)
            .one()
        )
        assert supervisor_record.recorded_by == supervisor_user.id
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_exam_card_and_attendance_endpoints_require_authentication():
    client = TestClient(app)
    period_id = uuid4()
    rombel_id = uuid4()
    student_id = uuid4()

    assert client.get(f"/api/v1/attendance/event/{rombel_id}").status_code == 401
    assert (
        client.get(
            f"/api/v1/cards/exams/preview/{period_id}/{rombel_id}/{student_id}"
        ).status_code
        == 401
    )
    assert client.get("/api/v1/schedules/exam-periods").status_code == 401
    assert (
        client.post(
            "/api/v1/attendance/event/record",
            json={"schedule_event_id": str(rombel_id), "student_id": str(student_id)},
        ).status_code
        == 401
    )


def test_shared_schedule_accepts_multiple_rombels_and_checks_every_conflict():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = test_session()
    year = AcademicYear(year_name="2026/2027", is_active=True)
    first = Rombel(name="Kelas 8", academic_year=year)
    second = Rombel(name="Kelas 9", academic_year=year)
    third = Rombel(name="Kelas 7", academic_year=year)
    subject = Subject(code="OR", name="Olahraga")
    admin = User(
        username="shared-schedule-admin",
        hashed_password="unused",
        full_name="Admin",
        role=Role.ADMIN,
    )
    teachers = [
        User(
            username=f"shared-schedule-teacher-{index}",
            hashed_password="unused",
            full_name=f"Guru {index}",
            role=Role.GURU,
        )
        for index in range(2)
    ]
    session.add_all([year, subject, first, second, third, admin, *teachers])
    session.flush()
    teacher_profiles = [Teacher(user_id=user.id) for user in teachers]
    for profile in teacher_profiles:
        profile.subjects.append(subject)
    session.add_all(teacher_profiles)
    session.commit()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[current_user] = lambda: admin
    app.dependency_overrides[require_admin] = lambda: admin
    client = TestClient(app)
    try:
        payload = {
            "event_type": "KBM",
            "title": "Olahraga Gabungan",
            "academic_year_id": str(year.id),
            "rombel_id": str(first.id),
            "rombel_ids": [str(first.id), str(second.id)],
            "subject_id": str(subject.id),
            "teacher_id": str(teacher_profiles[0].id),
            "day_of_week": 1,
            "start_time": "08:00:00",
            "end_time": "09:00:00",
        }
        created = client.post("/api/v1/schedules/events", json=payload)
        additional = client.post(
            "/api/v1/schedules/events",
            json={
                **payload,
                "title": "Olahraga Kelas 7",
                "rombel_id": str(third.id),
                "rombel_ids": [str(third.id)],
                "teacher_id": str(teacher_profiles[1].id),
                "day_of_week": 2,
            },
        )
        exam_period = client.post(
            "/api/v1/schedules/exam-periods",
            json={
                "academic_year_id": str(year.id),
                "period_type": "GANJIL",
                "start_date": "2026-11-01",
                "end_date": "2026-11-30",
            },
        )
        exam = client.post(
            "/api/v1/schedules/events",
            json={
                "event_type": "EXAM",
                "title": "Ujian Olahraga",
                "academic_year_id": str(year.id),
                "exam_period_id": exam_period.json()["id"],
                "rombel_id": str(first.id),
                "subject_id": str(subject.id),
                "teacher_id": str(teacher_profiles[0].id),
                "schedule_date": "2026-11-03",
                "start_time": "08:00:00",
                "end_time": "09:00:00",
            },
        )
        filtered = client.get(
            "/api/v1/schedules/events",
            params={"event_type": "KBM", "rombel_id": str(second.id)},
        )
        first_page = client.get(
            "/api/v1/schedules/events",
            params={"event_type": "KBM", "page": 1, "limit": 1},
        )
        second_page = client.get(
            "/api/v1/schedules/events",
            params={"event_type": "KBM", "page": 2, "limit": 1},
        )
        weekday_filtered_exam = client.get(
            "/api/v1/schedules/events",
            params={"event_type": "EXAM", "day_of_week": 1},
        )
        same_class_conflict = client.post(
            "/api/v1/schedules/events",
            json={
                **payload,
                "title": "Bentrok Kelas",
                "rombel_id": str(first.id),
                "rombel_ids": [str(first.id)],
                "teacher_id": str(teacher_profiles[1].id),
            },
        )
        same_teacher_conflict = client.post(
            "/api/v1/schedules/events",
            json={
                **payload,
                "title": "Bentrok Guru",
                "rombel_id": str(third.id),
                "rombel_ids": [str(third.id)],
            },
        )
        changed_group = client.put(
            f"/api/v1/schedules/events/{created.json()['id']}",
            json={"rombel_ids": [str(first.id), str(third.id)]},
        )
        deleted_primary = client.delete(f"/api/v1/management/rombels/{first.id}")
        remaining_schedule = client.get(
            "/api/v1/schedules/events",
            params={"rombel_id": str(third.id)},
        )

        assert created.status_code == 201
        assert additional.status_code == 201
        assert exam.status_code == 201
        assert created.json()["rombel_ids"] == [str(first.id), str(second.id)]
        assert [event["id"] for event in filtered.json()] == [created.json()["id"]]
        assert first_page.json()["total"] == 2
        assert first_page.json()["page"] == 1
        assert first_page.json()["limit"] == 1
        assert len(first_page.json()["items"]) == 1
        assert len(second_page.json()["items"]) == 1
        assert second_page.json()["items"][0]["id"] == additional.json()["id"]
        assert [event["id"] for event in weekday_filtered_exam.json()] == [
            exam.json()["id"]
        ]
        assert same_class_conflict.status_code == 409
        assert same_teacher_conflict.status_code == 409
        assert changed_group.status_code == 200
        assert changed_group.json()["rombel_ids"] == [str(first.id), str(third.id)]
        assert deleted_primary.status_code == 204
        assert {event["id"] for event in remaining_schedule.json()} == {
            created.json()["id"],
            additional.json()["id"],
        }
        assert remaining_schedule.json()[0]["rombel_ids"] == [str(third.id)]
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_schedule_breaks_group_days_and_reject_overlaps():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = test_session()
    admin = User(
        username="break-schedule-admin",
        hashed_password="unused",
        full_name="Admin",
        role=Role.ADMIN,
    )
    session.add(admin)
    session.commit()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[current_user] = lambda: admin
    app.dependency_overrides[require_admin] = lambda: admin
    client = TestClient(app)
    try:
        shared_days = client.post(
            "/api/v1/schedules/breaks",
            json={
                "day_of_weeks": [0, 1, 2, 3, 5],
                "start_time": "10:20",
                "end_time": "10:40",
            },
        )
        friday = client.post(
            "/api/v1/schedules/breaks",
            json={
                "day_of_weeks": [4],
                "start_time": "10:00",
                "end_time": "10:20",
            },
        )
        overlap = client.post(
            "/api/v1/schedules/breaks",
            json={
                "day_of_weeks": [2, 4],
                "start_time": "10:10",
                "end_time": "10:30",
            },
        )
        updated = client.put(
            f"/api/v1/schedules/breaks/{friday.json()['id']}",
            json={"day_of_weeks": [4, 6]},
        )
        listed = client.get("/api/v1/schedules/breaks")

        assert shared_days.status_code == 201
        assert shared_days.json()["day_of_weeks"] == [0, 1, 2, 3, 5]
        assert friday.status_code == 201
        assert overlap.status_code == 409
        assert updated.status_code == 200
        assert updated.json()["day_of_weeks"] == [4, 6]
        assert len(listed.json()) == 2
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_daily_attendance_uses_schedule_lateness_and_limits_teacher_to_own_classes(
    monkeypatch,
):
    local_now = datetime.now(ZoneInfo("Asia/Makassar")).replace(
        hour=10, minute=30, second=0, microsecond=0
    )
    frozen_utc_now = local_now.astimezone(timezone.utc)

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is None:
                return frozen_utc_now.replace(tzinfo=None)
            return frozen_utc_now.astimezone(tz)

    monkeypatch.setattr(attendance_api, "datetime", FrozenDateTime)

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = test_session()
    academic_year = AcademicYear(year_name="2026/2027", is_active=True)
    subject = Subject(code="MAT", name="Matematika")
    rombel = Rombel(name="Kelas 7A", academic_year=academic_year)
    other_rombel = Rombel(name="Kelas 7B", academic_year=academic_year)
    unrelated_rombel = Rombel(name="Kelas 7C", academic_year=academic_year)
    session.add_all([academic_year, subject, rombel, other_rombel, unrelated_rombel])
    session.flush()
    teacher_user = User(
        id=uuid4(),
        username="daily-teacher",
        hashed_password="unused",
        full_name="Guru Jadwal",
        role=Role.GURU,
    )
    other_teacher_user = User(
        id=uuid4(),
        username="other-daily-teacher",
        hashed_password="unused",
        full_name="Guru Lain",
        role=Role.GURU,
    )
    admin_user = User(
        id=uuid4(),
        username="daily-admin",
        hashed_password="unused",
        full_name="Admin",
        role=Role.ADMIN,
    )
    session.add_all([teacher_user, other_teacher_user, admin_user])
    session.flush()
    teacher = Teacher(user_id=teacher_user.id)
    other_teacher = Teacher(user_id=other_teacher_user.id)
    session.add_all([teacher, other_teacher])
    session.flush()
    weekday = local_now.weekday()
    teacher_schedule = ScheduleEvent(
        event_type=ScheduleEventType.KBM,
        title="Matematika",
        academic_year_id=academic_year.id,
        rombel_id=rombel.id,
        subject_id=subject.id,
        teacher_id=teacher.id,
        day_of_week=weekday,
        start_time=time(10, 25),
        end_time=time(11, 0),
        additional_rombels=[other_rombel],
    )
    other_schedule = ScheduleEvent(
        event_type=ScheduleEventType.KBM,
        title="Bahasa Indonesia",
        academic_year_id=academic_year.id,
        rombel_id=other_rombel.id,
        subject_id=subject.id,
        teacher_id=other_teacher.id,
        day_of_week=weekday,
        start_time=time(9, 0),
        end_time=time(10, 0),
    )
    student = Student(full_name="Siswa Jadwal", rombel_id=rombel.id)
    other_student = Student(full_name="Siswa Kelas Lain", rombel_id=other_rombel.id)
    fallback_student = Student(full_name="Siswa Tanpa Konfigurasi", rombel_id=rombel.id)
    unrelated_student = Student(
        full_name="Siswa Bukan Peserta", rombel_id=unrelated_rombel.id
    )
    session.add_all(
        [
            teacher_schedule,
            other_schedule,
            student,
            other_student,
            fallback_student,
            unrelated_student,
            AttendanceConfig(
                config_name="Harian",
                check_in_start=time(11, 0),
                check_in_end=time(11, 1),
                check_out_start=time(13, 0),
                check_out_end=time(17, 0),
                late_threshold=time(11, 0),
            ),
        ]
    )
    session.commit()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[current_user] = lambda: teacher_user
    client = TestClient(app)
    try:
        teacher_schedules = client.get("/api/v1/attendance/daily/schedules")
        recorded = client.post(
            "/api/v1/attendance/daily/record",
            json={
                "schedule_event_id": str(teacher_schedule.id),
                "id_siswa": str(student.id),
            },
        )
        teacher_schedule.start_time = time(10, 19)
        session.commit()
        recorded_other_class = client.post(
            "/api/v1/attendance/daily/record",
            json={
                "schedule_event_id": str(teacher_schedule.id),
                "id_siswa": str(other_student.id),
            },
        )
        wrong_class = client.post(
            "/api/v1/attendance/daily/record",
            json={
                "schedule_event_id": str(teacher_schedule.id),
                "id_siswa": str(unrelated_student.id),
            },
        )
        missing_schedule = client.post(
            "/api/v1/attendance/daily/record",
            json={"id_siswa": str(student.id)},
        )
        session.query(AttendanceConfig).delete()
        teacher_schedule.start_time = time(10, 19)
        session.commit()
        recorded_without_config = client.post(
            "/api/v1/attendance/daily/record",
            json={
                "schedule_event_id": str(teacher_schedule.id),
                "id_siswa": str(fallback_student.id),
            },
        )
        app.dependency_overrides[current_user] = lambda: admin_user
        admin_schedules = client.get("/api/v1/attendance/daily/schedules")

        assert [item["id"] for item in teacher_schedules.json()] == [
            str(teacher_schedule.id)
        ]
        assert teacher_schedules.json()[0]["rombel_ids"] == [
            str(rombel.id),
            str(other_rombel.id),
        ]
        assert recorded.status_code == 200
        assert recorded.json()["status"] == "HADIR"
        assert recorded_other_class.status_code == 200
        assert recorded_other_class.json()["status"] == "TERLAMBAT"
        assert recorded_without_config.status_code == 200
        assert recorded_without_config.json()["status"] == "TERLAMBAT"
        assert wrong_class.status_code == 422
        assert missing_schedule.status_code == 422
        assert {item["id"] for item in admin_schedules.json()} == {
            str(teacher_schedule.id),
            str(other_schedule.id),
        }
        assert session.query(DailyAttendance).count() == 3
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
