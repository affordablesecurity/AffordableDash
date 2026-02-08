from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user_id
from app.db.session import get_db
from app.models.location import Location, UserLocation
from app.models.user import User

router = APIRouter()


@router.get("/summary")
def dashboard_summary(
    location_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Safe starter summary for dashboard UI.
    For now, returns placeholder numbers (0) until Jobs/Invoices/etc exist.
    """
    # Verify user has access to location_id (join table)
    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id, UserLocation.location_id == location_id)
        .first()
    )
    if not membership:
        # Keep it simple: UI will show an error message if needed
        return {
            "location_id": location_id,
            "error": "Not authorized for this location",
        }

    # Placeholder totals (until you add tables)
    return {
        "location_id": location_id,
        "cards": {
            "estimates_open_count": 0,
            "estimates_open_amount": 0,
            "jobs_unscheduled_count": 0,
            "jobs_unscheduled_amount": 0,
            "invoices_open_count": 0,
            "invoices_open_amount": 0,
            "service_plans_unscheduled_count": 0,
        },
        "week_to_date": {
            "job_revenue_earned": 0,
            "jobs_completed": 0,
            "average_job_size": 0,
            "total_new_jobs_booked": 0,
            "new_jobs_booked_online": 0,
        },
    }


@router.get("/employees")
def dashboard_employees(
    location_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Starter employee status list.
    For now it returns just the current user + placeholder jobs.
    Later we'll connect to dispatch/schedule tables.
    """
    membership = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id, UserLocation.location_id == location_id)
        .first()
    )
    if not membership:
        return {"location_id": location_id, "error": "Not authorized for this location"}

    user = db.get(User, user_id)
    loc = db.get(Location, location_id)

    # Phoenix-ish default center (you can swap based on location later)
    map_center = {"lat": 33.4484, "lng": -112.0740}
    if loc and loc.timezone == "America/Phoenix":
        map_center = {"lat": 33.4484, "lng": -112.0740}

    return {
        "location_id": location_id,
        "map": {
            "center": map_center,
            "pins": [
                {"lat": map_center["lat"], "lng": map_center["lng"], "label": "Active area"}
            ],
        },
        "employees": [
            {
                "name": user.full_name or user.email,
                "sub": user.email,
                "items": [
                    {"time": "10:00am - 11:00am", "title": "Job 7153", "customer": "Andrea Alvarado"},
                    {"time": "1:00pm - 2:00pm", "title": "Job 7160", "customer": "Stella"},
                ],
            }
        ],
    }
