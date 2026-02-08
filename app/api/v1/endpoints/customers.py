from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user_id, require_location_access
from app.db.session import get_db
from app.models.customer import Customer
from app.models.location import Location
from app.schemas.customers import CustomerCreate, CustomerOut

router = APIRouter()


@router.post("/", response_model=CustomerOut)
def create_customer(
    payload: CustomerCreate,
    request: Request,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    # ✅ IMPORTANT: call require_location_access with correct arguments
    require_location_access(
        location_id=payload.location_id,
        request=request,
        db=db,
        user_id=user_id,
    )

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
    request: Request,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    # ✅ IMPORTANT: call require_location_access with correct arguments
    require_location_access(
        location_id=location_id,
        request=request,
        db=db,
        user_id=user_id,
    )

    rows = (
        db.query(Customer)
        .filter(Customer.location_id == location_id)
        .order_by(Customer.last_name.asc(), Customer.first_name.asc())
        .all()
    )
    return rows
