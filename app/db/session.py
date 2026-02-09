from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def normalize_database_url(url: str | None) -> str:
    if not url:
        raise RuntimeError("DATABASE_URL is not set")

    # Remove hidden whitespace/newlines/tabs that break db name parsing
    url = url.replace("\r", "").replace("\n", "").replace("\t", "").strip()

    # Normalize postgres scheme
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    # Force psycopg v3 driver
    if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    return url


DATABASE_URL = normalize_database_url(
    getattr(settings, "database_url", None) or os.getenv("DATABASE_URL")
)

engine = create_engine(
    DATABASE_URL,
    future=True,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
