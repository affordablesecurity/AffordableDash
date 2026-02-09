# app/core/dependencies.py
from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db


# -----------------------------
# Errors
# -----------------------------
def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _forbidden(detail: str = "Forbidden") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# -----------------------------
# Token helpers
# -----------------------------
def get_token_from_cookie(request: Request) -> Optional[str]:
    """
    Read JWT from your auth cookie.
    """
    cookie_name = getattr(settings, "auth_cookie_name", "access_token")
    return request.cookies.get(cookie_name)


def decode_token_get_user_id(token: str) -> int:
    """
    Decode JWT and return user_id.
    Supports either 'user_id' or 'sub' claims.
    """
    secret = getattr(settings, "secret_key", None) or getattr(settings, "SECRET_KEY", None)
    alg = getattr(settings, "jwt_algorithm", None) or getattr(settings, "JWT_ALGORITHM", "HS256")

    if not secret:
        raise _unauthorized("Server auth not configured (missing secret_key).")

    try:
        payload = jwt.decode(token, secret, algorithms=[alg])
    except JWTError:
        raise _unauthorized("Invalid or expired token")

    user_id = payload.get("user_id")
    if user_id is None:
        sub = payload.get("sub")
        if sub is not None:
            try:
                user_id = int(sub)
            except Exception:
                user_id = None

    if user_id is None:
        raise _unauthorized("Token missing user id")

    try:
        return int(user_id)
    except Exception:
        raise _unauthorized("Invalid user id in token")


def get_current_user_id(request: Request) -> int:
    """
    API dependency: returns user_id from auth cookie token.
    """
    token = get_token_from_cookie(request)
    if not token:
        raise _unauthorized("Not authenticated")
    return decode_token_get_user_id(token)


# -----------------------------
# User dependency (web + api)
# -----------------------------
def require_user(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Returns the authenticated User ORM object.
    Used by web UI routes and can be used by API routes if desired.
    """
    from app.models.user import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise _unauthorized("User not found")
    return user


# -----------------------------
# Locations helpers (web + api)
# -----------------------------
def list_user_locations(db: Session, user_id: int):
    """
    Returns Location objects the user can access (join table).
    """
    from app.models.location import Location, UserLocation

    q = (
        db.query(Location)
        .join(UserLocation, UserLocation.location_id == Location.id)
        .filter(UserLocation.user_id == user_id)
    )

    # Prefer a "name" sort if Location has it
    if hasattr(Location, "name"):
        q = q.order_by(Location.name.asc())
    else:
        q = q.order_by(Location.id.asc())

    return q.all()


def require_location_access(
    location_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> int:
    """
    API dependency used by endpoints to ensure the user can access a location_id.

    Example API use:
        def route(location_id: int, _=Depends(require_location_access)):
            ...

    It returns location_id if access is valid, otherwise raises 403.
    """
    from app.models.location import UserLocation

    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id, UserLocation.location_id == location_id)
        .first()
    )
    if not membership:
        raise _forbidden("No access to this location")

    return int(location_id)


def require_active_location_id(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_user),
) -> int:
    """
    Web UI dependency: returns active location_id from cookie.
    If missing/invalid, returns the first location assigned to the user.
    """
    cookie_name = getattr(settings, "active_location_cookie_name", "active_location_id")
    raw = request.cookies.get(cookie_name)

    from app.models.location import UserLocation

    # If cookie exists, validate membership
    if raw:
        try:
            location_id = int(raw)
        except Exception:
            location_id = None

        if location_id is not None:
            membership = (
                db.query(UserLocation)
                .filter(UserLocation.user_id == user.id, UserLocation.location_id == location_id)
                .first()
            )
            if membership:
                return int(location_id)

    # Fallback: first location assigned to user
    first = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user.id)
        .order_by(UserLocation.location_id.asc())
        .first()
    )
    if not first:
        raise _forbidden("No locations assigned to this user")

    return int(first.location_id)
