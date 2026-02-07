from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings


# -----------------------------
# Password hashing
# -----------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


# -----------------------------
# JWT (new auth for API + modern web)
# -----------------------------
def create_access_token(subject: str, extra: Optional[dict[str, Any]] = None) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.access_token_expire_minutes)

    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if extra:
        payload.update(extra)

    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# -----------------------------
# Legacy cookie-session support (to keep your existing web UI working)
# -----------------------------
_serializer = URLSafeTimedSerializer(settings.secret_key, salt="ascrm-session")


def create_session_token(user_id: int) -> str:
    """
    Legacy: your existing web UI used this.
    We'll keep it so nothing breaks while we migrate to JWT cookies.
    """
    return _serializer.dumps({"user_id": int(user_id)})


def verify_session_token(token: str, max_age_seconds: int = 60 * 60 * 24 * 30) -> dict[str, Any]:
    """
    Legacy: verifies token and returns payload like {"user_id": 123}
    """
    try:
        return _serializer.loads(token, max_age=max_age_seconds)
    except SignatureExpired:
        raise HTTPException(status_code=401, detail="Session expired")
    except BadSignature:
        raise HTTPException(status_code=401, detail="Invalid session")
