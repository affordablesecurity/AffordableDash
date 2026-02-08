from __future__ import annotations

from datetime import datetime, timedelta, timezone

from itsdangerous import BadSignature, TimestampSigner

from app.core.config import settings


def _signer() -> TimestampSigner:
    return TimestampSigner(settings.secret_key)


def create_session_token(user_id: int, expires_minutes: int = 60 * 24 * 7) -> str:
    """
    Creates a signed token with an embedded expiry timestamp.
    """
    # Store a simple payload; signer timestamp is also available, but we keep explicit expiry.
    exp = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    raw = f"{user_id}:{int(exp.timestamp())}"
    return _signer().sign(raw.encode("utf-8")).decode("utf-8")


def verify_session_token(token: str) -> dict:
    """
    Verifies signature and checks embedded expiry.
    Returns payload dict {sub: user_id}.
    Raises on invalid/expired.
    """
    unsigned = _signer().unsign(token.encode("utf-8")).decode("utf-8")
    user_id_str, exp_ts_str = unsigned.split(":", 1)
    exp = datetime.fromtimestamp(int(exp_ts_str), tz=timezone.utc)
    if datetime.now(timezone.utc) > exp:
        raise BadSignature("expired")
    return {"sub": int(user_id_str)}
