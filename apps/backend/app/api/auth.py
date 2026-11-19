from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.deps import current_user
from app.models import Teacher, User
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    MyProfileOut,
    MyProfileUpdate,
    TokenResponse,
    UserOut,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth")
settings = get_settings()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if (
        not user
        or not user.is_active
        or not verify_password(payload.password, user.hashed_password)
    ):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    response.set_cookie(
        "refresh_token",
        create_refresh_token(user.username),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_days * 86400,
    )
    return TokenResponse(access_token=create_access_token(user.username), user=user)


@router.post("/logout", status_code=204)
def logout(response: Response, user: User = Depends(current_user)):
    response.delete_cookie(
        "refresh_token",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token tidak ditemukan")
    try:
        username = decode_token(token, "refresh")
    except ValueError:
        raise HTTPException(status_code=401, detail="Refresh token tidak valid")
    user = (
        db.query(User)
        .filter(User.username == username, User.is_active.is_(True))
        .first()
    )
    if not user:
        raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan")
    response.set_cookie(
        "refresh_token",
        create_refresh_token(user.username),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_days * 86400,
    )
    return TokenResponse(access_token=create_access_token(user.username), user=user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.get("/me/profile", response_model=MyProfileOut)
def my_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
    return MyProfileOut(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        teacher_id=teacher.id if teacher else None,
        nip=teacher.nip if teacher else None,
        phone=teacher.phone if teacher else None,
        subjects=sorted(subject.name for subject in teacher.subjects) if teacher else [],
    )


@router.patch("/me/profile", response_model=MyProfileOut)
def update_my_profile(
    payload: MyProfileUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    user = db.get(User, user.id)
    if not user:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    values = payload.model_dump(exclude_unset=True)
    teacher_fields = {"nip", "phone"} & values.keys()
    teacher = None
    if teacher_fields:
        teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if not teacher:
            raise HTTPException(status_code=404, detail="Profil guru tidak ditemukan")
    if "nip" in values and values["nip"] is not None:
        duplicate = (
            db.query(Teacher)
            .filter(Teacher.nip == values["nip"], Teacher.user_id != user.id)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="NIP sudah terdaftar")
    if "full_name" in values:
        user.full_name = values["full_name"]
    if teacher:
        for field in teacher_fields:
            value = values[field]
            setattr(teacher, field, value or None)
    db.commit()
    db.refresh(user)
    return my_profile(user, db)


@router.post("/me/password", status_code=204)
def change_my_password(
    payload: ChangePasswordRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.hashed_password):
        # 400, bukan 401: sesi masih sah, hanya password saat ini yang salah.
        raise HTTPException(status_code=400, detail="Password saat ini salah")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
