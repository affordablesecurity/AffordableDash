from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, decode_token
from app.db.session import get_db
from app.models.location import Location, UserLocation
from app.models.organization import Organization
from app.schemas.auth import LoginIn, SignupIn, TokenOut
from app.services.auth_service import authenticate, create_user, get_user_by_email, get_user_by_id

router = APIRouter()


def _cookie_secure_default() -> bool:
    """
    Render is HTTPS at the edge, so secure cookies are fine in production.
    If you don't have settings.env, we fail safely:
      - If ENV is set and not 'dev' => secure=True
      - If ENV is missing => secure=True (safe default on Render)
    Override by setting ENV=dev locally.
    """
    env = getattr(settings, "env", None) or getattr(settings, "ENV", None) or "prod"
    return str(env).lower() != "dev"


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure_default(),
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


def _validate_password_or_400(password: str) -> None:
    # bcrypt hard limit is 72 bytes; never allow a server crash because of it
    if password is None or not isinstance(password, str) or not password.strip():
        raise HTTPException(status_code=400, detail="Password is required")
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="Password too long (bcrypt limit is 72 bytes). Use 72 characters or less.",
        )


def _extract_token(request: Request, token_query: str | None) -> str | None:
    """
    Token can come from:
      1) ?token= query param (your original)
      2) Authorization: Bearer <token>
      3) Cookie: settings.auth_cookie_name
    """
    if token_query:
        return token_query

    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()

    return request.cookies.get(settings.auth_cookie_name)


@router.post("/signup", response_model=TokenOut)
def signup(data: SignupIn, response: Response, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    _validate_password_or_400(data.password)

    # Create user (wrap to avoid 500s from hashing/library issues)
    try:
        user = create_user(db, data.email, data.password, data.full_name)
    except HTTPException:
        raise
    except Exception as e:
        # Most common causes here: bcrypt/passlib version mismatch, or unexpected hashing failure
        raise HTTPException(
            status_code=500,
            detail=f"User creation failed (password hashing). Fix bcrypt/passlib pin. {type(e).__name__}",
        )

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

    token = create_access_token(
        subject=str(user.id),
        extra={"org_id": org.id, "location_id": loc.id, "role": "owner"},
    )
    _set_auth_cookie(response, token)

    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = authenticate(db, data.email, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    membership = user.locations[0] if getattr(user, "locations", None) else None

    extra: dict = {}
    if membership:
        loc = db.query(Location).filter(Location.id == membership.location_id).first()
        if loc:
            extra = {"org_id": loc.organization_id, "location_id": loc.id, "role": membership.role}

    token = create_access_token(subject=str(user.id), extra=extra)
    _set_auth_cookie(response, token)

    return TokenOut(access_token=token)


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db), token: str | None = None):
    token_value = _extract_token(request, token)
    if not token_value:
        raise HTTPException(status_code=400, detail="Provide token via ?token=, Bearer header, or cookie.")

    payload = decode_token(token_value)
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
