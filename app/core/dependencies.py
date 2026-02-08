from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.security import decode_token, verify_session_token
from app.db.session import get_db

# Try to import your models from either path so this file won't crash
try:
    from app.models.user import User  # type: ignore
except Exception:  # pragma: no cover
    from app.db.models import User  # type: ignore

try:
    from app.models.location import UserLocation  # type: ignore
except Exception:  # pragma: no cover
    UserLocation = None  # type: ignore


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
# API auth (Bearer JWT OR cookie auth cookie)
# ----------------------------

def _get_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or ""
    if not auth:
        return None
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _get_any_jwt(request: Request) -> Optional[str]:
    """
    Your API sets the JWT into the cookie name `affordablecrm_auth`
    (from settings.auth_cookie_name). Here we just check common cookie names.
    """
    # cookie you’re actually setting in /api/v1/auth/login + /signup:
    cookie_jwt = request.cookies.get("affordablecrm_auth")
    if cookie_jwt:
        return cookie_jwt

    # if you later change cookie names, keep compatibility:
    cookie_jwt = request.cookies.get("ascrm_auth")
    if cookie_jwt:
        return cookie_jwt

    # bearer header
    return _get_bearer_token(request)


def get_current_user_id(
    request: Request,
    db: Session = Depends(get_db),
) -> int:
    """
    API dependency used by endpoints.
    Supports:
      1) Web session cookie (ascrm_session) -> subject 'sub'
      2) JWT cookie (affordablecrm_auth) OR Authorization: Bearer <JWT> -> subject 'sub'
    """
    # 1) Try the web session cookie
    session_token = request.cookies.get("ascrm_session")
    if session_token:
        try:
            payload = verify_session_token(session_token)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

    # 2) Try JWT from cookie or Bearer
    jwt_token = _get_any_jwt(request)
    if jwt_token:
        try:
            payload = decode_token(jwt_token)
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
    Authorization gate for multi-location access.

    Allows access if ANY of these are true:
      A) JWT claims include extra.location_id == location_id  (fast path)
      B) user.is_superuser / user.is_admin flag exists and is True
      C) user.location_id exists and matches (single-location legacy)
      D) user_locations join table contains (user_id, location_id)

    Otherwise 403.
    """
    # A) Fast path: token claim matches location
    jwt_token = _get_any_jwt(request)
    if jwt_token:
        try:
            payload = decode_token(jwt_token)
            extra = payload.get("extra") or {}
            token_loc = extra.get("location_id")
            if token_loc is not None and int(token_loc) == int(location_id):
                return True
        except Exception:
            pass

    # Load user row
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # B) Superuser/admin flags (only if your model has them)
    if getattr(user, "is_superuser", False) or getattr(user, "is_admin", False):
        return True

    # C) Single-location user model support
    user_location_id = getattr(user, "location_id", None)
    if user_location_id is not None and int(user_location_id) == int(location_id):
        return True

    # D) Join table membership support (this is what your signup creates)
    if UserLocation is not None:
        membership = (
            db.query(UserLocation)
            .filter(UserLocation.user_id == int(user_id), UserLocation.location_id == int(location_id))
            .first()
        )
        if membership:
            return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized for this location",
    )
