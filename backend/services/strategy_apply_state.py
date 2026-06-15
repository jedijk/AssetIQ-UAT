"""
Strategy apply state — persistence helpers extracted from routes for layer decoupling.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import db


async def mark_strategy_needs_apply(equipment_type_id: str) -> None:
    """Persist flag that schedule/programs are out of sync with strategy edits."""
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {
                "strategy_needs_apply": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


async def clear_strategy_needs_apply(
    equipment_type_id: str,
    *,
    applied_version: Optional[str] = None,
) -> None:
    """Clear apply flag after successful Apply Strategy."""
    fields: Dict[str, Any] = {
        "strategy_needs_apply": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "last_strategy_applied_at": datetime.now(timezone.utc).isoformat(),
    }
    if applied_version:
        fields["last_applied_strategy_version"] = applied_version
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {"$set": fields},
    )
