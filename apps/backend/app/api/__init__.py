from fastapi import APIRouter

from app.api.attendance import router as attendance_router
from app.api.auth import router as auth_router
from app.api.cards import router as cards_router
from app.api.reports import router as reports_router
from app.api.school import router as school_router
from app.api.schedules import router as schedules_router
from app.api.students import router as students_router
from app.api.users_teachers import router as users_teachers_router

router = APIRouter()

for feature_router in (
    auth_router,
    users_teachers_router,
    school_router,
    schedules_router,
    students_router,
    attendance_router,
    cards_router,
    reports_router,
):
    router.include_router(feature_router)
