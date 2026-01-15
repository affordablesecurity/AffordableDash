from __future__ import annotations

import datetime as dt
from sqlalchemy import DateTime, Integer, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Phoenix")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False, default=lambda: dt.datetime.utcnow())

    users: Mapped[list["UserLocation"]] = relationship(back_populates="location", cascade="all, delete-orphan")


class UserLocation(Base):
    __tablename__ = "user_locations"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="tech")  # tech, dispatcher, manager, owner

    user: Mapped["User"] = relationship(back_populates="locations")
    location: Mapped["Location"] = relationship(back_populates="users")
