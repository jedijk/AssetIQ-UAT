"""Risk Settings routes."""
from typing import List

from fastapi import APIRouter, Depends

from auth import get_current_user
from models.risk_settings import RiskSettingsUpdate, RiskSettingsResponse
from services import risk_settings_service as svc

router = APIRouter(tags=["Risk Settings"])


@router.get("/risk-settings")
async def get_all_risk_settings(
    current_user: dict = Depends(get_current_user),
) -> List[RiskSettingsResponse]:
    return await svc.get_all_risk_settings(current_user)


@router.get("/risk-settings/{installation_id}")
async def get_risk_settings(
    installation_id: str,
    current_user: dict = Depends(get_current_user),
) -> RiskSettingsResponse:
    return await svc.get_risk_settings(current_user, installation_id)


@router.put("/risk-settings/{installation_id}")
async def update_risk_settings(
    installation_id: str,
    updates: RiskSettingsUpdate,
    recalculate: bool = True,
    current_user: dict = Depends(get_current_user),
):
    return await svc.update_risk_settings(
        current_user,
        installation_id,
        updates,
        recalculate=recalculate,
    )


@router.post("/risk-settings/{installation_id}/recalculate")
async def trigger_recalculation(
    installation_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.trigger_recalculation(current_user, installation_id)


@router.delete("/risk-settings/{installation_id}")
async def reset_risk_settings(
    installation_id: str,
    recalculate: bool = True,
    current_user: dict = Depends(get_current_user),
):
    return await svc.reset_risk_settings(
        current_user,
        installation_id,
        recalculate=recalculate,
    )
