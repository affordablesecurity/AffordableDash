from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.security import decode_token, verify_session_token
from app.db.models import User
from app.db.session import get_db


# ----------------------------
# Web UI auth (cookie session)
# ----------------------------

def get_session_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Web UI dependency.
    Reads the signed cookie, verifies it, returns User or None.
    """
    token = request.cookies.get("ascrm_session")
    if not token:
        return None

    try:
        payload = verify_session_token(token)
    except Exception:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    try:
        return db.get(User, int(user_id))
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
# API auth (Bearer JWT OR cookie session)
# ----------------------------

def _get_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or ""
    if not auth:
        return None
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def get_current_user_id(
    request: Request,
    db: Session = Depends(get_db),
) -> int:
    """
    API dependency used by endpoints.
    Supports:
      1) Cookie session (ascrm_session) -> subject 'sub'
      2) Authorization: Bearer <JWT>  -> subject 'sub'

    Returns user_id (int) or raises 401.
    """
    # 1) Try cookie session first (nice for same-origin web UI hitting API)
    token = request.cookies.get("ascrm_session")
    if token:
        try:
            payload = verify_session_token(token)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

    # 2) Try Bearer JWT
    bearer = _get_bearer_token(request)
    if bearer:
        try:
            payload = decode_token(bearer)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

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
    Generic access gate for multi-location data.
    This is intentionally defensive so it won't crash while your DB schema evolves.

    Current rules:
      - If user.is_superuser or user.is_admin (if present) -> allow
      - Else if user.location_id exists and matches -> allow
      - Else deny (403)

    You can tighten/expand this later with a proper join table (user_locations).
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Superuser / admin flags (only if your model has them)
    if getattr(user, "is_superuser", False) or getattr(user, "is_admin", False):
        return True

    # Single-location user model support
    user_location_id = getattr(user, "location_id", None)
    if user_location_id is not None and int(user_location_id) == int(location_id):
        return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized for this location",
    )
