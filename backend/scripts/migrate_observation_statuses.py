"""
One-shot migration to align legacy observation/threat statuses with the new
process-journey based status model used in the Observation Workspace.

Old → new mapping (case-insensitive on legacy values):

    open / parked           → Observation
    in progress             → Assessment (refined further if data justifies it)
    closed                  → Learning
    mitigated               → Mitigated

For observations that have richer linked data (failure mode, equipment, actions,
investigation), the script promotes the status to the furthest applicable stage:

    has FM + Equipment + risk_score      → Assessment
    has actions linked                   → Planning
    has open investigation               → Investigation
    has completed actions                → Action
    has closed investigation + actions   → Mitigated

The new status model values are exactly:
    Observation, Assessment, Planning, Investigation, Action, Mitigated, Learning

Safe to run repeatedly — observations already on the new model are skipped.
"""

import logging

logger = logging.getLogger(__name__)

NEW_STATUSES = {"Observation", "Assessment", "Planning", "Investigation",
                "Action", "Mitigated", "Learning"}

LEGACY_MAP = {
    "open": "Observation",
    "parked": "Observation",
    "in progress": "Assessment",
    "in_progress": "Assessment",
    "closed": "Learning",
    "mitigated": "Mitigated",
    "draft": "Observation",
    "active": "Assessment",
}


async def _derive_stage(db, observation: dict) -> str:
    """Derive the furthest applicable journey stage from the observation's data."""
    obs_id = observation.get("id")
    has_fm = bool(observation.get("failure_mode") or observation.get("failure_mode_id"))
    has_eq = bool(observation.get("linked_equipment_id"))
    has_risk = (observation.get("risk_score") or 0) > 0

    # Default start: Observation
    stage = "Observation"

    if has_fm and has_eq and has_risk:
        stage = "Assessment"

    # Linked actions promote to Planning
    actions_count = await db.central_actions.count_documents({
        "$or": [
            {"source_id": obs_id},
            {"observation_id": obs_id},
            {"threat_id": obs_id},
        ]
    })
    if actions_count > 0 and stage in ("Observation", "Assessment"):
        stage = "Planning"

    # Investigation (open) promotes to Investigation
    inv = await db.investigations.find_one({"threat_id": obs_id}, {"_id": 0, "status": 1})
    inv_status = (inv or {}).get("status", "").lower() if inv else ""

    if inv:
        if inv_status in ("completed", "closed"):
            # Investigation done — next stages depend on actions completion
            pass
        else:
            # Active investigation
            if stage in ("Observation", "Assessment", "Planning"):
                stage = "Investigation"

    # Action stage: any completed actions
    if actions_count > 0:
        completed = await db.central_actions.count_documents({
            "$or": [
                {"source_id": obs_id},
                {"observation_id": obs_id},
                {"threat_id": obs_id},
            ],
            "status": {"$in": ["completed", "validated"]}
        })
        if completed > 0 and stage in ("Observation", "Assessment", "Planning", "Investigation"):
            stage = "Action"
        # All actions completed AND investigation completed → Mitigated
        if completed == actions_count and inv_status in ("completed", "closed"):
            stage = "Mitigated"

    # Closed legacy → Learning (final)
    return stage


async def migrate_observation_statuses(db) -> dict:
    """
    Walk all threats/observations and update their status to the new model.
    Returns a stats dict with counts: {scanned, migrated, skipped, by_stage}.
    """
    stats = {"scanned": 0, "migrated": 0, "skipped": 0, "by_stage": {}}

    cursor = db.threats.find(
        {},
        {"_id": 0, "id": 1, "status": 1, "failure_mode": 1, "failure_mode_id": 1,
         "linked_equipment_id": 1, "risk_score": 1}
    )

    async for obs in cursor:
        stats["scanned"] += 1
        current = obs.get("status") or ""

        # Already on the new model — leave it alone (the workspace endpoint will
        # auto-sync it to the correct stage on next open).
        if current in NEW_STATUSES:
            stats["skipped"] += 1
            continue

        # Legacy mapping first; refine using observation data if mapping → Observation/Assessment
        base = LEGACY_MAP.get(current.lower().strip(), "Observation")

        try:
            derived = await _derive_stage(db, obs)
        except Exception as exc:
            logger.warning(f"derive_stage failed for {obs.get('id')}: {exc}")
            derived = base

        # If the legacy mapping is terminal (Learning/Mitigated) keep it; otherwise take the
        # furthest of (legacy, derived).
        stage_order = ["Observation", "Assessment", "Planning", "Investigation",
                       "Action", "Mitigated", "Learning"]
        if base in ("Learning", "Mitigated"):
            new_status = base
        else:
            try:
                new_status = derived if stage_order.index(derived) >= stage_order.index(base) else base
            except ValueError:
                new_status = derived

        await db.threats.update_one(
            {"id": obs.get("id")},
            {"$set": {"status": new_status}}
        )
        stats["migrated"] += 1
        stats["by_stage"][new_status] = stats["by_stage"].get(new_status, 0) + 1

    logger.info(
        f"Observation status migration: scanned={stats['scanned']} "
        f"migrated={stats['migrated']} skipped={stats['skipped']} "
        f"by_stage={stats['by_stage']}"
    )
    return stats
