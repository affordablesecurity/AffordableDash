# app/web/router.py
from __future__ import annotations

from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import (
    create_access_token,
    list_user_locations,
    require_web_active_location_id,
    require_web_user,
)
from app.db.session import get_db
from app.models.customer import Customer
from app.schemas.customers import CustomerCreate

templates = Jinja2Templates(directory="app/web/templates")
web_router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _is_redirect(x) -> bool:
    return isinstance(x, RedirectResponse)


def _login_form_html(next_path: str = "/") -> str:
    safe_next = next_path or "/"
    return f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>Login</title>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <style>
      body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f6f7fb; margin:0; }}
      .wrap {{ max-width:420px; margin:60px auto; background:#fff; padding:24px; border-radius:12px; box-shadow:0 6px 22px rgba(0,0,0,.08); }}
      h1 {{ margin:0 0 12px; font-size:20px; }}
      label {{ display:block; font-size:13px; margin:12px 0 6px; color:#333; }}
      input {{ width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:10px; font-size:14px; }}
      button {{ width:100%; margin-top:14px; padding:10px 12px; border:0; border-radius:10px; background:#111827; color:#fff; font-weight:600; cursor:pointer; }}
      .err {{ margin-top:12px; color:#b91c1c; font-size:13px; }}
      .muted {{ margin-top:10px; color:#6b7280; font-size:12px; }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Sign in</h1>
      <form method="post" action="/login">
        <input type="hidden" name="next" value="{safe_next}"/>
        <label>Email</label>
        <input type="email" name="email" autocomplete="username" required />
        <label>Password</label>
        <input type="password" name="password" autocomplete="current-password" required />
        <button type="submit">Login</button>
      </form>
      <div class="muted">If you just deployed, make sure your SECRET_KEY is set in Render env vars so sessions don’t break.</div>
    </div>
  </body>
</html>
""".strip()


@web_router.get("/login", response_class=HTMLResponse)
def login_get(request: Request, next: str = "/"):
    return HTMLResponse(_login_form_html(next))


@web_router.post("/login")
def login_post(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    next: str = Form("/"),
    db: Session = Depends(get_db),
):
    from app.models.user import User

    user = db.query(User).filter(User.email == email.strip().lower()).first()
    if not user:
        return HTMLResponse(_login_form_html(next) + '<div class="err">Invalid email or password</div>', status_code=401)

    # Support common field names for stored hash
    hashed = getattr(user, "hashed_password", None) or getattr(user, "password_hash", None) or getattr(user, "password", None)
    if not hashed or not pwd_context.verify(password, hashed):
        return HTMLResponse(_login_form_html(next) + '<div class="err">Invalid email or password</div>', status_code=401)

    token = create_access_token(user.id)

    # Safety: only allow relative next paths
    nxt = next or "/"
    if "://" in nxt or nxt.startswith("//"):
        nxt = "/"

    resp = RedirectResponse(url=nxt, status_code=302)
    resp.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=(settings.env != "dev"),
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/",
    )
    return resp


@web_router.get("/", response_class=HTMLResponse)
def home(request: Request, user=Depends(require_web_user)):
    if _is_redirect(user):
        return user
    return RedirectResponse(url="/dashboard", status_code=302)


@web_router.get("/dashboard", response_class=HTMLResponse)
def dashboard(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_web_user),
    active_location_id=Depends(require_web_active_location_id),
):
    if _is_redirect(user):
        return user
    if _is_redirect(active_location_id):
        return active_location_id

    locations = list_user_locations(db, user.id)
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "user": user,
            "locations": locations,
            "active_location_id": int(active_location_id),
        },
    )


@web_router.get("/customers", response_class=HTMLResponse)
def customers_page(
    request: Request,
    q: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_web_user),
    active_location_id=Depends(require_web_active_location_id),
):
    if _is_redirect(user):
        return user
    if _is_redirect(active_location_id):
        return active_location_id

    locations = list_user_locations(db, user.id)
    query = db.query(Customer).filter(Customer.location_id == int(active_location_id))

    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            (Customer.first_name.ilike(term))
            | (Customer.last_name.ilike(term))
            | (Customer.phone.ilike(term))
            | (Customer.email.ilike(term))
        )

    rows = (
        query.order_by(Customer.last_name.asc(), Customer.first_name.asc())
        .limit(200)
        .all()
    )

    return templates.TemplateResponse(
        "customers.html",
        {
            "request": request,
            "user": user,
            "locations": locations,
            "active_location_id": int(active_location_id),
            "customers": rows,
            "q": q or "",
            "error": None,
        },
    )


@web_router.post("/customers")
def customers_create(
    request: Request,
    first_name: str = Form(...),
    last_name: str = Form(""),
    phone: str = Form(""),
    email: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user=Depends(require_web_user),
    active_location_id=Depends(require_web_active_location_id),
):
    if _is_redirect(user):
        return user
    if _is_redirect(active_location_id):
        return active_location_id

    payload = CustomerCreate(
        location_id=int(active_location_id),
        first_name=first_name,
        last_name=last_name or "",
        phone=phone or None,
        email=email or None,
        notes=notes or None,
    )

    from app.models.location import Location

    loc = db.query(Location).filter(Location.id == int(active_location_id)).first()
    if not loc:
        return RedirectResponse(url="/customers", status_code=302)

    customer = Customer(
        organization_id=loc.organization_id,
        location_id=payload.location_id,
        first_name=payload.first_name.strip(),
        last_name=(payload.last_name or "").strip(),
        phone=payload.phone,
        email=str(payload.email) if payload.email else None,
        notes=payload.notes,
        address1=payload.address1,
        address2=payload.address2,
        city=payload.city,
        state=payload.state,
        zip=payload.zip,
    )
    db.add(customer)
    db.commit()

    return RedirectResponse(url="/customers", status_code=302)


@web_router.get("/set-location")
def set_location(
    location_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_web_user),
):
    if _is_redirect(user):
        return user

    from app.models.location import UserLocation

    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user.id, UserLocation.location_id == location_id)
        .first()
    )
    if not membership:
        return RedirectResponse(url="/dashboard", status_code=302)

    ref = request.headers.get("referer") or "/dashboard"
    resp = RedirectResponse(url=ref, status_code=302)
    resp.set_cookie(
        key=settings.active_location_cookie_name,
        value=str(location_id),
        httponly=True,
        samesite="lax",
        secure=(settings.env != "dev"),
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return resp


@web_router.get("/logout")
def logout_get():
    resp = RedirectResponse(url="/", status_code=302)
    resp.delete_cookie(settings.auth_cookie_name, path="/")
    resp.delete_cookie(settings.active_location_cookie_name, path="/")
    return resp
