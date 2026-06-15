"""RIL Readings API."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from models.ril import CreateReadingRequest, BulkReadingsRequest
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service_factory import get_ril_service, ril_owner_id

router = APIRouter(prefix="/readings", tags=["RIL Readings"])


@router.post("", response_model=dict)
async def ingest_reading(
    request: CreateReadingRequest,
    current_user: dict = Depends(_ril_write),
):
    service = get_ril_service()
    reading = await service.ingest_reading(ril_owner_id(current_user), request)
    return {
        "success": True,
        "reading": reading.dict(),
        "alert_created": reading.is_alarm,
    }


@router.post("/bulk", response_model=dict)
async def ingest_readings_bulk(
    request: BulkReadingsRequest,
    current_user: dict = Depends(_ril_write),
):
    service = get_ril_service()
    result = await service.ingest_readings_bulk(
        ril_owner_id(current_user),
        request.readings,
    )
    return {"success": True, **result}


@router.get("", response_model=dict)
async def list_readings(
    equipment_id: Optional[str] = Query(None),
    source_system: Optional[str] = Query(None),
    source_tag: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    alarms_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read),
):
    readings, total = await get_ril_service().list_readings(
        ril_owner_id(current_user),
        equipment_id=equipment_id,
        source_system=source_system,
        source_tag=source_tag,
        from_date=from_date,
        to_date=to_date,
        alarms_only=alarms_only,
        limit=limit,
        skip=skip,
    )
    return {"readings": readings, "total": total, "limit": limit, "skip": skip}
