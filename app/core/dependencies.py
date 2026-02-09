# app/core/dependencies.py
from __future__ import annotations

from typing import List, Optional

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db


# -----------------------------
# Helpers / Errors
# -----------------------------
def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _forbidden(detail: str = "Forbidden") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# -----------------------------
# Auth (Cookie -> JWT -> user_id)
# -----------------------------
def get_token_from_cookie(request: Request) -> Optional[str]:
    """
    Reads the auth token from the cookie configured in settings.auth_cookie_name.
    """
    cookie_name = getattr(settings, "auth_cookie_name", "access_token")
    token = request.cookies.get(cookie_name)
    return token


def decode_token_get_user_id(token: str) -> int:
    """
    Decodes JWT and returns user_id (supports common claim keys).
    Adjust claim keys here if your token uses a different structure.
    """
    secret = getattr(settings, "secret_key", None) or getattr(settings, "SECRET_KEY", None)
    alg = getattr(settings, "jwt_algorithm", None) or getattr(settings, "JWT_ALGORITHM", "HS256")

    if not secret:
        # If your project uses a different setting name, set settings.secret_key in config.
        raise _unauthorized("Server auth not configured (missing secret_key).")

    try:
        payload = jwt.decode(token, secret, algorithms=[alg])
    except JWTError:
        raise _unauthorized("Invalid or expired token")

    # Try common keys:
    user_id = payload.get("user_id")
    if user_id is None:
        # Some libs use "sub"
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
    FastAPI dependency: returns authenticated user_id from cookie token.
    """
    token = get_token_from_cookie(request)
    if not token:
        raise _unauthorized("Not authenticated")
    return decode_token_get_user_id(token)


# -----------------------------
# Public dependencies used by web/router.py
# -----------------------------
def require_user(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Web UI dependency: returns the authenticated User ORM object.
    """
    # Local import to avoid circular import issues
    from app.models.user import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise _unauthorized("User not found")
    return user


def list_user_locations(db: Session, user_id: int):
    """
    Returns a list of Location objects the user has access to.
    Used by dashboard and pages that need the location switcher.
    """
    from app.models.location import Location, UserLocation

    rows = (
        db.query(Location)
        .join(UserLocation, UserLocation.location_id == Location.id)
        .filter(UserLocation.user_id == user_id)
        .order_by(Location.name.asc() if hasattr(Location, "name") else Location.id.asc())
        .all()
    )
    return rows


def require_active_location_id(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_user),
) -> int:
    """
    Web UI dependency: returns the active location_id from cookie,
    validates the user can access it, otherwise picks the first allowed location.
    """
    cookie_name = getattr(settings, "active_location_cookie_name", "active_location_id")
    raw = request.cookies.get(cookie_name)

    from app.models.location import UserLocation

    # If cookie is present, validate membership
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
                return location_id

    # Fallback: pick first location user has access to
    first = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user.id)
        .order_by(UserLocation.location_id.asc())
        .first()
    )
    if not first:
        # User has no locations assigned yet
        raise _forbidden("No locations assigned to this user")

    return int(first.location_id)
