from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user_id, require_location_access
from app.db.session import get_db
from app.models.customer import Customer
from app.models.location import Location
from app.schemas.customers import CustomerCreate, CustomerOut, CustomerUpdate

router = APIRouter()


@router.post("/", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    require_location_access(payload.location_id, db, user_id)

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
        is_archived=False,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/", response_model=list[CustomerOut])
def list_customers(
    location_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    require_location_access(location_id, db, user_id)

    rows = (
        db.query(Customer)
        .filter(Customer.location_id == location_id)
        .filter(Customer.is_archived == False)  # noqa: E712
        .order_by(Customer.last_name.asc(), Customer.first_name.asc())
        .all()
    )
    return rows


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.is_archived:
        raise HTTPException(status_code=404, detail="Customer not found")

    require_location_access(customer.location_id, db, user_id)
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.is_archived:
        raise HTTPException(status_code=404, detail="Customer not found")

    require_location_access(customer.location_id, db, user_id)

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if k in ("first_name", "last_name") and isinstance(v, str):
            v = v.strip()
        setattr(customer, k, v)

    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/search", response_model=list[CustomerOut])
def search_customers(
    location_id: int,
    q: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    require_location_access(location_id, db, user_id)

    like = f"%{q.strip().lower()}%"
    rows = (
        db.query(Customer)
        .filter(Customer.location_id == location_id)
        .filter(Customer.is_archived == False)  # noqa: E712
        .filter(
            (Customer.first_name.ilike(like))
            | (Customer.last_name.ilike(like))
            | (Customer.phone.ilike(like))
            | (Customer.email.ilike(like))
        )
        .order_by(Customer.last_name.asc(), Customer.first_name.asc())
        .all()
    )
    return rows


@router.post("/{customer_id}/archive", response_model=CustomerOut)
def archive_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    require_location_access(customer.location_id, db, user_id)

    customer.is_archived = True
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer
