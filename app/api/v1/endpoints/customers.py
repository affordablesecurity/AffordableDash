from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user_id, require_location_access
from app.db.session import get_db
from app.models.customer import Customer
from app.models.customer_contact import CustomerContact
from app.models.customer_address import CustomerAddress
from app.models.location import Location
from app.schemas.customers import (
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    CustomerContactCreate,
    CustomerContactOut,
    CustomerAddressCreate,
    CustomerAddressOut,
)
from app.services.customer_uid import next_customer_uid

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

    uid = next_customer_uid(db, loc.organization_id)

    customer = Customer(
        customer_uid=uid,
        organization_id=loc.organization_id,
        location_id=payload.location_id,
        first_name=payload.first_name.strip(),
        last_name=(payload.last_name or "").strip(),
        # legacy fields (optional)
        phone=None,
        email=None,
        address1=None,
        address2=None,
        city=None,
        state=None,
        zip=None,
        notes=payload.notes,
        is_archived=False,
    )
    db.add(customer)
    db.flush()  # get customer.id

    # Create primary phone/email contacts if provided
    if payload.primary_phone:
        db.add(
            CustomerContact(
                customer_id=customer.id,
                type="phone",
                value=payload.primary_phone.strip(),
                label="mobile",
                is_primary=True,
                can_call=True,
                can_text=True,
                can_email=True,
            )
        )
        customer.phone = payload.primary_phone.strip()

    if payload.primary_email:
        db.add(
            CustomerContact(
                customer_id=customer.id,
                type="email",
                value=payload.primary_email.strip().lower(),
                label="primary",
                is_primary=True,
                can_call=True,
                can_text=True,
                can_email=True,
            )
        )
        customer.email = payload.primary_email.strip().lower()

    # Create primary address if provided
    if payload.primary_address1 or payload.primary_city or payload.primary_state or payload.primary_zip:
        db.add(
            CustomerAddress(
                customer_id=customer.id,
                label="primary",
                address1=payload.primary_address1,
                address2=payload.primary_address2,
                city=payload.primary_city,
                state=payload.primary_state,
                zip=payload.primary_zip,
                is_primary=True,
            )
        )
        # legacy address fields (optional)
        customer.address1 = payload.primary_address1
        customer.address2 = payload.primary_address2
        customer.city = payload.primary_city
        customer.state = payload.primary_state
        customer.zip = payload.primary_zip

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

    like = f"%{q.strip()}%"
    rows = (
        db.query(Customer)
        .filter(Customer.location_id == location_id)
        .filter(Customer.is_archived == False)  # noqa: E712
        .filter(
            (Customer.first_name.ilike(like))
            | (Customer.last_name.ilike(like))
            | (Customer.phone.ilike(like))
            | (Customer.email.ilike(like))
            | (Customer.customer_uid.ilike(like))
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


# -----------------------------
# Contacts (multiple phones/emails)
# -----------------------------
@router.get("/{customer_id}/contacts", response_model=list[CustomerContactOut])
def list_customer_contacts(
    customer_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.is_archived:
        raise HTTPException(status_code=404, detail="Customer not found")
    require_location_access(customer.location_id, db, user_id)

    rows = (
        db.query(CustomerContact)
        .filter(CustomerContact.customer_id == customer_id)
        .order_by(CustomerContact.is_primary.desc(), CustomerContact.id.asc())
        .all()
    )
    return rows


@router.post("/{customer_id}/contacts", response_model=CustomerContactOut, status_code=201)
def add_customer_contact(
    customer_id: int,
    payload: CustomerContactCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.is_archived:
        raise HTTPException(status_code=404, detail="Customer not found")
    require_location_access(customer.location_id, db, user_id)

    if payload.type not in ("phone", "email"):
        raise HTTPException(status_code=400, detail="type must be 'phone' or 'email'")

    value = payload.value.strip()
    if payload.type == "email":
        value = value.lower()

    if payload.is_primary:
        db.query(CustomerContact).filter(CustomerContact.customer_id == customer_id).update({"is_primary": False})

    contact = CustomerContact(
        customer_id=customer_id,
        type=payload.type,
        value=value,
        label=(payload.label or "").strip(),
        is_primary=bool(payload.is_primary),
        can_call=bool(payload.can_call),
        can_text=bool(payload.can_text),
        can_email=bool(payload.can_email),
    )
    db.add(contact)

    # keep legacy fields loosely in sync with primary values
    if contact.is_primary and contact.type == "phone":
        customer.phone = contact.value
    if contact.is_primary and contact.type == "email":
        customer.email = contact.value

    db.add(customer)
    db.commit()
    db.refresh(contact)
    return contact


# -----------------------------
# Addresses (multiple)
# -----------------------------
@router.get("/{customer_id}/addresses", response_model=list[CustomerAddressOut])
def list_customer_addresses(
    customer_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.is_archived:
        raise HTTPException(status_code=404, detail="Customer not found")
    require_location_access(customer.location_id, db, user_id)

    rows = (
        db.query(CustomerAddress)
        .filter(CustomerAddress.customer_id == customer_id)
        .order_by(CustomerAddress.is_primary.desc(), CustomerAddress.id.asc())
        .all()
    )
    return rows


@router.post("/{customer_id}/addresses", response_model=CustomerAddressOut, status_code=201)
def add_customer_address(
    customer_id: int,
    payload: CustomerAddressCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    customer = db.get(Customer, customer_id)
    if not customer or customer.is_archived:
        raise HTTPException(status_code=404, detail="Customer not found")
    require_location_access(customer.location_id, db, user_id)

    if payload.is_primary:
        db.query(CustomerAddress).filter(CustomerAddress.customer_id == customer_id).update({"is_primary": False})

    addr = CustomerAddress(
        customer_id=customer_id,
        label=(payload.label or "").strip(),
        address1=payload.address1,
        address2=payload.address2,
        city=payload.city,
        state=payload.state,
        zip=payload.zip,
        is_primary=bool(payload.is_primary),
    )
    db.add(addr)

    # keep legacy address fields loosely in sync with primary
    if addr.is_primary:
        customer.address1 = addr.address1
        customer.address2 = addr.address2
        customer.city = addr.city
        customer.state = addr.state
        customer.zip = addr.zip
        db.add(customer)

    db.commit()
    db.refresh(addr)
    return addr
