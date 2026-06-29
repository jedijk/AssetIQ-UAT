"""Failure modes library routes — write service module."""
from fastapi import HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime, timezone
import logging
from database import db, failure_modes_service, efm_service
from services.threat_score_service import recalculate_threat_scores_for_failure_mode
from services.translation_service import TranslationService
from models.translation import EntityType
from failure_modes import FAILURE_MODES_LIBRARY

logger = logging.getLogger(__name__)


def _require_owner(current_user: dict) -> None:
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")


def format_recommended_actions_text(actions: Optional[List[Any]]) -> str:
    """Flatten recommended action objects for translation prompts."""
    if not actions:
        return ""
    parts: List[str] = []
    for item in actions:
        if isinstance(item, dict):
            text = item.get("description") or item.get("action") or item.get("title")
            parts.append(str(text if text else item))
        else:
            parts.append(str(item))
    return ", ".join(parts)


class FailureModeCreate(BaseModel):
    category: str
    equipment: str
    failure_mode: str
    keywords: List[str] = []
    severity: int = Field(ge=1, le=10)
    occurrence: int = Field(ge=1, le=10)
    detectability: int = Field(ge=1, le=10)
    recommended_actions: List[Any] = []
    equipment_type_ids: List[str] = []
    description: Optional[str] = None
    source: Optional[str] = None
    linked_threat_id: Optional[str] = None
    failure_mode_type: Optional[str] = None
    process: Optional[str] = None
    potential_effects: Optional[Any] = None
    potential_causes: Optional[Any] = None
    iso14224_mechanism: Optional[str] = None

    model_config = {"extra": "ignore"}


class FailureModeUpdate(BaseModel):
    category: Optional[str] = None
    equipment: Optional[str] = None
    failure_mode: Optional[str] = None
    keywords: Optional[List[str]] = None
    severity: Optional[int] = Field(None, ge=1, le=10)
    occurrence: Optional[int] = Field(None, ge=1, le=10)
    detectability: Optional[int] = Field(None, ge=1, le=10)
    recommended_actions: Optional[List[Any]] = None
    equipment_type_ids: Optional[List[str]] = None
    is_validated: Optional[bool] = None
    validated_by_name: Optional[str] = None
    validated_by_position: Optional[str] = None
    validated_at: Optional[str] = None
    process: Optional[str] = None
    potential_effects: Optional[Any] = None
    potential_causes: Optional[Any] = None
    iso14224_mechanism: Optional[str] = None
    failure_mode_type: Optional[str] = None
    change_reason: Optional[str] = None
    ai_improved_at: Optional[str] = None

    model_config = {"extra": "ignore"}


class FailureModeValidation(BaseModel):
    """Model for validating a failure mode"""

    validated_by_name: str
    validated_by_position: str
    validated_by_id: Optional[str] = None


def auto_link_equipment_types(equipment_name: str) -> List[str]:
    """Auto-detect equipment types based on equipment name. Returns list of matching type IDs."""
    equipment_lower = equipment_name.lower()

    equipment_mapping = {
        "pump": ["pump_centrifugal", "pump_reciprocating"],
        "centrifugal pump": ["pump_centrifugal"],
        "reciprocating pump": ["pump_reciprocating"],
        "compressor": ["compressor_centrifugal", "compressor_reciprocating"],
        "centrifugal compressor": ["compressor_centrifugal"],
        "reciprocating compressor": ["compressor_reciprocating"],
        "turbine": ["turbine_gas", "turbine_steam"],
        "gas turbine": ["turbine_gas"],
        "steam turbine": ["turbine_steam"],
        "motor": ["motor_electric"],
        "vessel": ["vessel_pressure", "vessel_storage"],
        "pressure vessel": ["vessel_pressure"],
        "storage tank": ["vessel_storage"],
        "tank": ["vessel_storage"],
        "heat exchanger": ["heat_exchanger"],
        "exchanger": ["heat_exchanger"],
        "pipe": ["pipe"],
        "piping": ["pipe"],
        "valve": ["valve_control", "valve_safety", "valve_manual"],
        "control valve": ["valve_control"],
        "safety valve": ["valve_safety"],
        "manual valve": ["valve_manual"],
        "sensor": ["sensor_pressure", "sensor_temperature", "sensor_flow"],
        "pressure sensor": ["sensor_pressure"],
        "temperature sensor": ["sensor_temperature"],
        "flow sensor": ["sensor_flow"],
        "transmitter": ["sensor_pressure", "sensor_temperature", "sensor_flow"],
        "plc": ["plc"],
        "controller": ["plc"],
        "generator": ["turbine_gas", "turbine_steam"],
        "transformer": ["transformer"],
        "switchgear": ["switchgear"],
        "extruder": ["extruder"],
        "filter": ["pipe"],
        "boiler": ["heat_exchanger"],
        "furnace": ["heat_exchanger"],
        "heater": ["heat_exchanger"],
        "cooler": ["heat_exchanger"],
        "fan": ["motor_electric"],
        "blower": ["compressor_centrifugal"],
    }

    for keyword, type_ids in equipment_mapping.items():
        if keyword in equipment_lower:
            return type_ids
    return []


async def auto_translate_failure_mode(fm_id: str, fm_data: dict, created_by: str = None):
    """Background task to auto-translate a failure mode to Dutch and German."""
    try:
        translation_service = TranslationService(db)
        await translation_service.translate_entity(
            entity_type=EntityType.FAILURE_MODE,
            entity_id=fm_id,
            entity_data=fm_data,
            target_languages=["nl", "de"],
            created_by=created_by,
        )
        logger.info(f"Auto-translated failure mode {fm_id} to Dutch and German")
    except Exception as e:
        logger.error(f"Failed to auto-translate failure mode {fm_id}: {e}")


async def create_failure_mode(data: FailureModeCreate, *, current_user: dict):
    """Create a new failure mode in MongoDB."""
    equipment_type_ids = data.equipment_type_ids if data.equipment_type_ids else auto_link_equipment_types(data.equipment)

    try:
        existing = await failure_modes_service.find_by_name(data.failure_mode)
        if existing:
            raise HTTPException(status_code=400, detail="A failure mode with this name already exists")

        new_fm = await failure_modes_service.create(
            data={
                "category": data.category,
                "equipment": data.equipment,
                "failure_mode": data.failure_mode,
                "keywords": data.keywords,
                "severity": data.severity,
                "occurrence": data.occurrence,
                "detectability": data.detectability,
                "recommended_actions": data.recommended_actions,
                "equipment_type_ids": equipment_type_ids,
                "description": data.description,
                "source": data.source,
                "linked_threat_id": data.linked_threat_id,
                "failure_mode_type": data.failure_mode_type or "generic",
                "process": data.process,
                "potential_effects": data.potential_effects,
                "potential_causes": data.potential_causes,
                "iso14224_mechanism": data.iso14224_mechanism,
            },
            created_by=current_user["id"],
            user=current_user,
        )

        return new_fm
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating failure mode in MongoDB: {e}")
        max_id = max((fm["id"] for fm in FAILURE_MODES_LIBRARY), default=0)
        new_id = max_id + 1

        new_fm = {
            "id": new_id,
            "category": data.category,
            "equipment": data.equipment,
            "failure_mode": data.failure_mode,
            "keywords": data.keywords,
            "severity": data.severity,
            "occurrence": data.occurrence,
            "detectability": data.detectability,
            "rpn": data.severity * data.occurrence * data.detectability,
            "recommended_actions": data.recommended_actions,
            "equipment_type_ids": equipment_type_ids,
            "process": data.process,
            "potential_effects": data.potential_effects,
            "potential_causes": data.potential_causes,
            "iso14224_mechanism": data.iso14224_mechanism,
            "is_custom": True,
            "created_by": current_user["id"],
        }

        FAILURE_MODES_LIBRARY.append(new_fm)
        return new_fm


async def update_failure_mode(mode_id: str, data: FailureModeUpdate, *, current_user: dict):
    """Update a failure mode in MongoDB."""
    try:
        update_data = {}
        if data.category is not None:
            update_data["category"] = data.category
        if data.equipment is not None:
            update_data["equipment"] = data.equipment
            if data.equipment_type_ids is None:
                auto_types = auto_link_equipment_types(data.equipment)
                if auto_types:
                    update_data["equipment_type_ids"] = auto_types
        if data.failure_mode is not None:
            update_data["failure_mode"] = data.failure_mode
        if data.keywords is not None:
            update_data["keywords"] = data.keywords
        if data.severity is not None:
            update_data["severity"] = data.severity
        if data.occurrence is not None:
            update_data["occurrence"] = data.occurrence
        if data.detectability is not None:
            update_data["detectability"] = data.detectability
        if data.recommended_actions is not None:
            update_data["recommended_actions"] = data.recommended_actions
        if data.equipment_type_ids is not None:
            update_data["equipment_type_ids"] = data.equipment_type_ids
        if data.process is not None:
            update_data["process"] = data.process
        if data.potential_effects is not None:
            update_data["potential_effects"] = data.potential_effects
        if data.potential_causes is not None:
            update_data["potential_causes"] = data.potential_causes
        if data.iso14224_mechanism is not None:
            update_data["iso14224_mechanism"] = data.iso14224_mechanism
        if data.failure_mode_type is not None:
            update_data["failure_mode_type"] = data.failure_mode_type
        if data.ai_improved_at is not None:
            update_data["ai_improved_at"] = data.ai_improved_at

        result = await failure_modes_service.update(
            mode_id,
            update_data,
            updated_by=current_user.get("name", current_user.get("email", "Unknown")),
            change_reason=data.change_reason,
        )

        if result:
            if result.get("fmea_changed"):
                old_name = result.get("old_failure_mode_name", result["failure_mode"])
                updated_threats = await recalculate_threat_scores_for_failure_mode(
                    old_name,
                    result["severity"],
                    result["occurrence"],
                    result["detectability"],
                    user=current_user,
                )
                logger.info(f"Updated {updated_threats} threat scores after FMEA change")
                result["threats_updated"] = updated_threats

                try:
                    efms_updated = await efm_service.propagate_template_change(
                        failure_mode_id=mode_id,
                        new_severity=data.severity,
                        new_occurrence=data.occurrence,
                        new_detectability=data.detectability,
                    )
                    result["efms_updated"] = efms_updated
                    logger.info(f"Propagated FMEA change to {efms_updated} EFMs")
                except Exception as efm_err:
                    logger.error(f"Failed to propagate to EFMs: {efm_err}")

            return result

        raise HTTPException(status_code=404, detail="Failure mode not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating failure mode: {e}")
        try:
            legacy_id = int(mode_id)
            for fm in FAILURE_MODES_LIBRARY:
                if fm["id"] == legacy_id:
                    if data.category is not None:
                        fm["category"] = data.category
                    if data.equipment is not None:
                        fm["equipment"] = data.equipment
                    if data.failure_mode is not None:
                        fm["failure_mode"] = data.failure_mode
                    if data.keywords is not None:
                        fm["keywords"] = data.keywords
                    if data.severity is not None:
                        fm["severity"] = data.severity
                    if data.occurrence is not None:
                        fm["occurrence"] = data.occurrence
                    if data.detectability is not None:
                        fm["detectability"] = data.detectability
                    if data.recommended_actions is not None:
                        fm["recommended_actions"] = data.recommended_actions
                    if data.equipment_type_ids is not None:
                        fm["equipment_type_ids"] = data.equipment_type_ids
                    fm["rpn"] = fm["severity"] * fm["occurrence"] * fm["detectability"]
                    return fm
        except ValueError:
            pass
        raise HTTPException(status_code=404, detail="Failure mode not found")


async def validate_failure_mode(mode_id: str, data: FailureModeValidation, *, current_user: dict):
    """Validate a failure mode with validator name and position."""
    try:
        validated_by_id = data.validated_by_id or current_user.get("id") or current_user.get("user_id")

        result = await failure_modes_service.validate(
            mode_id,
            data.validated_by_name,
            data.validated_by_position,
            validated_by_id,
        )
        if result:
            return result
        raise HTTPException(status_code=404, detail="Failure mode not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating failure mode: {e}")
        try:
            legacy_id = int(mode_id)
            for fm in FAILURE_MODES_LIBRARY:
                if fm["id"] == legacy_id:
                    fm["is_validated"] = True
                    fm["validated_by_name"] = data.validated_by_name
                    fm["validated_by_position"] = data.validated_by_position
                    fm["validated_by_id"] = validated_by_id
                    fm["validated_at"] = datetime.now(timezone.utc).isoformat()
                    return fm
        except ValueError:
            pass
        raise HTTPException(status_code=404, detail="Failure mode not found")


async def unvalidate_failure_mode(mode_id: str, *, current_user: dict):
    """Remove validation from a failure mode."""
    try:
        result = await failure_modes_service.unvalidate(mode_id)
        if result:
            return result
        raise HTTPException(status_code=404, detail="Failure mode not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unvalidating failure mode: {e}")
        try:
            legacy_id = int(mode_id)
            for fm in FAILURE_MODES_LIBRARY:
                if fm["id"] == legacy_id:
                    fm["is_validated"] = False
                    fm["validated_by_name"] = None
                    fm["validated_by_position"] = None
                    fm["validated_at"] = None
                    return fm
        except ValueError:
            pass
        raise HTTPException(status_code=404, detail="Failure mode not found")


async def delete_failure_mode(mode_id: str, *, current_user: dict):
    """Delete a custom failure mode from MongoDB."""
    try:
        deleted = await failure_modes_service.delete(mode_id)
        if deleted:
            return {"message": "Failure mode deleted"}
        raise HTTPException(status_code=404, detail="Failure mode not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting failure mode: {e}")
        try:
            legacy_id = int(mode_id)
            for i, fm in enumerate(FAILURE_MODES_LIBRARY):
                if fm["id"] == legacy_id:
                    if not fm.get("is_custom"):
                        raise HTTPException(status_code=400, detail="Cannot delete built-in failure modes")
                    FAILURE_MODES_LIBRARY.pop(i)
                    return {"message": "Failure mode deleted"}
        except ValueError:
            pass
        raise HTTPException(status_code=404, detail="Failure mode not found")
