from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import settings
from passlib.context import CryptContext


def create_access_token(subject: str | int, expires_minutes: int | None = None, **extra_claims: Any) -> str:
    """
    Creates a JWT access token.
    subject: usually user_id (int) or email (str)
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or getattr(settings, "access_token_expire_minutes", 60)
    )

    payload: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        **extra_claims,
    }

    algorithm = getattr(settings, "jwt_algorithm", "HS256")
    return jwt.encode(payload, settings.secret_key, algorithm=algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """
    Decodes a JWT token and returns payload dict.
    Raises ValueError if invalid.
    """
    algorithm = getattr(settings, "jwt_algorithm", "HS256")
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[algorithm])
    except JWTError as e:
        raise ValueError("Invalid token") from e


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
