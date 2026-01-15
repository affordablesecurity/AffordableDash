from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.api.v1.router import api_router
from app.web.router import web_router


def create_app() -> FastAPI:
    app = FastAPI(title="Affordable CRM", version="0.1.0")

    # API routes (JSON)
    app.include_router(api_router, prefix="/api/v1")

    # Web routes (HTML)
    app.include_router(web_router)

    # Static assets
    app.mount("/static", StaticFiles(directory="app/web/static"), name="static")

    return app


app = create_app()
