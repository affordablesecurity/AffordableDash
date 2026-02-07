from __future__ import annotations

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


def create_app() -> FastAPI:
    app = FastAPI(title="Affordable CRM", version="0.2.0")

    @app.on_event("startup")
    def _startup():
        # Render-friendly: create tables if missing
        Base.metadata.create_all(bind=engine)

    # API routes (JSON)
    app.include_router(api_router, prefix="/api/v1")

    # Web routes (HTML)
    app.include_router(web_router)

    # Static assets
    app.mount("/static", StaticFiles(directory="app/web/static"), name="static")

    return app


app = create_app()
