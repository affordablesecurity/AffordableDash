from __future__ import annotations

import os
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str) -> str:
    """
    Force SQLAlchemy to use psycopg (v3) driver on Postgres.

    Accepts any of these and converts to postgresql+psycopg://
      - postgres://
      - postgresql://
      - postgresql+psycopg2://
      - postgresql+psycopg:// (already good)
    """
    if not url:
        return url

    url = url.strip()

    if url.startswith("postgresql+psycopg://"):
        return url

    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)

    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)

    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)

    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    database_url: str = normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./dev.db"))


settings = Settings()
