"""Threshold evaluation and breach observation creation for form submissions."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId


def evaluate_numeric_threshold(value: Any, thresholds: Dict[str, Any]) -> str:
    """Evaluate a numeric value against thresholds."""
    try:
        val = float(value)
    except (TypeError, ValueError):
        return "normal"

    critical_low = thresholds.get("critical_low")
    critical_high = thresholds.get("critical_high")

    if critical_low is not None and val < critical_low:
        return "critical"
    if critical_high is not None and val > critical_high:
        return "critical"

    warning_low = thresholds.get("warning_low")
    warning_high = thresholds.get("warning_high")

    if warning_low is not None and val < warning_low:
        return "warning"
    if warning_high is not None and val > warning_high:
        return "warning"

    return "normal"


def check_failure_indicator(value: Any, field_def: Dict[str, Any]) -> bool:
    """Check if a value indicates failure based on field configuration."""
    indicator_type = field_def.get("failure_indicator_type", "none")

    if indicator_type == "none":
        return False

    thresholds = field_def.get("thresholds", {})

    try:
        val = float(value)
    except (TypeError, ValueError):
        return False

    if indicator_type == "above":
        threshold = thresholds.get("critical_high") or thresholds.get("warning_high")
        return threshold is not None and val > threshold

    if indicator_type == "below":
        threshold = thresholds.get("critical_low") or thresholds.get("warning_low")
        return threshold is not None and val < threshold

    if indicator_type == "outside":
        low = thresholds.get("warning_low")
        high = thresholds.get("warning_high")
        if low is not None and high is not None:
            return val < low or val > high

    return False


async def create_observation_for_breach(
    observations,
    efms,
    submission: Dict,
    breach: Dict,
    field_def: Dict,
    created_by: str,
) -> Optional[Dict]:
    """Create an observation when a threshold breach occurs."""
    now = datetime.now(timezone.utc)

    obs_doc = {
        "equipment_id": submission.get("equipment_id"),
        "efm_id": submission.get("efm_id") or field_def.get("failure_mode_id"),
        "task_id": submission.get("task_instance_id"),
        "form_submission_id": str(submission["_id"]),
        "source": "form_threshold_breach",
        "description": (
            f"Threshold breach detected: {breach['field_label']} = "
            f"{breach['value']} {breach.get('unit', '')}"
        ),
        "severity": breach["status"],
        "field_id": breach["field_id"],
        "field_label": breach["field_label"],
        "measured_value": breach["value"],
        "unit": breach.get("unit"),
        "threshold_status": breach["status"],
        "created_by": created_by,
        "created_at": now,
    }

    result = await observations.insert_one(obs_doc)
    obs_doc["_id"] = result.inserted_id

    if obs_doc.get("efm_id"):
        await efms.update_one(
            {"_id": ObjectId(obs_doc["efm_id"])},
            {
                "$inc": {"observations_count": 1},
                "$set": {"last_observation_at": now},
            },
        )

    return {
        "id": str(obs_doc["_id"]),
        "description": obs_doc["description"],
        "severity": obs_doc["severity"],
    }
