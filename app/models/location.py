from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Phoenix")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=lambda: dt.datetime.utcnow())

    users: Mapped[list["UserLocation"]] = relationship(
        "UserLocation",
        back_populates="location",
        cascade="all, delete-orphan",
    )


class UserLocation(Base):
    __tablename__ = "user_locations"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="tech")  # tech|dispatcher|manager|owner

    user: Mapped["User"] = relationship("User", back_populates="locations")
    location: Mapped["Location"] = relationship("Location", back_populates="users")
