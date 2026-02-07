from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"

    # App + auth
    secret_key: str  # used for JWT signing
    session_cookie_name: str = "ascrm_session"  # kept but no longer primary
    auth_cookie_name: str = "ascrm_token"       # JWT cookie for web UI
    base_url: str = "http://localhost:8000"

    # JWT
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days for now

    # DB
    database_url: str = "sqlite:///./dev.sqlite3"

    # Email (placeholders)
    email_from: str = "no-reply@example.com"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_pass: str | None = None

    # SMS (placeholders)
    sms_provider: str = "twilio"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    # Stripe (placeholders)
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None


settings = Settings()
