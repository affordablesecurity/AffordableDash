from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.location import Location, UserLocation


def _extract_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


def _extract_cookie_token(request: Request) -> Optional[str]:
    return request.cookies.get(settings.auth_cookie_name)


def get_current_user_id(request: Request) -> int:
    """
    Accepts auth via:
      - Authorization: Bearer <token>
      - Cookie: <AUTH_COOKIE_NAME>=<token>
      - Query param: ?token=<token>   (useful for quick tests; can remove later)
    """
    token = (
        _extract_bearer_token(request)
        or _extract_cookie_token(request)
        or request.query_params.get("token")
    )

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        return int(sub)
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def require_location_access(location_id: int, db: Session, user_id: int) -> UserLocation:
    """
    Ensures the user has a row in user_locations for the location.
    Returns the membership row if authorized.
    """
    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id, UserLocation.location_id == location_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this location")
    return membership


def list_user_locations(db: Session, user_id: int) -> list[dict]:
    """
    Used by the web UI to populate a location switcher.
    Returns a lightweight list of locations the user can access.
    """
    rows = (
        db.query(UserLocation, Location)
        .join(Location, Location.id == UserLocation.location_id)
        .filter(UserLocation.user_id == user_id)
        .order_by(Location.name.asc())
        .all()
    )

    return [
        {
            "location_id": loc.id,
            "location_name": loc.name,
            "timezone": loc.timezone,
            "role": ul.role,
            "organization_id": loc.organization_id,
        }
        for (ul, loc) in rows
    ]


def get_active_location_id(
    request: Request,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> int:
    """
    Phase 1A simple rule:
      - If UI sets cookie 'active_location_id', use it
      - else default to the first location the user has access to
    """
    cookie_val = request.cookies.get("active_location_id")
    if cookie_val and cookie_val.isdigit():
        location_id = int(cookie_val)
        require_location_access(location_id, db, user_id)
        return location_id

    first = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id)
        .order_by(UserLocation.location_id.asc())
        .first()
    )
    if not first:
        raise HTTPException(status_code=403, detail="User has no locations")
    return int(first.location_id)
