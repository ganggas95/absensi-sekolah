from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Role, User
from app.security import hash_password, verify_password

URL = "/api/v1/auth/me/password"


def _env():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = maker()
    user = User(
        id=uuid4(), username="pw-guru", hashed_password=hash_password("lama-123"),
        full_name="Guru Password", role=Role.GURU,
    )
    session.add(user)
    session.commit()

    def override_db():
        db = maker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    token = client.post(
        "/api/v1/auth/login", json={"username": "pw-guru", "password": "lama-123"}
    ).json()["access_token"]
    return client, {"Authorization": f"Bearer {token}"}, maker


def _stored_hash(maker):
    db = maker()
    try:
        return db.query(User).filter(User.username == "pw-guru").one().hashed_password
    finally:
        db.close()


def test_change_password_then_login_with_new_one_only():
    try:
        client, headers, maker = _env()
        r = client.post(URL, headers=headers, json={
            "current_password": "lama-123", "new_password": "baru-456"})
        assert r.status_code == 204
        assert verify_password("baru-456", _stored_hash(maker))
        old = client.post("/api/v1/auth/login",
                          json={"username": "pw-guru", "password": "lama-123"})
        assert old.status_code == 401
        new = client.post("/api/v1/auth/login",
                          json={"username": "pw-guru", "password": "baru-456"})
        assert new.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_wrong_current_password_is_rejected_and_hash_unchanged():
    try:
        client, headers, maker = _env()
        before = _stored_hash(maker)
        r = client.post(URL, headers=headers, json={
            "current_password": "salah-000", "new_password": "baru-456"})
        assert r.status_code == 400
        assert r.json()["detail"] == "Password saat ini salah"
        assert _stored_hash(maker) == before
    finally:
        app.dependency_overrides.clear()


def test_new_password_validation():
    try:
        client, headers, maker = _env()
        before = _stored_hash(maker)
        cases = [
            {"current_password": "lama-123", "new_password": "abc"},
            {"current_password": "lama-123", "new_password": "lama-123"},
            {"current_password": "lama-123", "new_password": "x" * 73},
            {"current_password": "", "new_password": "baru-456"},
            {"new_password": "baru-456"},
        ]
        for body in cases:
            assert client.post(URL, headers=headers, json=body).status_code == 422, body
        assert _stored_hash(maker) == before
    finally:
        app.dependency_overrides.clear()


def test_change_password_requires_authentication():
    try:
        client, _, _ = _env()
        r = client.post(URL, json={
            "current_password": "lama-123", "new_password": "baru-456"})
        assert r.status_code == 401
    finally:
        app.dependency_overrides.clear()
