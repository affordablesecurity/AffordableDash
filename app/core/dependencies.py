from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token, verify_session_token
from app.db.session import get_db
from app.models.location import UserLocation


def get_jwt_from_request(request: Request) -> str | None:
    # Authorization: Bearer <token>
    auth = request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()

    # OR cookie-based JWT (we’ll use this soon)
    cookie_token = request.cookies.get(settings.auth_cookie_name)
    if cookie_token:
        return cookie_token

    return None


def get_current_user_id(request: Request) -> int:
    token = get_jwt_from_request(request)
    if token:
        payload = decode_token(token)
        sub = payload.get("sub")
        if sub and str(sub).isdigit():
            return int(sub)

    # Fallback: legacy session cookie (keeps your existing UI alive)
    legacy = request.cookies.get(settings.session_cookie_name)
    if legacy:
        payload = verify_session_token(legacy)
        user_id = payload.get("user_id")
        if user_id and str(user_id).isdigit():
            return int(user_id)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def require_location_access(location_id: int, db: Session, user_id: int) -> UserLocation:
    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id, UserLocation.location_id == location_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="No access to this location")
    return membership


def get_db_session() -> Session:
    return next(get_db())
