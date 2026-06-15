"""Per-installation risk calculation settings."""
import logging
from datetime import datetime, timezone
from typing import List

from fastapi import HTTPException

from database import db
from models.risk_settings import (
    RiskSettingsUpdate,
    RiskSettingsResponse,
    DEFAULT_RISK_SETTINGS,
)
from services.tenant_schema import merge_tenant_filter
from services.threat_score_service import (
    get_risk_settings_for_installation,
    recalculate_all_for_installation,
)

logger = logging.getLogger(__name__)


async def get_all_risk_settings(user: dict) -> List[RiskSettingsResponse]:
    assigned = user.get("assigned_installations", [])
    is_owner = user.get("role") == "owner"

    if is_owner or not assigned:
        installations = await db.equipment_nodes.find(
            merge_tenant_filter({"level": "installation"}, user),
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(100)
    else:
        installations = await db.equipment_nodes.find(
            merge_tenant_filter(
                {"level": "installation", "name": {"$in": assigned}},
                user,
            ),
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(100)

    installation_ids = [i["id"] for i in installations]
    existing_settings = await db.risk_settings.find(
        {"installation_id": {"$in": installation_ids}},
        {"_id": 0},
    ).to_list(100)

    settings_map = {s["installation_id"]: s for s in existing_settings}

    result = []
    for inst in installations:
        settings = settings_map.get(inst["id"], {})
        result.append(RiskSettingsResponse(
            installation_id=inst["id"],
            installation_name=inst["name"],
            criticality_weight=settings.get("criticality_weight", DEFAULT_RISK_SETTINGS["criticality_weight"]),
            fmea_weight=settings.get("fmea_weight", DEFAULT_RISK_SETTINGS["fmea_weight"]),
            critical_threshold=settings.get("critical_threshold", DEFAULT_RISK_SETTINGS["critical_threshold"]),
            high_threshold=settings.get("high_threshold", DEFAULT_RISK_SETTINGS["high_threshold"]),
            medium_threshold=settings.get("medium_threshold", DEFAULT_RISK_SETTINGS["medium_threshold"]),
            updated_at=settings.get("updated_at"),
            updated_by=settings.get("updated_by"),
        ))
    return result


async def _get_installation(user: dict, installation_id: str) -> dict:
    installation = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": installation_id, "level": "installation"}, user),
        {"_id": 0, "id": 1, "name": 1},
    )
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    return installation


async def get_risk_settings(user: dict, installation_id: str) -> RiskSettingsResponse:
    installation = await _get_installation(user, installation_id)
    settings = await get_risk_settings_for_installation(installation_id)
    stored = await db.risk_settings.find_one(
        {"installation_id": installation_id},
        {"_id": 0},
    )
    return RiskSettingsResponse(
        installation_id=installation_id,
        installation_name=installation["name"],
        criticality_weight=settings["criticality_weight"],
        fmea_weight=settings["fmea_weight"],
        critical_threshold=settings["critical_threshold"],
        high_threshold=settings["high_threshold"],
        medium_threshold=settings["medium_threshold"],
        updated_at=stored.get("updated_at") if stored else None,
        updated_by=stored.get("updated_by") if stored else None,
    )


async def update_risk_settings(
    user: dict,
    installation_id: str,
    updates: RiskSettingsUpdate,
    recalculate: bool = True,
) -> dict:
    if user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can modify risk settings")

    installation = await _get_installation(user, installation_id)
    current_settings = await get_risk_settings_for_installation(installation_id)
    update_data = updates.model_dump(exclude_unset=True)

    crit_weight = update_data.get("criticality_weight", current_settings["criticality_weight"])
    fmea_weight = update_data.get("fmea_weight", current_settings["fmea_weight"])

    if "criticality_weight" in update_data and "fmea_weight" not in update_data:
        update_data["fmea_weight"] = round(1.0 - crit_weight, 2)
    elif "fmea_weight" in update_data and "criticality_weight" not in update_data:
        update_data["criticality_weight"] = round(1.0 - fmea_weight, 2)

    total_weight = update_data.get("criticality_weight", crit_weight) + update_data.get("fmea_weight", fmea_weight)
    if abs(total_weight - 1.0) > 0.01:
        raise HTTPException(status_code=400, detail=f"Weights must sum to 1.0 (currently {total_weight})")

    update_data["installation_id"] = installation_id
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user["id"]

    await db.risk_settings.update_one(
        {"installation_id": installation_id},
        {"$set": update_data},
        upsert=True,
    )

    logger.info("Risk settings updated for installation %s by %s", installation_id, user["id"])

    recalc_result = None
    if recalculate:
        recalc_result = await recalculate_all_for_installation(installation_id, user=user)

    new_settings = await get_risk_settings_for_installation(installation_id)
    return {
        "message": "Risk settings updated successfully",
        "installation_id": installation_id,
        "installation_name": installation["name"],
        "settings": new_settings,
        "recalculation": recalc_result,
    }


async def trigger_recalculation(user: dict, installation_id: str) -> dict:
    if user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can trigger recalculation")

    installation = await _get_installation(user, installation_id)
    result = await recalculate_all_for_installation(installation_id, user=user)
    return {"message": "Recalculation completed", "installation_name": installation["name"], **result}


async def reset_risk_settings(
    user: dict,
    installation_id: str,
    recalculate: bool = True,
) -> dict:
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can reset risk settings")

    result = await db.risk_settings.delete_one({"installation_id": installation_id})
    recalc_result = None
    if recalculate and result.deleted_count > 0:
        recalc_result = await recalculate_all_for_installation(installation_id, user=user)

    return {
        "message": "Risk settings reset to defaults",
        "installation_id": installation_id,
        "defaults": DEFAULT_RISK_SETTINGS,
        "recalculation": recalc_result,
    }
