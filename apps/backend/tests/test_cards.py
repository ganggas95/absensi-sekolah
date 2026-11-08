import base64
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.deps import current_user, require_admin
from app.main import app
from app.models import Role, Rombel, Student, User
from app.photo_storage import PHOTO_URL_PREFIX
from app.schemas import StudentCardBatchRequest
from app.services.student_cards import (
    ExamCardDetails,
    LOGO_PATH,
    create_cards_pdf,
    create_qr_data_url,
)
import app.api.students as student_api
import app.photo_storage as photo_storage


def test_student_card_pdf_contains_front_and_back_pages():
    student = Student(id=uuid4(), full_name="Siswa Contoh", nisn="1234567890")

    pdf = create_cards_pdf([student])

    assert LOGO_PATH.is_file()
    assert pdf.startswith(b"%PDF-")
    assert b"/Count 2" in pdf


def test_student_card_qr_is_an_svg_data_url():
    qr_data_url = create_qr_data_url(str(uuid4()))
    svg = base64.b64decode(qr_data_url.removeprefix("data:image/svg+xml;base64,"))

    assert qr_data_url.startswith("data:image/svg+xml;base64,")
    assert b"data:image/png;base64," in svg
    assert base64.b64encode(LOGO_PATH.read_bytes()) in svg


def test_batch_export_requires_exactly_one_filter():
    for filters in ({}, {"student_ids": [str(uuid4())], "rombel_id": str(uuid4())}):
        try:
            StudentCardBatchRequest.model_validate(filters)
        except ValueError:
            continue
        raise AssertionError("A batch export must use exactly one filter.")


def test_student_card_preview_requires_authentication():
    response = TestClient(app).get(f"/api/v1/cards/preview/{uuid4()}")

    assert response.status_code == 401


def test_card_preview_and_exports():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = test_session()
    rombel = Rombel(name="Kelas 7A")
    session.add(rombel)
    session.flush()
    students = [
        Student(full_name="Siswa Satu", nisn="1111111111", rombel_id=rombel.id),
        Student(full_name="Siswa Dua", nisn="2222222222", rombel_id=rombel.id),
    ]
    session.add_all(students)
    session.commit()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[current_user] = lambda: None
    client = TestClient(app)
    try:
        preview = client.get(f"/api/v1/cards/preview/{students[0].id}")
        single_export = client.get(f"/api/v1/cards/export/{students[0].id}")
        selected_export = client.post(
            "/api/v1/cards/batch-print",
            json={"student_ids": [str(student.id) for student in students]},
        )
        class_export = client.post(
            "/api/v1/cards/batch-print",
            json={"rombel_id": str(rombel.id)},
        )
        invalid_export = client.post("/api/v1/cards/batch-print", json={})

        assert preview.status_code == 200
        assert preview.json()["qr_data_url"].startswith("data:image/svg+xml;base64,")
        for response in (single_export, selected_export, class_export):
            assert response.status_code == 200
            assert response.headers["content-type"] == "application/pdf"
            assert response.content.startswith(b"%PDF-")
        assert b"/Count 4" in selected_export.content
        assert invalid_export.status_code == 422
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_student_photo_upload_replacement_and_card_pdf(monkeypatch, tmp_path):
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
        username="photo-admin",
        hashed_password="unused",
        full_name="Admin Foto",
        role=Role.ADMIN,
    )
    teacher = User(
        id=uuid4(),
        username="photo-teacher",
        hashed_password="unused",
        full_name="Guru Foto",
        role=Role.GURU,
    )
    student = Student(full_name="Siswa Foto")
    session.add_all([admin, teacher, student])
    session.commit()
    monkeypatch.setattr(student_api, "PHOTO_STORAGE_DIR", tmp_path)
    monkeypatch.setattr(photo_storage, "PHOTO_STORAGE_DIR", tmp_path)

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[current_user] = lambda: admin
    app.dependency_overrides[require_admin] = lambda: admin
    client = TestClient(app)

    def png_bytes(color: str) -> bytes:
        image = Image.new("RGB", (40, 30), color)
        output = BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    try:
        uploaded = client.post(
            f"/api/v1/management/students/{student.id}/photo",
            files={"photo": ("portrait.png", png_bytes("red"), "image/png")},
        )
        assert uploaded.status_code == 200
        first_url = uploaded.json()["photo_url"]
        assert first_url.startswith(PHOTO_URL_PREFIX)
        first_id = first_url.removeprefix(PHOTO_URL_PREFIX)
        first_path = tmp_path / f"{first_id}.jpg"
        assert first_path.is_file()
        photo_response = client.get(f"/api/v1{first_url}")
        assert photo_response.status_code == 200
        assert photo_response.headers["content-type"] == "image/jpeg"
        assert photo_response.content.startswith(b"\xff\xd8")
        card_preview = client.get(f"/api/v1/cards/preview/{student.id}")
        assert card_preview.status_code == 200
        assert card_preview.json()["photo_url"] == first_url

        app.dependency_overrides[current_user] = lambda: teacher
        app.dependency_overrides.pop(require_admin)
        forbidden_upload = client.post(
            f"/api/v1/management/students/{student.id}/photo",
            files={"photo": ("portrait.png", png_bytes("green"), "image/png")},
        )
        assert forbidden_upload.status_code == 403
        app.dependency_overrides[current_user] = lambda: admin
        app.dependency_overrides[require_admin] = lambda: admin

        invalid = client.post(
            f"/api/v1/management/students/{student.id}/photo",
            files={"photo": ("not-image.png", b"not an image", "image/png")},
        )
        assert invalid.status_code == 415
        assert session.get(Student, student.id).photo_url == first_url
        assert first_path.is_file()
        oversized = client.post(
            f"/api/v1/management/students/{student.id}/photo",
            files={"photo": ("large.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")},
        )
        assert oversized.status_code == 413
        assert session.get(Student, student.id).photo_url == first_url

        replacement = client.post(
            f"/api/v1/management/students/{student.id}/photo",
            files={"photo": ("replacement.png", png_bytes("blue"), "image/png")},
        )
        assert replacement.status_code == 200
        replacement_id = replacement.json()["photo_url"].removeprefix(PHOTO_URL_PREFIX)
        assert replacement_id != first_id
        assert not first_path.exists()
        student = session.get(Student, student.id)
        pdf = create_cards_pdf([student])
        exam_pdf = create_cards_pdf(
            [student], ExamCardDetails("Semester Ganjil", "2026/2027")
        )
        assert pdf.startswith(b"%PDF-")
        assert pdf.count(b"/Subtype /Image") >= 2
        assert exam_pdf.count(b"/Subtype /Image") >= 2
    finally:
        client.close()
        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_student_photo_requires_authentication():
    response = TestClient(app).get(f"/api/v1/management/students/photos/{uuid4()}")

    assert response.status_code == 401
