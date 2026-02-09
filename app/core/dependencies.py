# app/core/dependencies.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
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
    cookie_name = getattr(settings, "auth_cookie_name", "access_token")
    return request.cookies.get(cookie_name)


def decode_token_get_user_id(token: str) -> int:
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
    token = get_token_from_cookie(request)
    if not token:
        raise _unauthorized("Not authenticated")
    return decode_token_get_user_id(token)


def create_access_token(user_id: int, minutes: int = 60 * 24 * 7) -> str:
    """
    Create JWT. Default 7 days.
    """
    secret = getattr(settings, "secret_key", None) or getattr(settings, "SECRET_KEY", None)
    alg = getattr(settings, "jwt_algorithm", None) or getattr(settings, "JWT_ALGORITHM", "HS256")
    if not secret:
        raise RuntimeError("Missing settings.secret_key / SECRET_KEY")

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=minutes)

    payload = {
        "sub": str(user_id),
        "user_id": int(user_id),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=alg)


# -----------------------------
# API dependency: user + location checks (JSON errors)
# -----------------------------
def require_user(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    from app.models.user import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise _unauthorized("User not found")
    return user


def list_user_locations(db: Session, user_id: int):
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


def require_location_access(
    location_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> int:
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
    API-style version (raises 401/403). Use require_web_active_location_id for web pages.
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


# -----------------------------
# WEB dependencies (redirect instead of JSON)
# -----------------------------
def require_web_user(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Web-safe: returns User OR RedirectResponse to /login.
    """
    try:
        user_id = get_current_user_id(request)
    except HTTPException:
        next_path = request.url.path
        if request.url.query:
            next_path = f"{next_path}?{request.url.query}"
        return RedirectResponse(url=f"/login?next={quote(next_path)}", status_code=302)

    from app.models.user import User
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return RedirectResponse(url="/login?next=/", status_code=302)

    return user


def require_web_active_location_id(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_web_user),
):
    """
    Web-safe: returns int location_id OR RedirectResponse
    """
    if isinstance(user, RedirectResponse):
        return user

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
        return RedirectResponse(url="/login?next=/", status_code=302)

    return int(first.location_id)
