"""One-shot cleanup: legacy investigation-linked central_actions rows."""
from __future__ import annotations

from typing import Any, Dict


async def cleanup_legacy_investigation_actions(db) -> Dict[str, Any]:
    """
    Remove legacy 'Complete causal investigation' central_actions from the old sync model.
    Safe to re-run — deletes only rows matching the legacy pattern.
    """
    result = await db.central_actions.delete_many({
        "source_type": "investigation",
        "source_id": {"$exists": True},
    })
    return {"deleted_count": result.deleted_count}
