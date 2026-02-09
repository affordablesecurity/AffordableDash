# app/core/dependencies.py
from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db


# -----------------------------
# Errors (API)
# -----------------------------
def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _forbidden(detail: str = "Forbidden") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# -----------------------------
# Errors (WEB)
# -----------------------------
def _redirect_to_login(request: Request, detail: str = "Not authenticated") -> RedirectResponse:
    """
    Web UI response when a user is not authenticated.
    Redirects to /login and includes ?next=<path> so you can send them back after login.
    """
    # Prevent redirect loops if you're already on /login
    path = getattr(request.url, "path", "/")
    if path.startswith("/login"):
        return RedirectResponse(url="/login", status_code=302)

    # Preserve original destination
    qs = getattr(request.url, "query", "")
    next_path = path + (f"?{qs}" if qs else "")
    return RedirectResponse(url=f"/login?next={next_path}", status_code=302)


# -----------------------------
# Token helpers
# -----------------------------
def get_token_from_cookie(request: Request) -> Optional[str]:
    """
    Read JWT from your auth cookie.
    """
    cookie_name = getattr(settings, "auth_cookie_name", "access_token")
    return request.cookies.get(cookie_name)


def _get_secret_and_alg() -> tuple[str, str]:
    secret = getattr(settings, "secret_key", None) or getattr(settings, "SECRET_KEY", None)
    alg = getattr(settings, "jwt_algorithm", None) or getattr(settings, "JWT_ALGORITHM", "HS256")
    if not secret:
        raise _unauthorized("Server auth not configured (missing secret_key).")
    return secret, alg


def decode_token_get_user_id(token: str) -> int:
    """
    Decode JWT and return user_id.
    Supports either 'user_id' or 'sub' claims.
    """
    secret, alg = _get_secret_and_alg()

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


# -----------------------------
# Current user id (API)
# -----------------------------
def get_current_user_id(request: Request) -> int:
    """
    API dependency: returns user_id from auth cookie token.
    Raises JSON 401 if missing/invalid.
    """
    token = get_token_from_cookie(request)
    if not token:
        raise _unauthorized("Not authenticated")
    return decode_token_get_user_id(token)


# -----------------------------
# User dependency (API)
# -----------------------------
def require_user(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    API-style auth dependency:
    Returns authenticated User ORM object or raises JSON 401.
    """
    from app.models.user import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise _unauthorized("User not found")
    return user


# -----------------------------
# User dependency (WEB)
# -----------------------------
def require_web_user(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Web-style auth dependency:
    - If not authenticated, redirects to /login instead of returning JSON.
    - If authenticated, returns the User ORM object.
    """
    token = get_token_from_cookie(request)
    if not token:
        return _redirect_to_login(request)

    # Decode token; if invalid, redirect (not JSON)
    try:
        user_id = decode_token_get_user_id(token)
    except HTTPException:
        return _redirect_to_login(request)

    from app.models.user import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return _redirect_to_login(request)

    return user


# -----------------------------
# Locations helpers (shared)
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

    if hasattr(Location, "name"):
        q = q.order_by(Location.name.asc())
    else:
        q = q.order_by(Location.id.asc())

    return q.all()


# -----------------------------
# Location access (API)
# -----------------------------
def require_location_access(
    location_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> int:
    """
    API dependency: ensure the user can access a location_id.
    Returns location_id or raises JSON 403.
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


# Backward/alternate naming safety (some files may import this)
require_location_access_id = require_location_access


# -----------------------------
# Active location (WEB)
# -----------------------------
def require_active_location_id(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_user),
) -> int:
    """
    Web UI dependency: returns active location_id from cookie.
    (API-style: if user invalid, it raises JSON 401 because require_user does.)
    Kept for backward compatibility.
    """
    cookie_name = getattr(settings, "active_location_cookie_name", "active_location_id")
    raw = request.cookies.get(cookie_name)

    from app.models.location import UserLocation

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

    first = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user.id)
        .order_by(UserLocation.location_id.asc())
        .first()
    )
    if not first:
        raise _forbidden("No locations assigned to this user")

    return int(first.location_id)


def require_web_active_location_id(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_web_user),
) -> int:
    """
    Web UI dependency (redirect-safe):
    - If not authenticated, redirects to /login
    - If authenticated, returns active location id (cookie or first assigned)
    """
    # If require_web_user returned a RedirectResponse, bubble it up
    if isinstance(user, RedirectResponse):
        return user  # type: ignore[return-value]

    cookie_name = getattr(settings, "active_location_cookie_name", "active_location_id")
    raw = request.cookies.get(cookie_name)

    from app.models.location import UserLocation

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

    first = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user.id)
        .order_by(UserLocation.location_id.asc())
        .first()
    )
    if not first:
        # No locations; send them to dashboard or login depending on your flow
        return RedirectResponse(url="/dashboard", status_code=302)  # type: ignore[return-value]

    return int(first.location_id)
