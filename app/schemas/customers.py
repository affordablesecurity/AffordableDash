from __future__ import annotations

from pydantic import BaseModel, EmailStr


class CustomerCreate(BaseModel):
    location_id: int
    first_name: str
    last_name: str = ""
    phone: str | None = None
    email: EmailStr | None = None
    address1: str | None = None
    address2: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    notes: str | None = None


class CustomerUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address1: str | None = None
    address2: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    notes: str | None = None


class CustomerOut(BaseModel):
    id: int
    organization_id: int
    location_id: int
    first_name: str
    last_name: str
    phone: str | None
    email: EmailStr | None

    address1: str | None
    address2: str | None
    city: str | None
    state: str | None
    zip: str | None

    notes: str | None

    class Config:
        from_attributes = True
