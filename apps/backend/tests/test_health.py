import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from fastapi.testclient import TestClient
from app.main import app


def test_health():
    assert TestClient(app).get("/health").json() == {"status": "ok"}


def test_feature_routes_are_registered():
    paths = {route.path for route in app.routes}

    assert {
        "/api/v1/auth/login",
        "/api/v1/management/users",
        "/api/v1/management/teachers",
        "/api/v1/management/subjects",
        "/api/v1/management/students",
        "/api/v1/management/students/{student_id}/photo",
        "/api/v1/management/students/photos/{photo_id}",
        "/api/v1/schedules/events",
        "/api/v1/schedules/exam-periods",
        "/api/v1/schedules/exam-periods/{period_id}",
        "/api/v1/attendance/daily",
        "/api/v1/attendance/daily/schedules",
        "/api/v1/cards/preview/{student_id}",
        "/api/v1/cards/export/{student_id}",
        "/api/v1/cards/batch-print",
        "/api/v1/cards/exams/preview/{exam_period_id}/{rombel_id}/{student_id}",
        "/api/v1/cards/exams/export/{exam_period_id}/{rombel_id}/{student_id}",
        "/api/v1/cards/exams/batch-print",
        "/api/v1/attendance/event/{schedule_event_id}",
        "/api/v1/attendance/event/record",
        "/api/v1/reports/daily",
        "/api/v1/reports/daily/export",
        "/api/v1/reports/class",
        "/api/v1/reports/class/export",
        "/api/v1/reports/exam",
        "/api/v1/reports/exam/export",
    } <= paths
