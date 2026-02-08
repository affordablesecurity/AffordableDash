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

    # env: dev | prod (default prod on Render)
    env: str = os.getenv("ENV", os.getenv("APP_ENV", "prod")).lower()

    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    # Primary cookie used by API auth endpoints (login/signup)
    auth_cookie_name: str = os.getenv("AUTH_COOKIE_NAME", "affordablecrm_auth")

    # Web UI “session” cookie name.
    # For now we intentionally use the SAME cookie as auth_cookie_name so
    # the UI can read auth the same way as the API.
    session_cookie_name: str = os.getenv("SESSION_COOKIE_NAME", auth_cookie_name)

    # Cookie behavior
    cookie_path: str = os.getenv("COOKIE_PATH", "/")
    cookie_samesite: str = os.getenv("COOKIE_SAMESITE", "lax")  # lax is best default for same-site apps
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "").lower() in ("1", "true", "yes") or (env != "dev")

    database_url: str = normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./dev.db"))


settings = Settings()
