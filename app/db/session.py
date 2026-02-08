from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def _normalize_database_url(url: str | None) -> str:
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it in Render Environment as DATABASE_URL."
        )

    # Remove hidden whitespace/newlines that often get pasted into env vars
    url = url.strip()

    # Render / other platforms sometimes use postgres://
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    # Force SQLAlchemy to use psycopg v3 driver
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    # If someone already set postgresql+psycopg://, keep it as-is
    return url


DATABASE_URL = _normalize_database_url(getattr(settings, "database_url", None) or os.getenv("DATABASE_URL"))

engine = create_engine(
    DATABASE_URL,
    future=True,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
