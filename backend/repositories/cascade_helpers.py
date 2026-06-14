"""Shared cascade delete helpers for investigations and linked actions."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from database import db
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)


def session_kw(session) -> Dict[str, Any]:
    return {"session": session} if session is not None else {}


async def delete_investigations_for_threat(
    threat_id: str,
    *,
    user: Optional[dict],
    session,
    delete_actions: bool = False,
) -> Tuple[int, int]:
    """
    Delete investigations and sub-documents linked to a threat/observation id.
    Returns (deleted_investigations, deleted_actions).
    """
    skw = session_kw(session)
    deleted_actions = 0
    inv_filter = merge_tenant_filter({"threat_id": threat_id}, user)
    linked_investigations = await db.investigations.find(inv_filter, {"id": 1}).to_list(100)

    for inv in linked_investigations:
        inv_id = inv.get("id")
        inv_scope = {"investigation_id": inv_id}
        await db.timeline_events.delete_many(merge_tenant_filter(inv_scope, user), **skw)
        await db.failure_identifications.delete_many(merge_tenant_filter(inv_scope, user), **skw)
        await db.cause_nodes.delete_many(merge_tenant_filter(inv_scope, user), **skw)
        await db.action_items.delete_many(merge_tenant_filter(inv_scope, user), **skw)
        await db.evidence_items.delete_many(merge_tenant_filter(inv_scope, user), **skw)

        if delete_actions:
            result = await db.central_actions.delete_many(
                merge_tenant_filter(
                    {"source_type": "investigation", "source_id": inv_id},
                    user,
                ),
                **skw,
            )
            deleted_actions += result.deleted_count

    result = await db.investigations.delete_many(inv_filter, **skw)
    deleted_investigations = result.deleted_count
    if deleted_investigations:
        logger.info(
            "Deleted %s investigations linked to threat %s",
            deleted_investigations,
            threat_id,
        )
    return deleted_investigations, deleted_actions


async def delete_actions_for_threat(
    threat_id: str,
    *,
    user: Optional[dict],
    session,
) -> int:
    skw = session_kw(session)
    result = await db.central_actions.delete_many(
        merge_tenant_filter(
            {"source_type": "threat", "source_id": threat_id},
            user,
        ),
        **skw,
    )
    if result.deleted_count:
        logger.info(
            "Deleted %s central actions linked to threat %s",
            result.deleted_count,
            threat_id,
        )
    return result.deleted_count


async def delete_single_investigation_cascade(
    inv_id: str,
    *,
    user: Optional[dict],
    session,
    delete_central_actions: bool = False,
) -> int:
    """
    Delete one investigation and its sub-documents.
    Returns count of deleted central actions when delete_central_actions is True.
    """
    skw = session_kw(session)
    inv_scope = {"investigation_id": inv_id}
    await db.timeline_events.delete_many(merge_tenant_filter(inv_scope, user), **skw)
    await db.failure_identifications.delete_many(merge_tenant_filter(inv_scope, user), **skw)
    await db.cause_nodes.delete_many(merge_tenant_filter(inv_scope, user), **skw)
    await db.action_items.delete_many(merge_tenant_filter(inv_scope, user), **skw)
    await db.evidence_items.delete_many(merge_tenant_filter(inv_scope, user), **skw)

    deleted_actions = 0
    if delete_central_actions:
        result = await db.central_actions.delete_many(
            merge_tenant_filter(
                {"source_type": "investigation", "source_id": inv_id},
                user,
            ),
            **skw,
        )
        deleted_actions = result.deleted_count

    result = await db.investigations.delete_one(
        merge_tenant_filter({"id": inv_id}, user),
        **skw,
    )
    if result.deleted_count == 0:
        raise ValueError("forbidden")
    return deleted_actions
