from __future__ import annotations

import time
from typing import Any

from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt="ascrm-session")


def create_session_token(payload: dict[str, Any]) -> str:
    # payload is signed and can be time-limited when verified.
    payload = {**payload, "iat": int(time.time())}
    return _serializer().dumps(payload)


def verify_session_token(token: str, max_age_seconds: int = 60 * 60 * 24 * 7) -> dict[str, Any] | None:
    try:
        data = _serializer().loads(token, max_age=max_age_seconds)
        if isinstance(data, dict):
            return data
        return None
    except (BadSignature, SignatureExpired):
        return None
