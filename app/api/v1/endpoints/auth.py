from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, decode_token
from app.db.session import get_db
from app.models.organization import Organization
from app.models.location import Location, UserLocation
from app.schemas.auth import LoginIn, SignupIn, TokenOut
from app.services.auth_service import authenticate, create_user, get_user_by_email, get_user_by_id

router = APIRouter()


@router.post("/signup", response_model=TokenOut)
def signup(data: SignupIn, response: Response, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    # Create user
    user = create_user(db, data.email, data.password, data.full_name)

    # Create org + first location
    org = Organization(name=data.organization_name)
    db.add(org)
    db.commit()
    db.refresh(org)

    loc = Location(organization_id=org.id, name=data.first_location_name)
    db.add(loc)
    db.commit()
    db.refresh(loc)

    # Owner membership for the first location
    membership = UserLocation(user_id=user.id, location_id=loc.id, role="owner")
    db.add(membership)
    db.commit()

    token = create_access_token(subject=str(user.id), extra={"org_id": org.id, "location_id": loc.id, "role": "owner"})
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=(settings.env != "dev"),
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = authenticate(db, data.email, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    # If user belongs to multiple locations, UI will pick later.
    # For now, pick the first membership (or none).
    membership = None
    if user.locations:
        membership = user.locations[0]

    extra = {}
    if membership:
        # location -> org is on the Location row
        loc = db.query(Location).filter(Location.id == membership.location_id).first()
        if loc:
            extra = {"org_id": loc.organization_id, "location_id": loc.id, "role": membership.role}

    token = create_access_token(subject=str(user.id), extra=extra)

    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=(settings.env != "dev"),
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return TokenOut(access_token=token)


@router.get("/me")
def me(db: Session = Depends(get_db), token: str | None = None):
    """
    For now, accept token from Authorization header OR cookie handled by the web layer later.
    This endpoint is mainly for testing Render quickly.
    """
    if not token:
        raise HTTPException(status_code=400, detail="Provide token as query param for now: /me?token=...")

    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id or not str(user_id).isdigit():
        raise HTTPException(status_code=401, detail="Invalid token")

    user = get_user_by_id(db, int(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "claims": payload,
    }
