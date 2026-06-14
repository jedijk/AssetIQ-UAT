"""Equipment Search and Utility operations."""
from fastapi import APIRouter, Depends

from auth import get_current_user
from services import equipment_utils_service as svc

router = APIRouter()


@router.get("/equipment-hierarchy/disciplines")
async def get_disciplines():
    """Get all disciplines."""
    return svc.get_disciplines()


@router.get("/equipment-hierarchy/search")
async def search_equipment(
    q: str,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Search equipment hierarchy by name."""
    return await svc.search_equipment(current_user, q, limit=limit)


@router.get("/equipment-hierarchy/criticality-profiles")
async def get_criticality_profiles():
    """Get all criticality profiles."""
    return svc.get_criticality_profiles()


@router.get("/equipment-hierarchy/iso-levels")
async def get_iso_levels():
    """Get ISO 14224 hierarchy levels with labels."""
    return svc.get_iso_levels()
