from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from app.core.security import verify_session_token
from app.db.session import get_db
from app.db import models


def get_session_user(
    request: Request,
    db=Depends(get_db),
):
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

    return db.get(models.User, int(user_id))


def require_user(user=Depends(get_session_user)):
    """
    Web UI dependency.
    Enforces auth (redirect behavior handled in router/templates).
    """
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return user
