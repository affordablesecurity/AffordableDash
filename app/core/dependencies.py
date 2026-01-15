from __future__ import annotations

from fastapi import Depends, Request, HTTPException, status

from app.core.config import settings
from app.core.security import verify_session_token
from app.db.session import get_db
from app.services.auth_service import get_user_by_id


def get_session_user(request: Request, db=Depends(get_db)):
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    payload = verify_session_token(token)
    if not payload or "user_id" not in payload:
        return None
    return get_user_by_id(db, int(payload["user_id"]))


def require_user(user=Depends(get_session_user)):
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user
