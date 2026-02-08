from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.core.config import settings
from app.core.dependencies import get_session_user, require_user

templates = Jinja2Templates(directory="app/web/templates")

web_router = APIRouter()


@web_router.get("/", response_class=HTMLResponse)
def home(request: Request, user=Depends(get_session_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@web_router.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request, user=Depends(require_user)):
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user})


@web_router.get("/logout")
def logout_get():
    resp = RedirectResponse(url="/", status_code=302)
    resp.delete_cookie(settings.auth_cookie_name, path="/")
    return resp
