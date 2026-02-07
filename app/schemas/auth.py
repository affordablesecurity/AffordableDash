from __future__ import annotations

from pydantic import BaseModel, EmailStr


class SignupIn(BaseModel):
    organization_name: str
    first_location_name: str
    email: EmailStr
    password: str
    full_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
