"""
RIL Readings API
Ingest continuous data streams from external systems.
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime
from auth import get_current_user
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service import RILService
from models.ril import (
    CreateReadingRequest, BulkReadingsRequest
)

router = APIRouter(prefix="/readings", tags=["RIL Readings"])


def get_ril_service():
    """Get RIL service instance"""
    from database import db
    return RILService(db)


@router.post("", response_model=dict)
async def ingest_reading(
    request: CreateReadingRequest,
    current_user: dict = Depends(_ril_write)
):
    """
    Ingest a single reading from an external system.
    
    Automatically checks against thresholds and creates alerts if needed.
    
    Supported sources:
    - Process Historians (PI, OSIsoft, etc.)
    - SCADA Systems
    - DCS Systems
    - Vibration Systems
    - Thermal Monitoring
    - Oil Analysis
    - Ultrasonic Monitoring
    - Corrosion Monitoring
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    reading = await service.ingest_reading(owner_id, request)
    
    return {
        "success": True,
        "reading": reading.dict(),
        "alert_created": reading.is_alarm
    }


@router.post("/bulk", response_model=dict)
async def ingest_readings_bulk(
    request: BulkReadingsRequest,
    current_user: dict = Depends(_ril_write)
):
    """
    Ingest multiple readings at once.
    More efficient for batch data ingestion from external systems.
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    result = await service.ingest_readings_bulk(owner_id, request.readings)
    
    return {
        "success": True,
        **result
    }


@router.get("", response_model=dict)
async def list_readings(
    equipment_id: Optional[str] = Query(None, description="Filter by equipment ID"),
    source_system: Optional[str] = Query(None, description="Filter by source system"),
    source_tag: Optional[str] = Query(None, description="Filter by source tag"),
    from_date: Optional[datetime] = Query(None, description="Start date filter"),
    to_date: Optional[datetime] = Query(None, description="End date filter"),
    alarms_only: bool = Query(False, description="Only return readings that triggered alarms"),
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read)
):
    """
    List readings with optional filtering.
    """
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    query = {"owner_id": owner_id}
    
    if equipment_id:
        query["equipment_id"] = equipment_id
    if source_system:
        query["source_system"] = source_system
    if source_tag:
        query["source_tag"] = source_tag
    if alarms_only:
        query["is_alarm"] = True
    if from_date:
        query["timestamp"] = {"$gte": from_date}
    if to_date:
        query.setdefault("timestamp", {})["$lte"] = to_date
    
    total = await db.ril_readings.count_documents(query)
    cursor = db.ril_readings.find(query).sort("timestamp", -1).skip(skip).limit(limit)
    
    readings = []
    async for doc in cursor:
        doc.pop('_id', None)  # Remove MongoDB ObjectId
        readings.append(doc)
    
    return {
        "readings": readings,
        "total": total,
        "limit": limit,
        "skip": skip
    }
