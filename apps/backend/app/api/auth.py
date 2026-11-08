from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserOut
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
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
