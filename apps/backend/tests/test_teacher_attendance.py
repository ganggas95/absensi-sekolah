from datetime import date, datetime, time, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.api.teacher_attendance as module
from app.core.config import Settings
from app.db import Base, get_db
from app.deps import current_user
from app.main import app
from app.models import (
    AcademicYear,
    Role,
    Rombel,
    ScheduleEvent,
    ScheduleEventType,
    Subject,
    Teacher,
    TeacherAttendance,
    User,
)

TZ = ZoneInfo("Asia/Makassar")
SCHOOL_IP = "10.0.0.7"
PROXY_IP = "172.18.0.5"
TEST_DAY = date(2090, 1, 3)


def with_peer(ip: str):
    async def wrapper(scope, receive, send):
        if scope["type"] == "http":
            scope = {**scope, "client": (ip, 50000)}
        await app(scope, receive, send)

    return wrapper


class Clock:
    current = datetime(2090, 1, 3, 7, 0, tzinfo=TZ)


class FakeDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        value = Clock.current
        return value.astimezone(tz) if tz else value.replace(tzinfo=None)


def at(hour: int, minute: int = 0):
    Clock.current = datetime(2090, 1, 3, hour, minute, tzinfo=TZ)


@pytest.fixture
def env(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = maker()

    year = AcademicYear(year_name="2090/2091", is_active=True)
    admin = User(
        id=uuid4(), username="ta-admin", hashed_password="x",
        full_name="Admin", role=Role.ADMIN,
    )
    guru_user = User(
        id=uuid4(), username="ta-guru", hashed_password="x",
        full_name="Guru Satu", role=Role.GURU,
    )
    other_user = User(
        id=uuid4(), username="ta-guru2", hashed_password="x",
        full_name="Guru Dua", role=Role.GURU,
    )
    session.add_all([year, admin, guru_user, other_user])
    session.flush()
    teacher = Teacher(user_id=guru_user.id, nip="TA-001")
    other_teacher = Teacher(user_id=other_user.id, nip="TA-002")
    rombel = Rombel(name="VII A", academic_year_id=year.id)
    subject = Subject(code="MTK", name="Matematika")
    session.add_all([teacher, other_teacher, rombel, subject])
    session.flush()
    for start, end in ((time(8, 0), time(9, 0)), (time(10, 0), time(11, 0))):
        session.add(
            ScheduleEvent(
                event_type=ScheduleEventType.KBM,
                title="Matematika",
                academic_year_id=year.id,
                rombel_id=rombel.id,
                subject_id=subject.id,
                teacher_id=teacher.id,
                day_of_week=TEST_DAY.weekday(),
                start_time=start,
                end_time=end,
            )
        )
    session.commit()

    settings = Settings(
        _env_file=None,
        school_network_cidrs="10.0.0.0/24",
        require_school_network=True,
        trusted_proxy_cidrs="172.16.0.0/12",
    )
    monkeypatch.setattr("app.deps.get_settings", lambda: settings)
    monkeypatch.setattr(module, "get_settings", lambda: settings)
    monkeypatch.setattr(module, "datetime", FakeDatetime)
    at(7, 0)

    state = {"user": guru_user}

    def override_db():
        db = maker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[current_user] = lambda: state["user"]

    class Env:
        pass

    e = Env()
    e.session = session
    e.state = state
    e.admin = admin
    e.guru = guru_user
    e.other = other_user
    e.teacher = teacher
    e.client = lambda ip=SCHOOL_IP: TestClient(with_peer(ip))
    yield e
    app.dependency_overrides.clear()
    session.close()


def test_today_lists_schedule_and_allows_check_in_from_school_network(env):
    body = env.client().get("/api/v1/attendance/teacher/today").json()
    assert body["has_schedule"] is True
    assert len(body["schedules"]) == 2
    assert body["first_start"] == "08:00:00"
    assert body["last_end"] == "11:00:00"
    assert body["late_after"] == "08:10:00"
    assert body["on_school_network"] is True
    assert body["client_ip"] == SCHOOL_IP
    assert body["can_check_in"] is True
    assert body["can_check_out"] is False


def test_check_in_on_time_is_hadir_and_idempotent(env):
    at(7, 45)
    client = env.client()
    first = client.post("/api/v1/attendance/teacher/check-in")
    assert first.status_code == 200
    assert first.json()["status"] == "HADIR"
    assert first.json()["already_recorded"] is False
    again = client.post("/api/v1/attendance/teacher/check-in")
    assert again.status_code == 200
    assert again.json()["already_recorded"] is True
    assert env.session.query(TeacherAttendance).count() == 1


def test_check_in_after_tolerance_is_terlambat(env):
    at(8, 11)
    response = env.client().post("/api/v1/attendance/teacher/check-in")
    assert response.status_code == 200
    assert response.json()["status"] == "TERLAMBAT"


def test_check_in_at_tolerance_boundary_is_hadir(env):
    at(8, 10)
    response = env.client().post("/api/v1/attendance/teacher/check-in")
    assert response.json()["status"] == "HADIR"


def test_check_in_rejected_outside_school_network(env):
    response = env.client("8.8.8.8").post("/api/v1/attendance/teacher/check-in")
    assert response.status_code == 403
    assert "WiFi sekolah" in response.json()["detail"]
    assert "IP terdeteksi: 8.8.8.8" in response.json()["detail"]
    assert env.session.query(TeacherAttendance).count() == 0
    today = env.client("8.8.8.8").get("/api/v1/attendance/teacher/today").json()
    assert today["on_school_network"] is False
    assert "IP terdeteksi: 8.8.8.8" in today["message"]


def test_spoofed_forwarded_header_ignored_from_untrusted_peer(env):
    response = env.client("8.8.8.8").post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Real-IP": SCHOOL_IP}
    )
    assert response.status_code == 403


def test_forwarded_header_trusted_from_proxy(env):
    ok = env.client(PROXY_IP).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Real-IP": SCHOOL_IP}
    )
    assert ok.status_code == 200
    assert ok.json()["already_recorded"] is False


def test_forwarded_outside_ip_from_proxy_is_rejected(env):
    response = env.client(PROXY_IP).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Real-IP": "8.8.8.8"}
    )
    assert response.status_code == 403


DOCKER_GATEWAY = "192.168.65.1"


def _use_settings(monkeypatch, **values):
    # _env_file=None: tes tidak boleh bergantung pada .env lokal developer.
    values.setdefault("school_network_cidrs", "")
    custom = Settings(_env_file=None, trusted_proxy_cidrs="172.16.0.0/12", **values)
    monkeypatch.setattr("app.deps.get_settings", lambda: custom)
    monkeypatch.setattr(module, "get_settings", lambda: custom)


def test_network_derived_from_host_ip_setting(env, monkeypatch):
    _use_settings(monkeypatch, school_host_ip="192.168.8.10", school_host_prefix=24)
    ok = env.client(DOCKER_GATEWAY).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Device-Ip": "192.168.8.77"}
    )
    assert ok.status_code == 200
    assert env.session.query(TeacherAttendance).one().check_in_ip == "192.168.8.77"


def test_device_in_other_subnet_than_host_is_rejected(env, monkeypatch):
    _use_settings(monkeypatch, school_host_ip="192.168.8.10", school_host_prefix=24)
    response = env.client(DOCKER_GATEWAY).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Device-Ip": "192.168.9.5"}
    )
    assert response.status_code == 403
    assert "192.168.9.5" in response.json()["detail"]


def test_network_derived_from_private_host_header(env, monkeypatch):
    _use_settings(monkeypatch)
    client = env.client(DOCKER_GATEWAY)
    ok = client.post(
        "/api/v1/attendance/teacher/check-in",
        headers={"Host": "192.168.8.10:80", "X-Device-Ip": "192.168.8.77"},
    )
    assert ok.status_code == 200
    other = env.client(DOCKER_GATEWAY).get(
        "/api/v1/attendance/teacher/today",
        headers={"Host": "192.168.8.10", "X-Device-Ip": "10.5.5.5"},
    ).json()
    assert other["on_school_network"] is False


def test_hostname_host_header_gives_no_network_and_rejects(env, monkeypatch):
    _use_settings(monkeypatch)
    response = env.client(DOCKER_GATEWAY).post(
        "/api/v1/attendance/teacher/check-in",
        headers={"Host": "intranet.bca.local", "X-Device-Ip": "192.168.8.77"},
    )
    assert response.status_code == 403


def test_public_host_header_is_not_used_as_school_network(env, monkeypatch):
    _use_settings(monkeypatch)
    response = env.client(DOCKER_GATEWAY).post(
        "/api/v1/attendance/teacher/check-in",
        headers={"Host": "8.8.8.8", "X-Device-Ip": "8.8.8.50"},
    )
    assert response.status_code == 403


def test_explicit_cidrs_take_priority_over_host_ip(env, monkeypatch):
    _use_settings(
        monkeypatch, school_network_cidrs="10.0.0.0/24", school_host_ip="192.168.8.10"
    )
    response = env.client(DOCKER_GATEWAY).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Device-Ip": "192.168.8.77"}
    )
    assert response.status_code == 403


def test_device_ip_header_trusted_when_server_sees_private_address(env):
    # Docker Desktop: server hanya melihat IP gateway, aplikasi melaporkan IP WiFi.
    response = env.client(DOCKER_GATEWAY).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Device-Ip": SCHOOL_IP}
    )
    assert response.status_code == 200
    record = env.session.query(TeacherAttendance).one()
    assert record.check_in_ip == SCHOOL_IP


def test_device_ip_header_outside_school_network_is_rejected(env):
    response = env.client(DOCKER_GATEWAY).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Device-Ip": "192.168.99.5"}
    )
    assert response.status_code == 403
    assert "192.168.99.5" in response.json()["detail"]


def test_device_ip_header_ignored_when_server_sees_public_address(env):
    # Request dari internet tidak boleh memakai header laporan perangkat.
    response = env.client("8.8.8.8").post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Device-Ip": SCHOOL_IP}
    )
    assert response.status_code == 403
    assert "8.8.8.8" in response.json()["detail"]


def test_device_ip_header_ignored_when_forwarded_ip_is_public(env):
    response = env.client(PROXY_IP).post(
        "/api/v1/attendance/teacher/check-in",
        headers={"X-Real-IP": "8.8.8.8", "X-Device-Ip": SCHOOL_IP},
    )
    assert response.status_code == 403


def test_invalid_device_ip_header_falls_back_to_seen_address(env):
    response = env.client(DOCKER_GATEWAY).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Device-Ip": "bukan-ip"}
    )
    assert response.status_code == 403
    assert DOCKER_GATEWAY in response.json()["detail"]


def test_garbage_forwarded_header_falls_back_to_peer(env):
    response = env.client(PROXY_IP).post(
        "/api/v1/attendance/teacher/check-in", headers={"X-Real-IP": "not-an-ip"}
    )
    assert response.status_code == 403


def test_check_in_requires_schedule_today(env):
    env.state["user"] = env.other
    response = env.client().post("/api/v1/attendance/teacher/check-in")
    assert response.status_code == 422
    assert "Tidak ada jadwal" in response.json()["detail"]
    today = env.client().get("/api/v1/attendance/teacher/today").json()
    assert today["has_schedule"] is False
    assert today["can_check_in"] is False


def test_check_in_closed_after_last_class_ended(env):
    at(11, 30)
    response = env.client().post("/api/v1/attendance/teacher/check-in")
    assert response.status_code == 422
    assert "ditutup" in response.json()["detail"]


def test_admin_cannot_use_teacher_endpoints(env):
    env.state["user"] = env.admin
    assert env.client().post("/api/v1/attendance/teacher/check-in").status_code == 403
    assert env.client().get("/api/v1/attendance/teacher/today").status_code == 403


def test_check_out_requires_check_in(env):
    at(11, 5)
    response = env.client().post("/api/v1/attendance/teacher/check-out")
    assert response.status_code == 422
    assert "belum absen datang" in response.json()["detail"]


def test_check_out_blocked_before_last_class_ends(env):
    at(7, 50)
    client = env.client()
    client.post("/api/v1/attendance/teacher/check-in")
    at(10, 30)
    response = client.post("/api/v1/attendance/teacher/check-out")
    assert response.status_code == 422
    assert "11:00" in response.json()["detail"]


def test_full_day_check_in_then_check_out_is_idempotent(env):
    at(7, 50)
    client = env.client()
    assert client.post("/api/v1/attendance/teacher/check-in").status_code == 200
    at(11, 5)
    today = client.get("/api/v1/attendance/teacher/today").json()
    assert today["can_check_out"] is True
    out = client.post("/api/v1/attendance/teacher/check-out")
    assert out.status_code == 200
    assert out.json()["check_out_time"] is not None
    again = client.post("/api/v1/attendance/teacher/check-out")
    assert again.json()["already_recorded"] is True
    record = env.session.query(TeacherAttendance).one()
    assert record.check_in_ip == SCHOOL_IP
    assert record.check_out_ip == SCHOOL_IP
    done = client.get("/api/v1/attendance/teacher/today").json()
    assert done["can_check_in"] is False
    assert done["can_check_out"] is False


def test_check_out_rejected_outside_school_network(env):
    at(7, 50)
    env.client().post("/api/v1/attendance/teacher/check-in")
    at(11, 5)
    response = env.client("8.8.8.8").post("/api/v1/attendance/teacher/check-out")
    assert response.status_code == 403


def test_records_admin_only_with_filters(env):
    at(8, 30)
    env.client().post("/api/v1/attendance/teacher/check-in")

    env.state["user"] = env.guru
    assert env.client().get("/api/v1/attendance/teacher/records").status_code == 403

    env.state["user"] = env.admin
    client = env.client()
    rows = client.get("/api/v1/attendance/teacher/records").json()
    assert len(rows) == 1
    assert rows[0]["teacher_name"] == "Guru Satu"
    assert rows[0]["nip"] == "TA-001"
    assert rows[0]["status"] == "TERLAMBAT"

    assert client.get(
        "/api/v1/attendance/teacher/records",
        params={"status": "HADIR"},
    ).json() == []
    assert client.get(
        "/api/v1/attendance/teacher/records",
        params={"start_date": "2090-01-04"},
    ).json() == []
    assert len(client.get(
        "/api/v1/attendance/teacher/records",
        params={"teacher_id": str(env.teacher.id), "start_date": "2090-01-03",
                "end_date": "2090-01-03"},
    ).json()) == 1


def test_network_check_can_be_disabled_for_development(env, monkeypatch):
    dev = Settings(_env_file=None, require_school_network=False)
    monkeypatch.setattr("app.deps.get_settings", lambda: dev)
    response = env.client("8.8.8.8").post("/api/v1/attendance/teacher/check-in")
    assert response.status_code == 200


def test_empty_school_cidr_list_rejects_everyone(env, monkeypatch):
    empty = Settings(_env_file=None, school_network_cidrs="", require_school_network=True)
    monkeypatch.setattr("app.deps.get_settings", lambda: empty)
    response = env.client(SCHOOL_IP).post("/api/v1/attendance/teacher/check-in")
    assert response.status_code == 403
