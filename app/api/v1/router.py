ffrom fastapi import APIRouter

from app.api.v1.endpoints import auth
from app.api.v1.endpoints import customers

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
