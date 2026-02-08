from __future__ import annotations

import os
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_database_url(url: str) -> str:
    """
    Render Postgres often provides DATABASE_URL like:
      postgres://user:pass@host:5432/db
    SQLAlchemy expects:
      postgresql+psycopg://user:pass@host:5432/db
    """
    url = url.strip()

    # Render-style legacy scheme
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)

    # If user provides postgresql://, still force psycopg driver
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Security / JWT
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    # Database
    database_url: str = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./dev.db"))


settings = Settings()
