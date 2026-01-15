from __future__ import annotations

from fastapi import APIRouter, Depends, Response, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_session_token
from app.db.session import get_db
from app.schemas.auth import LoginIn, UserOut
from app.services.auth_service import authenticate

router = APIRouter()


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = authenticate(db, data.email, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_session_token({"user_id": user.id})
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=(settings.env != "dev"),
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(settings.session_cookie_name, path="/")
    return {"ok": True}
