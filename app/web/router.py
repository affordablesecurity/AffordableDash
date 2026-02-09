from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import list_user_locations, require_active_location_id, require_user
from app.db.session import get_db
from app.models.customer import Customer
from app.schemas.customers import CustomerCreate

templates = Jinja2Templates(directory="app/web/templates")
web_router = APIRouter()


def _safe_attr(model, name: str):
    return getattr(model, name, None)


def _customer_search_filter(CustomerModel, term: str):
    """
    Build an OR filter across whichever columns actually exist.
    Prevents AttributeError crashes if your model uses different names.
    """
    cols = []
    for col_name in ("first_name", "last_name", "phone", "phone_number", "email"):
        col = _safe_attr(CustomerModel, col_name)
        if col is not None:
            cols.append(col.ilike(term))
    if not cols:
        return None

    expr = cols[0]
    for c in cols[1:]:
        expr = expr | c
    return expr


def _order_customers(query):
    """
    Prefer last_name then first_name if they exist, otherwise fall back.
    """
    if _safe_attr(Customer, "last_name") is not None and _safe_attr(Customer, "first_name") is not None:
        return query.order_by(Customer.last_name.asc(), Customer.first_name.asc())

    if _safe_attr(Customer, "first_name") is not None:
        return query.order_by(Customer.first_name.asc())

    # Last resort if your model doesn’t have either:
    if _safe_attr(Customer, "id") is not None:
        return query.order_by(Customer.id.desc())

    return query


@web_router.get("/", response_class=HTMLResponse)
def home(request: Request):
    # If they’re logged in, send them to dashboard, otherwise send to login
    # (Your login route might be /login in the future; for now dashboard is fine)
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

    try:
        # Some DBs/models use location_id; if not, we’ll skip that filter.
        query = db.query(Customer)
        if _safe_attr(Customer, "location_id") is not None:
            query = query.filter(Customer.location_id == active_location_id)

        if q:
            term = f"%{q.strip()}%"
            filt = _customer_search_filter(Customer, term)
            if filt is not None:
                query = query.filter(filt)

        query = _order_customers(query)
        rows = query.limit(200).all()

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
    except Exception as e:
        # Don’t crash with a blank 500 — show the real error in the UI
        return templates.TemplateResponse(
            "customers.html",
            {
                "request": request,
                "user": user,
                "locations": locations,
                "active_location_id": active_location_id,
                "customers": [],
                "q": q or "",
                "error": f"Customers page error: {type(e).__name__}: {e}",
            },
            status_code=200,
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
    payload = CustomerCreate(
        location_id=active_location_id,
        first_name=first_name,
        last_name=last_name or "",
        phone=phone or None,
        email=email or None,
        notes=notes or None,
    )

    # Organization derived from location if those models/fields exist
    organization_id = None
    try:
        from app.models.location import Location

        loc = db.query(Location).filter(Location.id == active_location_id).first()
        if loc and hasattr(loc, "organization_id"):
            organization_id = loc.organization_id
    except Exception:
        organization_id = None

    customer = Customer()

    # Assign only fields that exist on your Customer ORM model (prevents crashes)
    def set_if_exists(obj: Any, field: str, value: Any):
        if hasattr(obj, field):
            setattr(obj, field, value)

    set_if_exists(customer, "organization_id", organization_id)
    set_if_exists(customer, "location_id", payload.location_id)
    set_if_exists(customer, "first_name", (payload.first_name or "").strip())
    set_if_exists(customer, "last_name", (payload.last_name or "").strip())

    # Phone column might be phone or phone_number depending on your model
    if hasattr(customer, "phone"):
        set_if_exists(customer, "phone", payload.phone)
    elif hasattr(customer, "phone_number"):
        set_if_exists(customer, "phone_number", payload.phone)

    set_if_exists(customer, "email", str(payload.email) if payload.email else None)
    set_if_exists(customer, "notes", payload.notes)

    # Address fields are optional; only set if your model has them
    for f in ("address1", "address2", "city", "state", "zip"):
        set_if_exists(customer, f, getattr(payload, f, None))

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
