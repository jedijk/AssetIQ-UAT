"""RIL Alerts API."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from models.ril import CreateAlertRequest, AlertPriority
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service_factory import get_ril_service, ril_owner_id

router = APIRouter(prefix="/alerts", tags=["RIL Alerts"])


@router.post("", response_model=dict)
async def create_alert(
    request: CreateAlertRequest,
    current_user: dict = Depends(_ril_write),
):
    service = get_ril_service(current_user)
    alert = await service.create_alert(ril_owner_id(current_user), request)
    return {
        "success": True,
        "alert": alert.dict(),
        "triage": alert.triage_result.dict() if alert.triage_result else None,
    }


@router.get("", response_model=dict)
async def list_alerts(
    equipment_id: Optional[str] = Query(None),
    priority: Optional[AlertPriority] = Query(None),
    status: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read),
):
    service = get_ril_service(current_user)
    alerts, total = await service.get_alerts(
        ril_owner_id(current_user),
        equipment_id=equipment_id,
        priority=priority,
        status=status,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        skip=skip,
    )
    return {
        "alerts": [a.dict() for a in alerts],
        "total": total,
        "limit": limit,
        "skip": skip,
    }


@router.get("/{alert_id}", response_model=dict)
async def get_alert(
    alert_id: str,
    current_user: dict = Depends(_ril_read),
):
    doc = await get_ril_service(current_user).get_alert_doc(ril_owner_id(current_user), alert_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"alert": doc}


@router.patch("/{alert_id}", response_model=dict)
async def update_alert(
    alert_id: str,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_user: dict = Depends(_ril_write),
):
    updated = await get_ril_service(current_user).update_alert_status(
        ril_owner_id(current_user),
        alert_id,
        status=status,
        assigned_to=assigned_to,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"success": True, "alert": updated}
