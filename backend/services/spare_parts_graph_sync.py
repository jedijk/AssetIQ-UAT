"""Graph edge sync for SpareIQ spare parts."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from database import db
from services.reliability_graph import retire_edges_for_entity, upsert_edge
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)

COLLECTION = "reliability_edges"
EDGE_STATUS_ACTIVE = "active"
EDGE_STATUS_RETIRED = "retired"


async def sync_spare_part_equipment_links(
    *,
    spare_part_id: str,
    equipment_links: Iterable[dict],
    tenant_id: Optional[str] = None,
) -> int:
    """Upsert used_on edges from spare part to each linked equipment."""
    count = 0
    for link in equipment_links or []:
        equipment_id = link.get("equipment_id")
        if not equipment_id:
            continue
        try:
            await upsert_edge(
                source_type="spare_part",
                source_id=spare_part_id,
                relation="used_on",
                target_type="equipment",
                target_id=str(equipment_id),
                equipment_id=str(equipment_id),
                tenant_id=tenant_id,
                metadata={
                    "component_position": link.get("component_position"),
                },
            )
            count += 1
        except Exception as exc:
            logger.debug("spare part graph edge skipped: %s", exc)
    return count


async def retire_spare_part_graph(spare_part_id: str, user: Optional[dict] = None) -> int:
    tenant_id = tenant_id_from_user(user)
    return await retire_edges_for_entity(
        source_type="spare_part",
        source_id=spare_part_id,
        tenant_id=tenant_id,
    )


async def retire_requires_edges(
    *,
    source_type: str,
    source_id: str,
    tenant_id: Optional[str] = None,
) -> int:
    """Retire active requires edges from an action or program task to spare parts."""
    now = datetime.now(timezone.utc).isoformat()
    query: Dict[str, Any] = {
        "status": EDGE_STATUS_ACTIVE,
        "source_type": source_type,
        "source_id": source_id,
        "relation": "requires",
        "target_type": "spare_part",
    }
    if tenant_id:
        query["tenant_id"] = tenant_id
    result = await db[COLLECTION].update_many(
        query,
        {"$set": {"status": EDGE_STATUS_RETIRED, "retired_at": now, "updated_at": now}},
    )
    return result.modified_count


async def sync_entity_requires_spare_parts(
    *,
    source_type: str,
    source_id: str,
    requirements: Iterable[dict],
    equipment_id: str,
    tenant_id: Optional[str] = None,
) -> int:
    """Upsert REQUIRES edges from program_task/action to spare parts."""
    await retire_requires_edges(
        source_type=source_type,
        source_id=source_id,
        tenant_id=tenant_id,
    )
    count = 0
    for req in requirements or []:
        spare_part_id = req.get("spare_part_id")
        if not spare_part_id:
            continue
        try:
            await upsert_edge(
                source_type=source_type,
                source_id=source_id,
                relation="requires",
                target_type="spare_part",
                target_id=str(spare_part_id),
                equipment_id=str(equipment_id),
                tenant_id=tenant_id,
                metadata={"quantity": req.get("quantity", 1)},
            )
            count += 1
        except Exception as exc:
            logger.debug("requires edge skipped: %s", exc)
    return count
