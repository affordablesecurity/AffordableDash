from __future__ import annotations

import os


def _clean_database_url(url: str | None) -> str | None:
    """
    Render env vars sometimes end up with hidden newlines or tabs.
    This aggressively removes CR/LF/TAB while preserving normal spaces.
    """
    if url is None:
        return None
    url = url.replace("\r", "").replace("\n", "").replace("\t", "").strip()

    # Normalize old postgres scheme
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    # Force psycopg v3 driver
    if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    return url


class Settings:
    # Environment
    env: str = os.getenv("ENV", "prod")

    # Auth (env-backed)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    auth_cookie_name: str = os.getenv("AUTH_COOKIE_NAME", "access_token")
    active_location_cookie_name: str = os.getenv("ACTIVE_LOCATION_COOKIE_NAME", "active_location_id")

    # ✅ Backwards-compatible aliases (what your code is trying to read)
    @property
    def secret_key(self) -> str:
        return self.SECRET_KEY

    @property
    def algorithm(self) -> str:
        return self.JWT_ALGORITHM

    # Database
    database_url: str | None = _clean_database_url(os.getenv("DATABASE_URL"))


settings = Settings()
