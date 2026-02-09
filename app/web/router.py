from __future__ import annotations

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import (
    list_user_locations,
    require_active_location_id,
    require_user,
)
from app.db.session import get_db
from app.models.customer import Customer
from app.schemas.customers import CustomerCreate

templates = Jinja2Templates(directory="app/web/templates")
web_router = APIRouter()


@web_router.get("/", response_class=HTMLResponse)
def home(request: Request, user=Depends(require_user)):
    # If authenticated, go dashboard
    return RedirectResponse(url="/dashboard", status_code=302)


@web_router.get("/dashboard", response_class=HTMLResponse)
def dashboard(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_user),
    active_location_id: int = Depends(require_active_location_id),
):
    locations = list_user_locations(db, user.id)
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "user": user,
            "locations": locations,
            "active_location_id": active_location_id,
        },
    )


@web_router.get("/customers", response_class=HTMLResponse)
def customers_page(
    request: Request,
    q: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_user),
    active_location_id: int = Depends(require_active_location_id),
):
    locations = list_user_locations(db, user.id)

    query = db.query(Customer).filter(Customer.location_id == active_location_id)

    # If you later add archived_at, we can filter archived here too.
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            (Customer.first_name.ilike(term))
            | (Customer.last_name.ilike(term))
            | (Customer.phone.ilike(term))
            | (Customer.email.ilike(term))
        )

    rows = query.order_by(Customer.last_name.asc(), Customer.first_name.asc()).limit(200).all()

    return templates.TemplateResponse(
        "customers.html",
        {
            "request": request,
            "user": user,
            "locations": locations,
            "active_location_id": active_location_id,
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
    user=Depends(require_user),
    active_location_id: int = Depends(require_active_location_id),
):
    # Create directly in DB (web UI server-side). Uses active location.
    payload = CustomerCreate(
        location_id=active_location_id,
        first_name=first_name,
        last_name=last_name or "",
        phone=phone or None,
        email=email or None,
        notes=notes or None,
    )

    # Mirror your API logic: organization derived from location
    from app.models.location import Location
    loc = db.query(Location).filter(Location.id == active_location_id).first()
    if not loc:
        resp = RedirectResponse(url="/customers", status_code=302)
        return resp

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
    user=Depends(require_user),
):
    # Validate user has access to that location
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
