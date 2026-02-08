from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from itsdangerous import BadSignature, URLSafeTimedSerializer
from jose import JWTError, jwt

from app.core.config import settings


# -------------------------
# Cookie session tokens (web UI)
# -------------------------

def _serializer() -> URLSafeTimedSerializer:
    # salt keeps tokens consistent and separated from other uses of secret_key
    return URLSafeTimedSerializer(settings.secret_key, salt="ascrm-session")


def create_session_token(data: dict[str, Any]) -> str:
    return _serializer().dumps(data)


def verify_session_token(token: str, max_age_seconds: int = 60 * 60 * 24 * 7) -> dict[str, Any] | None:
    try:
        return _serializer().loads(token, max_age=max_age_seconds)
    except BadSignature:
        return None


# -------------------------
# JWT access tokens (API)
# -------------------------

def create_access_token(subject: str | int, expires_minutes: int | None = None, **extra_claims: Any) -> str:
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
    algorithm = getattr(settings, "jwt_algorithm", "HS256")
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[algorithm])
    except JWTError as e:
        raise ValueError("Invalid token") from e
