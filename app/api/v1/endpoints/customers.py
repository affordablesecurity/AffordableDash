from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user_id
from app.db.session import get_db
from app.models.customer import Customer
from app.models.location import Location, UserLocation
from app.models.user import User
from app.schemas.customers import CustomerCreate, CustomerOut, CustomerUpdate

router = APIRouter()


# ----------------------------
# Helpers
# ----------------------------

def _has_archived_at_column() -> bool:
    # SQLAlchemy models expose mapped attrs on the class
    return hasattr(Customer, "archived_at")


def _base_customer_query(db: Session):
    q = db.query(Customer)
    if _has_archived_at_column():
        # Exclude archived by default
        q = q.filter(getattr(Customer, "archived_at").is_(None))
    return q


def _assert_location_access(db: Session, user_id: int, location_id: int) -> None:
    """
    Multi-location access gate.

    Rules:
      - If user.is_superadmin == True -> allow
      - Else user must have a row in user_locations for that location
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if getattr(user, "is_superadmin", False):
        return

    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id, UserLocation.location_id == location_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this location")


def _get_customer_or_404(db: Session, customer_id: int) -> Customer:
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


# ----------------------------
# Endpoints
# ----------------------------

@router.post("/", response_model=CustomerOut)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _assert_location_access(db, user_id, payload.location_id)

    loc = db.query(Location).filter(Location.id == payload.location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    customer = Customer(
        organization_id=loc.organization_id,
        location_id=payload.location_id,
        first_name=payload.first_name.strip(),
        last_name=(payload.last_name or "").strip(),
        phone=payload.phone,
        email=str(payload.email) if payload.email else None,
        address1=payload.address1,
        address2=payload.address2,
        city=payload.city,
        state=payload.state,
        zip=payload.zip,
        notes=payload.notes,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/", response_model=list[CustomerOut])
def list_customers(
    location_id: int = Query(...),
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _assert_location_access(db, user_id, location_id)

    q = db.query(Customer).filter(Customer.location_id == location_id)

    if _has_archived_at_column() and not include_archived:
        q = q.filter(getattr(Customer, "archived_at").is_(None))

    rows = q.order_by(Customer.last_name.asc(), Customer.first_name.asc()).all()
    return rows


@router.get("/search", response_model=list[CustomerOut])
def search_customers(
    location_id: int = Query(...),
    q: str = Query(..., min_length=1),
    include_archived: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Search by name, phone, or email within a location.
    """
    _assert_location_access(db, user_id, location_id)

    query = db.query(Customer).filter(Customer.location_id == location_id)

    if _has_archived_at_column() and not include_archived:
        query = query.filter(getattr(Customer, "archived_at").is_(None))

    term = f"%{q.strip()}%"

    # Use ilike when available; for sqlite it still works in most setups.
    query = query.filter(
        or_(
            Customer.first_name.ilike(term),
            Customer.last_name.ilike(term),
            Customer.phone.ilike(term) if hasattr(Customer, "phone") else False,
            Customer.email.ilike(term) if hasattr(Customer, "email") else False,
        )
    )

    rows = query.order_by(Customer.last_name.asc(), Customer.first_name.asc()).limit(limit).all()
    return rows


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = _get_customer_or_404(db, customer_id)

    # Auth based on the customer's location
    _assert_location_access(db, user_id, int(customer.location_id))
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = _get_customer_or_404(db, customer_id)
    _assert_location_access(db, user_id, int(customer.location_id))

    data = payload.model_dump(exclude_unset=True)

    # Normalize some fields if provided
    if "first_name" in data and data["first_name"] is not None:
        data["first_name"] = data["first_name"].strip()

    if "last_name" in data and data["last_name"] is not None:
        data["last_name"] = data["last_name"].strip()

    # Apply updates
    for k, v in data.items():
        setattr(customer, k, v)

    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.post("/{customer_id}/archive", response_model=CustomerOut)
def archive_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Soft archive if Customer has archived_at.
    Otherwise fall back to hard delete (temporary).
    """
    customer = _get_customer_or_404(db, customer_id)
    _assert_location_access(db, user_id, int(customer.location_id))

    if _has_archived_at_column():
        setattr(customer, "archived_at", dt.datetime.utcnow())
        db.add(customer)
        db.commit()
        db.refresh(customer)
        return customer

    # Fallback: hard delete if no archived_at column exists yet
    db.delete(customer)
    db.commit()

    # Return a "synthetic" response for the UI — indicates what was archived
    # (If you prefer 204 No Content here, say so and I’ll change it.)
    return customer
