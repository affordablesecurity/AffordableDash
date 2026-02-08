from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
from app.db.session import get_db

# Try to import these if your DB models exist in this project layout.
# If they don't, the code still works without location authorization checks.
try:
    from app.models.location import UserLocation  # type: ignore
except Exception:  # pragma: no cover
    UserLocation = None  # type: ignore

try:
    from app.db.models import User  # type: ignore
except Exception:  # pragma: no cover
    # Fallback path (some projects keep User under app.models.user)
    from app.models.user import User  # type: ignore


def _get_auth_cookie(request: Request) -> Optional[str]:
    """
    Returns the auth cookie value.

    Primary:
      - settings.auth_cookie_name (JWT cookie set by /api/v1/auth/login)

    Backward-compat:
      - settings.session_cookie_name (if you used it earlier)
      - hard-coded legacy "ascrm_session"
    """
    # Primary (what your auth endpoint sets)
    if getattr(settings, "auth_cookie_name", None):
        v = request.cookies.get(settings.auth_cookie_name)
        if v:
            return v

    # Backward compatibility (your web/logout currently references this)
    if getattr(settings, "session_cookie_name", None):
        v = request.cookies.get(settings.session_cookie_name)
        if v:
            return v

    # Legacy hard-coded name (your current file)
    return request.cookies.get("ascrm_session")


def _get_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or ""
    if not auth:
        return None
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _get_user_id_from_jwt(token: str) -> Optional[int]:
    """
    Decode JWT and extract subject.
    """
    try:
        payload = decode_token(token)
    except Exception:
        return None

    sub = payload.get("sub")
    if sub is None:
        return None

    try:
        return int(sub)
    except Exception:
        return None


# ----------------------------
# Web UI auth (JWT cookie)
# ----------------------------

def get_session_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Web UI dependency.
    Reads JWT from cookie and returns User or None.
    """
    token = _get_auth_cookie(request)
    if not token:
        return None

    user_id = _get_user_id_from_jwt(token)
    if not user_id:
        return None

    try:
        return db.get(User, user_id)
    except Exception:
        return None


def require_user(user: Optional[User] = Depends(get_session_user)) -> User:
    """
    Web UI dependency.
    Enforces auth.
    """
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return user


# ----------------------------
# API auth (Bearer JWT OR cookie JWT)
# ----------------------------

def get_current_user_id(
    request: Request,
    db: Session = Depends(get_db),
) -> int:
    """
    API dependency used by endpoints.
    Supports:
      1) Cookie JWT (affordablecrm_auth) -> subject 'sub'
      2) Authorization: Bearer <JWT>     -> subject 'sub'
    """
    # 1) Cookie JWT first (best for same-origin web UI)
    cookie_token = _get_auth_cookie(request)
    if cookie_token:
        user_id = _get_user_id_from_jwt(cookie_token)
        if user_id:
            return user_id

    # 2) Bearer JWT
    bearer = _get_bearer_token(request)
    if bearer:
        user_id = _get_user_id_from_jwt(bearer)
        if user_id:
            return user_id

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


def require_location_access(
    location_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> bool:
    """
    Multi-location gate.

    Rules:
      - If user.is_superuser or user.is_admin -> allow (if fields exist)
      - Else if a UserLocation join table exists -> allow if membership exists
      - Else deny (403)
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if getattr(user, "is_superuser", False) or getattr(user, "is_admin", False):
        return True

    # If your join table exists, check it safely
    if UserLocation is not None:
        membership = (
            db.query(UserLocation)
            .filter(UserLocation.user_id == user_id, UserLocation.location_id == int(location_id))
            .first()
        )
        if membership:
            return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized for this location",
    )
