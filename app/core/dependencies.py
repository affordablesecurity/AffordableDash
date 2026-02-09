from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.security import decode_token, verify_session_token
from app.db.session import get_db

# IMPORTANT:
# Your actual User model is app.models.user.User (not app.db.models.User)
from app.models.user import User
from app.models.location import UserLocation


# ----------------------------
# Web UI auth (cookie session)
# ----------------------------

SESSION_COOKIE_NAME = "ascrm_session"  # matches your earlier file


def get_session_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Web UI dependency.
    Reads the signed cookie, verifies it, returns User or None.
    """
    token = request.cookies.get(SESSION_COOKIE_NAME)
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
# API auth (Bearer JWT OR auth cookie)
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
      1) Signed session cookie (ascrm_session) -> subject 'sub'
      2) Authorization: Bearer <JWT>         -> subject 'sub'
      3) Auth cookie from API login (affordablecrm_auth) if your frontend relies on it
         NOTE: We *can* accept it as a JWT because it IS a JWT.
    """
    # 1) signed web session cookie
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        try:
            payload = verify_session_token(token)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

    # 2) bearer token
    bearer = _get_bearer_token(request)
    if bearer:
        try:
            payload = decode_token(bearer)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

    # 3) fallback: accept the API auth cookie (your login sets affordablecrm_auth)
    api_cookie = request.cookies.get("affordablecrm_auth")
    if api_cookie:
        try:
            payload = decode_token(api_cookie)
            sub = payload.get("sub")
            if sub is not None:
                return int(sub)
        except Exception:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


# ----------------------------
# Location access (join table)
# ----------------------------

def require_location_access(location_id: int, db: Session, user_id: int) -> bool:
    """
    Checks if user_id has access to location_id using the join table user_locations.

    Returns True if allowed, otherwise raises 403.
    """
    # Make sure user exists
    user = db.get(User, int(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Superadmin bypass (your model uses is_superadmin)
    if getattr(user, "is_superadmin", False):
        return True

    # Join table check
    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == int(user_id))
        .filter(UserLocation.location_id == int(location_id))
        .first()
    )

    if membership:
        return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized for this location",
    )
