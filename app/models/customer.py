from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Tenant scoping
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)

    # Identity
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(32), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)

    # Address (simple for now)
    address1: Mapped[str] = mapped_column(String(255), nullable=True)
    address2: Mapped[str] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(80), nullable=True)
    state: Mapped[str] = mapped_column(String(32), nullable=True)
    zip: Mapped[str] = mapped_column(String(20), nullable=True)

    notes: Mapped[str] = mapped_column(String(2000), nullable=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=lambda: dt.datetime.utcnow())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=lambda: dt.datetime.utcnow())
