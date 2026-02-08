from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from itsdangerous import BadSignature, BadTimeSignature, URLSafeTimedSerializer
from passlib.context import CryptContext

from app.core.config import settings


# ----------------------------
# Password hashing
# ----------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# Common aliases some modules expect
def get_password_hash(password: str) -> str:
    return hash_password(password)


def verify_password_hash(plain_password: str, hashed_password: str) -> bool:
    return verify_password(plain_password, hashed_password)


# ----------------------------
# JWT access tokens (Authorization: Bearer ...)
# ----------------------------

def create_access_token(
    subject: str | int,
    expires_minutes: int | None = None,
    **extra_claims: Any,
) -> str:
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


# ----------------------------
# Session tokens (cookie-based)
# ----------------------------
# These are typically used for browser sessions where you set a cookie like:
#   Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax
#
# Your app.core.dependencies is trying to import verify_session_token(),
# so we provide it here.
# ----------------------------

def _session_serializer() -> URLSafeTimedSerializer:
    """
    Serializer for signed session tokens.
    Uses SECRET_KEY + a salt so it's separate from other signatures.
    """
    secret = settings.secret_key
    salt = getattr(settings, "session_salt", "session-token")
    return URLSafeTimedSerializer(secret_key=secret, salt=salt)


def create_session_token(data: dict[str, Any]) -> str:
    """
    Creates a signed session token (NOT a JWT).
    Typically stored in a cookie.
    """
    s = _session_serializer()
    return s.dumps(data)


def verify_session_token(token: str, max_age_seconds: int | None = None) -> dict[str, Any]:
    """
    Verifies a signed session token and returns the stored dict.

    max_age_seconds:
      - if provided, token expires after that many seconds
      - if not provided, uses settings.session_expire_seconds (default 7 days)
    Raises ValueError if invalid/expired.
    """
    s = _session_serializer()
    max_age = max_age_seconds or getattr(settings, "session_expire_seconds", 60 * 60 * 24 * 7)
    try:
        data = s.loads(token, max_age=max_age)
        if not isinstance(data, dict):
            raise ValueError("Invalid session payload")
        return data
    except (BadTimeSignature, BadSignature) as e:
        raise ValueError("Invalid or expired session token") from e


# Convenience helpers some apps expect
def get_subject_from_bearer_token(token: str) -> Optional[str]:
    """
    Pulls 'sub' from a JWT token. Returns None if invalid.
    """
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        return str(sub) if sub is not None else None
    except Exception:
        return None
