from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user_id
from app.db.session import get_db
from app.models.location import Location, UserLocation

router = APIRouter()


@router.get("/my")
def my_locations(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Returns all locations the current user belongs to.
    Works for cookie auth (browser) and bearer auth (curl).
    """
    rows = (
        db.query(UserLocation, Location)
        .join(Location, Location.id == UserLocation.location_id)
        .filter(UserLocation.user_id == user_id)
        .order_by(Location.id.asc())
        .all()
    )

    locations = []
    for membership, loc in rows:
        locations.append(
            {
                "location_id": loc.id,
                "location_name": loc.name,
                "organization_id": loc.organization_id,
                "role": membership.role,
            }
        )

    # simple default: first location
    default_location_id = locations[0]["location_id"] if locations else None

    return {
        "default_location_id": default_location_id,
        "locations": locations,
    }
