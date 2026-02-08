from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
from app.db.models import User
from app.db.session import get_db


# ----------------------------
# Helpers
# ----------------------------

def _get_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or ""
    if not auth:
        return None
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _decode_user_id_from_jwt(token: str) -> Optional[int]:
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
# Web UI auth (cookie JWT)
# ----------------------------

def get_session_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Web UI dependency.
    Reads the JWT cookie (settings.auth_cookie_name), returns User or None.
    """
    token = request.cookies.get(settings.auth_cookie_name)
    if not token:
        return None

    user_id = _decode_user_id_from_jwt(token)
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
      1) Cookie JWT (settings.auth_cookie_name)
      2) Authorization: Bearer <JWT>
    """
    # 1) Cookie JWT
    cookie_token = request.cookies.get(settings.auth_cookie_name)
    if cookie_token:
        user_id = _decode_user_id_from_jwt(cookie_token)
        if user_id:
            return user_id

    # 2) Bearer JWT
    bearer = _get_bearer_token(request)
    if bearer:
        user_id = _decode_user_id_from_jwt(bearer)
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
    Placeholder for multi-location gating.
    Right now: allow if user is admin/superuser OR user has matching location_id field.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if getattr(user, "is_superuser", False) or getattr(user, "is_admin", False):
        return True

    user_location_id = getattr(user, "location_id", None)
    if user_location_id is not None and int(user_location_id) == int(location_id):
        return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized for this location",
    )
