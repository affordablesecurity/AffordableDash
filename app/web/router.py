from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.core.dependencies import get_session_user, require_user
from app.core.config import settings

templates = Jinja2Templates(directory="app/web/templates")

web_router = APIRouter()


@web_router.get("/", response_class=HTMLResponse)
def home(request: Request, user=Depends(get_session_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=302)

    # Show login form
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@web_router.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request, user=Depends(require_user)):
    # At this point require_user should have validated cookie/header and returned the user object
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user})


@web_router.get("/logout")
def logout_get():
    """
    UI convenience route.
    Clears the auth cookie and sends user back to login page.
    """
    resp = RedirectResponse(url="/", status_code=302)

    # IMPORTANT: clear the same cookie name you set in /api/v1/auth/login and /signup
    resp.delete_cookie(
        key=settings.auth_cookie_name,
        path="/",
    )
    return resp
