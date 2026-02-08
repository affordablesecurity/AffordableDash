from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models.location import UserLocation
from app.models.user import User


def _get_cookie_token(request: Request) -> Optional[str]:
    return request.cookies.get(settings.auth_cookie_name)


def _get_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or ""
    if not auth:
        return None
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


# ----------------------------
# Web UI auth (cookie JWT)
# ----------------------------
def get_session_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    token = _get_cookie_token(request)
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None

    sub = payload.get("sub")
    if not sub:
        return None

    try:
        return db.get(User, int(sub))
    except Exception:
        return None


def require_user(user: Optional[User] = Depends(get_session_user)) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


# ----------------------------
# API auth (Bearer JWT OR cookie JWT)
# ----------------------------
def get_current_user_id(request: Request, db: Session = Depends(get_db)) -> int:
    # 1) Cookie
    cookie_token = _get_cookie_token(request)
    if cookie_token:
        try:
            payload = decode_token(cookie_token)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

    # 2) Bearer
    bearer = _get_bearer_token(request)
    if bearer:
        try:
            payload = decode_token(bearer)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def require_location_access(location_id: int, db: Session, user_id: int) -> UserLocation:
    """
    Enforces that user_id has a membership row in user_locations for this location_id,
    OR user is superadmin.
    Returns the UserLocation membership (includes role) on success.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if getattr(user, "is_superadmin", False):
        # superadmin bypass (no membership required)
        return UserLocation(user_id=user_id, location_id=location_id, role="superadmin")

    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id, UserLocation.location_id == int(location_id))
        .first()
    )

    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this location")

    return membership
