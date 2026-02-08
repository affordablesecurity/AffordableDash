from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.web.router import web_router
from app.db.session import engine
from app.db.base import Base

# Import models so Base knows them
from app.models.user import User  # noqa: F401
from app.models.location import Location, UserLocation  # noqa: F401
from app.models.organization import Organization  # noqa: F401
from app.models.customer import Customer  # noqa: F401


def create_app() -> FastAPI:
    app = FastAPI(title="Affordable CRM", version="0.3.1")

    @app.get("/health")
    def health():
        # Simple liveness check + basic deploy info
        return {
            "status": "ok",
            "service": "Affordable CRM",
            "version": app.version,
            "env": os.getenv("RENDER_SERVICE_NAME") or os.getenv("ENV") or "unknown",
        }

    @app.on_event("startup")
    def _startup():
        # Create tables (fine for now; later we can switch to Alembic migrations)
        Base.metadata.create_all(bind=engine)
        # Helpful log line to confirm startup happened
        print(f"[startup] Affordable CRM v{app.version} started")

    app.include_router(api_router, prefix="/api/v1")
    app.include_router(web_router)

    app.mount("/static", StaticFiles(directory="app/web/static"), name="static")
    return app


app = create_app()
