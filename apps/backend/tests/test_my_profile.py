from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.deps import current_user
from app.main import app
from app.models import Role, Subject, Teacher, User


def _setup():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    maker = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    session = maker()
    guru = User(
        id=uuid4(), username="prof-guru", hashed_password="x",
        full_name="Guru Profil", role=Role.GURU,
    )
    admin = User(
        id=uuid4(), username="prof-admin", hashed_password="x",
        full_name="Admin Profil", role=Role.ADMIN,
    )
    bare = User(
        id=uuid4(), username="prof-bare", hashed_password="x",
        full_name="Guru Tanpa Profil", role=Role.GURU,
    )
    session.add_all([guru, admin, bare])
    session.flush()
    teacher = Teacher(user_id=guru.id, nip="PROF-001", phone="0812")
    teacher.subjects = [
        Subject(code="MTK", name="Matematika"),
        Subject(code="BIN", name="Bahasa Indonesia"),
    ]
    session.add(teacher)
    session.commit()

    def override_db():
        db = maker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    return session, guru, admin, bare, teacher


def _get(user):
    app.dependency_overrides[current_user] = lambda: user
    try:
        return TestClient(app).get("/api/v1/auth/me/profile")
    finally:
        app.dependency_overrides.pop(current_user, None)


def _patch(user, payload):
    app.dependency_overrides[current_user] = lambda: user
    try:
        return TestClient(app).patch("/api/v1/auth/me/profile", json=payload)
    finally:
        app.dependency_overrides.pop(current_user, None)


def test_guru_profile_includes_teacher_data_and_subjects():
    try:
        _, guru, _, _, teacher = _setup()
        body = _get(guru).json()
        assert body["username"] == "prof-guru"
        assert body["full_name"] == "Guru Profil"
        assert body["role"] == "GURU"
        assert body["teacher_id"] == str(teacher.id)
        assert body["nip"] == "PROF-001"
        assert body["phone"] == "0812"
        assert body["subjects"] == ["Bahasa Indonesia", "Matematika"]
        assert "hashed_password" not in body
    finally:
        app.dependency_overrides.clear()


def test_profile_without_teacher_row_has_empty_teacher_fields():
    try:
        _, _, admin, bare, _ = _setup()
        for user in (admin, bare):
            body = _get(user).json()
            assert body["teacher_id"] is None
            assert body["nip"] is None
            assert body["subjects"] == []
    finally:
        app.dependency_overrides.clear()


def test_guru_can_update_own_name_and_contact_details():
    try:
        session, guru, _, _, teacher = _setup()
        response = _patch(
            guru,
            {"full_name": "Nama Baru", "nip": "PROF-002", "phone": "0813"},
        )
        assert response.status_code == 200
        assert response.json()["full_name"] == "Nama Baru"
        assert response.json()["nip"] == "PROF-002"
        assert response.json()["phone"] == "0813"
        session.refresh(guru)
        session.refresh(teacher)
        assert guru.full_name == "Nama Baru"
        assert teacher.nip == "PROF-002"
        assert teacher.phone == "0813"
        assert response.json()["username"] == "prof-guru"
        assert response.json()["subjects"] == ["Bahasa Indonesia", "Matematika"]
    finally:
        app.dependency_overrides.clear()


def test_profile_update_can_clear_teacher_contact_fields():
    try:
        session, guru, _, _, teacher = _setup()
        response = _patch(guru, {"nip": "", "phone": ""})
        assert response.status_code == 200
        assert response.json()["nip"] is None
        assert response.json()["phone"] is None
        session.refresh(teacher)
        assert teacher.nip is None
        assert teacher.phone is None
    finally:
        app.dependency_overrides.clear()


def test_profile_update_rejects_invalid_name_duplicate_nip_and_unknown_fields():
    try:
        session, guru, _, _, _ = _setup()
        other_user = User(
            id=uuid4(), username="another-guru", hashed_password="x",
            full_name="Guru Lain", role=Role.GURU,
        )
        session.add(other_user)
        session.flush()
        session.add(Teacher(user_id=other_user.id, nip="PROF-002"))
        session.commit()
        cases = [
            ({"full_name": " "}, 422),
            ({"full_name": None}, 422),
            ({"nip": "PROF-002"}, 409),
            ({"username": "other-user"}, 422),
        ]
        for payload, expected_status in cases:
            response = _patch(guru, payload)
            assert response.status_code == expected_status, payload
    finally:
        app.dependency_overrides.clear()


def test_contact_update_requires_existing_teacher_profile():
    try:
        _, _, _, bare, _ = _setup()
        response = _patch(bare, {"phone": "0813"})
        assert response.status_code == 404
        assert response.json()["detail"] == "Profil guru tidak ditemukan"
    finally:
        app.dependency_overrides.clear()


def test_profile_update_requires_authentication():
    try:
        _setup()
        assert TestClient(app).patch(
            "/api/v1/auth/me/profile", json={"full_name": "Nama Baru"}
        ).status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_profile_requires_authentication():
    try:
        _setup()
        assert TestClient(app).get("/api/v1/auth/me/profile").status_code == 401
    finally:
        app.dependency_overrides.clear()
