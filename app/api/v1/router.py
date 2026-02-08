from fastapi import APIRouter

from app.api.v1.endpoints import auth
from app.api.v1.endpoints import customers
from app.api.v1.endpoints import dashboard

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
