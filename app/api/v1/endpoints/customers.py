from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user_id, require_location_access
from app.db.session import get_db
from app.models.customer import Customer, CustomerAddress
from app.models.location import Location
from app.schemas.customers import (
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    CustomerAddressCreate,
    CustomerAddressOut,
    CustomerAddressUpdate,
)

router = APIRouter()


# -------------------------
# Customers
# -------------------------

@router.post("/", response_model=CustomerOut)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    require_location_access(location_id=payload.location_id, db=db, user_id=user_id)

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
    location_id: int,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    require_location_access(location_id=location_id, db=db, user_id=user_id)

    q = db.query(Customer).filter(Customer.location_id == location_id)
    if not include_archived:
        q = q.filter(Customer.archived_at.is_(None))

    rows = q.order_by(Customer.last_name.asc(), Customer.first_name.asc()).all()
    return rows


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.archived_at is not None:
        raise HTTPException(status_code=404, detail="Customer not found")

    require_location_access(location_id=customer.location_id, db=db, user_id=user_id)
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.archived_at is not None:
        raise HTTPException(status_code=404, detail="Customer not found")

    require_location_access(location_id=customer.location_id, db=db, user_id=user_id)

    data = payload.model_dump(exclude_unset=True)

    for field, value in data.items():
        if field in ("first_name", "last_name") and value is not None:
            value = value.strip()
        if field == "email" and value is not None:
            value = str(value)
        setattr(customer, field, value)

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
    require_location_access(location_id=location_id, db=db, user_id=user_id)

    term = f"%{q.strip()}%"
    rows = (
        db.query(Customer)
        .filter(Customer.location_id == location_id)
        .filter(Customer.archived_at.is_(None))
        .filter(
            (Customer.first_name.ilike(term))
            | (Customer.last_name.ilike(term))
            | (Customer.phone.ilike(term))
            | (Customer.email.ilike(term))
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
    if not customer or customer.archived_at is not None:
        raise HTTPException(status_code=404, detail="Customer not found")

    require_location_access(location_id=customer.location_id, db=db, user_id=user_id)

    customer.archived_at = dt.datetime.utcnow()
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


# -------------------------
# Addresses
# -------------------------

@router.post("/{customer_id}/addresses", response_model=CustomerAddressOut)
def create_customer_address(
    customer_id: int,
    payload: CustomerAddressCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    # Confirm customer exists & not archived
    customer = db.get(Customer, customer_id)
    if not customer or customer.archived_at is not None:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Must have access to both the customer location and the payload location (should match)
    require_location_access(location_id=customer.location_id, db=db, user_id=user_id)
    require_location_access(location_id=payload.location_id, db=db, user_id=user_id)

    if int(payload.location_id) != int(customer.location_id):
        raise HTTPException(status_code=400, detail="Address location_id must match customer's location_id")

    loc = db.query(Location).filter(Location.id == payload.location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    # If marking primary, unset previous primaries
    if payload.is_primary:
        (
            db.query(CustomerAddress)
            .filter(CustomerAddress.customer_id == customer_id)
            .filter(CustomerAddress.archived_at.is_(None))
            .update({"is_primary": 0})
        )

    addr = CustomerAddress(
        customer_id=customer_id,
        organization_id=loc.organization_id,
        location_id=payload.location_id,
        label=payload.label,
        address1=payload.address1.strip(),
        address2=payload.address2,
        city=payload.city,
        state=payload.state,
        zip=payload.zip,
        is_primary=1 if payload.is_primary else 0,
        notes=payload.notes,
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return addr


@router.get("/{customer_id}/addresses", response_model=list[CustomerAddressOut])
def list_customer_addresses(
    customer_id: int,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.archived_at is not None:
        raise HTTPException(status_code=404, detail="Customer not found")

    require_location_access(location_id=customer.location_id, db=db, user_id=user_id)

    q = db.query(CustomerAddress).filter(CustomerAddress.customer_id == customer_id)
    if not include_archived:
        q = q.filter(CustomerAddress.archived_at.is_(None))

    rows = q.order_by(CustomerAddress.is_primary.desc(), CustomerAddress.id.desc()).all()
    return rows


@router.patch("/addresses/{address_id}", response_model=CustomerAddressOut)
def update_customer_address(
    address_id: int,
    payload: CustomerAddressUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    addr = db.get(CustomerAddress, address_id)
    if not addr or addr.archived_at is not None:
        raise HTTPException(status_code=404, detail="Address not found")

    # Access control
    require_location_access(location_id=addr.location_id, db=db, user_id=user_id)

    data = payload.model_dump(exclude_unset=True)

    # If setting primary true, unset others
    if data.get("is_primary") is True:
        (
            db.query(CustomerAddress)
            .filter(CustomerAddress.customer_id == addr.customer_id)
            .filter(CustomerAddress.archived_at.is_(None))
            .update({"is_primary": 0})
        )
        addr.is_primary = 1

    # If explicitly setting primary false
    if data.get("is_primary") is False:
        addr.is_primary = 0

    for field, value in data.items():
        if field == "is_primary":
            continue
        if field == "address1" and value is not None:
            value = value.strip()
        setattr(addr, field, value)

    db.add(addr)
    db.commit()
    db.refresh(addr)
    return addr


@router.post("/addresses/{address_id}/make-primary", response_model=CustomerAddressOut)
def make_primary_address(
    address_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    addr = db.get(CustomerAddress, address_id)
    if not addr or addr.archived_at is not None:
        raise HTTPException(status_code=404, detail="Address not found")

    require_location_access(location_id=addr.location_id, db=db, user_id=user_id)

    (
        db.query(CustomerAddress)
        .filter(CustomerAddress.customer_id == addr.customer_id)
        .filter(CustomerAddress.archived_at.is_(None))
        .update({"is_primary": 0})
    )
    addr.is_primary = 1

    db.add(addr)
    db.commit()
    db.refresh(addr)
    return addr


@router.post("/addresses/{address_id}/archive", response_model=CustomerAddressOut)
def archive_customer_address(
    address_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    addr = db.get(CustomerAddress, address_id)
    if not addr or addr.archived_at is not None:
        raise HTTPException(status_code=404, detail="Address not found")

    require_location_access(location_id=addr.location_id, db=db, user_id=user_id)

    addr.archived_at = dt.datetime.utcnow()

    # If it was primary, leave customer with no primary until user sets another
    addr.is_primary = 0

    db.add(addr)
    db.commit()
    db.refresh(addr)
    return addr
