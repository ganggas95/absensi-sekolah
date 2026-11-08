from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_minutes
    )
    return jwt.encode(
        {"sub": subject, "exp": expires, "type": "access"},
        settings.jwt_secret_key,
        algorithm="HS256",
    )


def create_refresh_token(subject: str) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)
    return jwt.encode(
        {"sub": subject, "exp": expires, "type": "refresh"},
        settings.jwt_secret_key,
        algorithm="HS256",
    )


def decode_token(token: str, token_type: str = "access") -> str:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret_key, algorithms=["HS256"])
        if payload.get("type") != token_type or not payload.get("sub"):
            raise JWTError
        return payload["sub"]
    except JWTError as exc:
        raise ValueError("Token tidak valid") from exc
