from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class SignupIn(BaseModel):
    organization_name: str
    first_location_name: str
    email: EmailStr

    # bcrypt hard limit is 72 bytes; enforce it at validation time
    password: str = Field(min_length=8, max_length=72)

    full_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
