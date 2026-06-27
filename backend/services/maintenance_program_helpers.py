"""Equipment lookup and criticality derivation for maintenance programs."""
from datetime import datetime
from typing import Any, Dict, Optional

from database import db
from services.criticality_score import resolve_equipment_criticality_score
from services.maintenance_tenant_scope import maintenance_scoped_job, tenant_id_from_record


async def load_equipment_for_program(
    equipment_id: str,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    equipment = await db.equipment_nodes.find_one(
        maintenance_scoped_job({"id": equipment_id}, tenant_id=tenant_id),
        {"_id": 0},
    )
    if not equipment:
        raise ValueError(f"Equipment not found: {equipment_id}")
    return equipment


def stamp_tenant_from_equipment(
    doc: Dict[str, Any],
    equipment: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Attach tenant_id from an equipment node before writing program documents."""
    tid = tenant_id_from_record(equipment)
    if tid:
        doc["tenant_id"] = tid
    return doc


def criticality_fields_from_equipment(equipment: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Derive stored program criticality fields from equipment node."""
    if not equipment or not equipment.get("criticality"):
        return {}
    crit = equipment["criticality"]
    if isinstance(crit, dict):
        level = (crit.get("level") or "low").lower()
        score = resolve_equipment_criticality_score(crit)
        return {"criticality_level": level, "criticality_score": score}
    if isinstance(crit, str):
        return {"criticality_level": crit.lower()}
    return {}


def bump_version(version: str) -> str:
    """Increment version number."""
    try:
        major, minor = map(int, version.split("."))
        return f"{major}.{minor + 1}"
    except (ValueError, AttributeError):
        return "1.1"


async def log_program_audit(
    action: str,
    equipment_id: str,
    user_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Log audit entry for maintenance program changes."""
    await db.maintenance_program_audit.insert_one({
        "action": action,
        "equipment_id": equipment_id,
        "user_id": user_id,
        "details": details or {},
        "timestamp": datetime.utcnow().isoformat(),
    })
