from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class CustomerCreate(BaseModel):
    location_id: int
    first_name: str
    last_name: str | None = ""

    # Phase 2 (preferred)
    primary_phone: str | None = None
    primary_email: EmailStr | None = None

    # Primary address (optional)
    primary_address1: str | None = None
    primary_address2: str | None = None
    primary_city: str | None = None
    primary_state: str | None = None
    primary_zip: str | None = None

    notes: str | None = None


class CustomerUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    notes: str | None = None
    is_archived: bool | None = None


class CustomerOut(BaseModel):
    id: int
    customer_uid: str
    organization_id: int
    location_id: int
    first_name: str
    last_name: str
    phone: str | None = None
    email: str | None = None
    address1: str | None = None
    address2: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    notes: str | None = None
    is_archived: bool

    class Config:
        from_attributes = True


class CustomerContactCreate(BaseModel):
    type: str = Field(..., description="phone or email")
    value: str
    label: str | None = ""
    is_primary: bool = False
    can_call: bool = True
    can_text: bool = True
    can_email: bool = True


class CustomerContactOut(BaseModel):
    id: int
    customer_id: int
    type: str
    value: str
    label: str
    is_primary: bool
    can_call: bool
    can_text: bool
    can_email: bool

    class Config:
        from_attributes = True


class CustomerAddressCreate(BaseModel):
    label: str | None = ""
    address1: str | None = None
    address2: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    is_primary: bool = False


class CustomerAddressOut(BaseModel):
    id: int
    customer_id: int
    label: str
    address1: str | None
    address2: str | None
    city: str | None
    state: str | None
    zip: str | None
    is_primary: bool

    class Config:
        from_attributes = True
