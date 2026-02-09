from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models.location import Location, UserLocation
from app.models.user import User


# ----------------------------
# Cookie / Bearer helpers
# ----------------------------

def _get_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or ""
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _get_cookie_token(request: Request) -> Optional[str]:
    # Web + API both use the same cookie name:
    return request.cookies.get(settings.auth_cookie_name)


# ----------------------------
# Web UI auth (cookie session)
# ----------------------------

def get_session_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Web UI dependency.
    Reads JWT from cookie, decodes, returns User or None.
    """
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
        user_id = int(sub)
    except Exception:
        return None

    return db.get(User, user_id)


def require_user(user: Optional[User] = Depends(get_session_user)) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


# ----------------------------
# Active location (cookie)
# ----------------------------

def get_active_location_id(request: Request) -> Optional[int]:
    raw = request.cookies.get(settings.active_location_cookie_name)
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


def require_active_location_id(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> int:
    """
    Ensures there is an active location set AND the user has access to it.
    Falls back to the user's first membership if cookie missing.
    """
    loc_id = get_active_location_id(request)

    # If cookie missing, pick user's first membership
    if not loc_id:
        membership = (
            db.query(UserLocation)
            .filter(UserLocation.user_id == user.id)
            .order_by(UserLocation.location_id.asc())
            .first()
        )
        if not membership:
            raise HTTPException(status_code=403, detail="No location membership for this user")
        return int(membership.location_id)

    # Validate membership
    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user.id, UserLocation.location_id == loc_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not authorized for this location")

    return int(loc_id)


def list_user_locations(db: Session, user_id: int) -> list[Location]:
    """
    Returns Location rows the user can access.
    """
    return (
        db.query(Location)
        .join(UserLocation, UserLocation.location_id == Location.id)
        .filter(UserLocation.user_id == user_id)
        .order_by(Location.id.asc())
        .all()
    )


# ----------------------------
# API auth (Bearer JWT OR cookie JWT)
# ----------------------------

def get_current_user_id(
    request: Request,
    db: Session = Depends(get_db),
) -> int:
    """
    API dependency:
      1) Cookie JWT (same as web)
      2) Authorization: Bearer <JWT>
    """
    # Cookie first
    token = _get_cookie_token(request)
    if token:
        try:
            payload = decode_token(token)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

    # Bearer second
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
