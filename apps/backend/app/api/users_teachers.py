from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.management_pagination import paginate
from app.db import get_db
from app.deps import current_user, require_admin
from app.models import Role, Subject, Teacher, User
from app.schemas import (
    PaginatedResponse,
    SubjectOut,
    TeacherCreate,
    TeacherOut,
    TeacherSubjectUpdate,
    TeacherUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.security import hash_password

router = APIRouter(prefix="/api/v1/management")


@router.get("/users", response_model=list[UserOut] | PaginatedResponse[UserOut])
def list_users(
    q: str | None = Query(None, min_length=1, max_length=100),
    role: Role | None = None,
    is_active: bool | None = None,
    page: int | None = Query(None, ge=1),
    limit: int = Query(10, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q and (search := q.strip()):
        search_fields = [
            User.username.ilike(f"%{search}%"),
            User.full_name.ilike(f"%{search}%"),
        ]
        if search.upper() in Role.__members__:
            search_fields.append(User.role == Role[search.upper()])
        query = query.filter(or_(*search_fields))
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active.is_(is_active))
    query = query.order_by(User.full_name, User.id)
    return paginate(query, page, limit) if page is not None else query.all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username sudah digunakan")
    user = User(
        username=payload.username,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    values = payload.model_dump(exclude_unset=True)
    if (
        "username" in values
        and db.query(User)
        .filter(User.username == values["username"], User.id != user_id)
        .first()
    ):
        raise HTTPException(status_code=409, detail="Username sudah digunakan")
    if "password" in values:
        values["hashed_password"] = hash_password(values.pop("password"))
    for key, value in values.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def deactivate_user(
    user_id: UUID, current: User = Depends(require_admin), db: Session = Depends(get_db)
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if user.id == current.id:
        raise HTTPException(
            status_code=400,
            detail="User yang sedang digunakan tidak dapat dinonaktifkan",
        )
    user.is_active = False
    db.commit()


def teacher_payload(teacher: Teacher) -> dict:
    return {
        "id": teacher.id,
        "user_id": teacher.user_id,
        "nip": teacher.nip,
        "phone": teacher.phone,
        "is_active": teacher.is_active,
        "full_name": teacher.user.full_name,
        "username": teacher.user.username,
        "subject_ids": [subject.id for subject in teacher.subjects],
    }


@router.get(
    "/teachers", response_model=list[TeacherOut] | PaginatedResponse[TeacherOut]
)
def list_teachers(
    q: str | None = Query(None, min_length=1, max_length=100),
    is_active: bool | None = None,
    page: int | None = Query(None, ge=1),
    limit: int = Query(10, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Teacher).join(User).options(
        joinedload(Teacher.user), selectinload(Teacher.subjects)
    )
    if q and (search := q.strip()):
        query = query.filter(
            or_(
                User.full_name.ilike(f"%{search}%"),
                User.username.ilike(f"%{search}%"),
                Teacher.nip.ilike(f"%{search}%"),
            )
        )
    if is_active is not None:
        query = query.filter(Teacher.is_active.is_(is_active))
    query = query.order_by(Teacher.created_at.desc(), Teacher.id)
    if page is not None:
        result = paginate(query, page, limit)
        result["items"] = [teacher_payload(teacher) for teacher in result["items"]]
        return result
    return [teacher_payload(teacher) for teacher in query.all()]


@router.post("/teachers", response_model=TeacherOut, status_code=201)
def create_teacher(
    payload: TeacherCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, payload.user_id)
    if not user or user.role != Role.GURU or not user.is_active:
        raise HTTPException(
            status_code=422, detail="User aktif dengan role GURU wajib dipilih"
        )
    if db.query(Teacher).filter(Teacher.user_id == payload.user_id).first():
        raise HTTPException(status_code=409, detail="User sudah memiliki profil Guru")
    if payload.nip and db.query(Teacher).filter(Teacher.nip == payload.nip).first():
        raise HTTPException(status_code=409, detail="NIP sudah terdaftar")
    teacher = Teacher(**payload.model_dump())
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher_payload(teacher)


@router.put("/teachers/{teacher_id}", response_model=TeacherOut)
def update_teacher(
    teacher_id: UUID,
    payload: TeacherUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Guru tidak ditemukan")
    values = payload.model_dump(exclude_unset=True)
    if "user_id" in values:
        user = db.get(User, values["user_id"])
        if not user or user.role != Role.GURU or not user.is_active:
            raise HTTPException(
                status_code=422, detail="User aktif dengan role GURU wajib dipilih"
            )
        if (
            db.query(Teacher)
            .filter(Teacher.user_id == values["user_id"], Teacher.id != teacher_id)
            .first()
        ):
            raise HTTPException(
                status_code=409, detail="User sudah memiliki profil Guru"
            )
    if (
        values.get("nip")
        and db.query(Teacher)
        .filter(Teacher.nip == values["nip"], Teacher.id != teacher_id)
        .first()
    ):
        raise HTTPException(status_code=409, detail="NIP sudah terdaftar")
    for key, value in values.items():
        setattr(teacher, key, value)
    db.commit()
    db.refresh(teacher)
    return teacher_payload(teacher)


@router.delete("/teachers/{teacher_id}", status_code=204)
def deactivate_teacher(
    teacher_id: UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Guru tidak ditemukan")
    teacher.is_active = False
    db.commit()


@router.get("/teachers/{teacher_id}/subjects", response_model=list[SubjectOut])
def list_teacher_subjects(
    teacher_id: UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Guru tidak ditemukan")
    return teacher.subjects


@router.put("/teachers/{teacher_id}/subjects", response_model=TeacherOut)
def assign_teacher_subjects(
    teacher_id: UUID,
    payload: TeacherSubjectUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Guru tidak ditemukan")
    subjects = (
        db.query(Subject)
        .filter(Subject.id.in_(payload.subject_ids), Subject.is_active.is_(True))
        .all()
        if payload.subject_ids
        else []
    )
    if len(subjects) != len(set(payload.subject_ids)):
        raise HTTPException(
            status_code=422, detail="Mata Pelajaran tidak ditemukan atau tidak aktif"
        )
    teacher.subjects = subjects
    db.commit()
    db.refresh(teacher)
    return teacher_payload(teacher)
