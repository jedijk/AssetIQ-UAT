"""External observation ingestion — validation, dedup, equipment match, lifecycle create."""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from database import db, observation_service
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)

PAYLOADS_COLLECTION = "external_observation_payloads"
EQUIPMENT_MATCH_REQUIRED_STATUS = "equipment_match_required"
EXTERNAL_API_USER_ID_PREFIX = "external-api:"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _payload_fingerprint(payload: Dict[str, Any]) -> str:
    normalized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


async def find_duplicate(
    tenant_id: str,
    source_system: str,
    external_reference: str,
) -> Optional[Dict[str, Any]]:
    doc = await db[PAYLOADS_COLLECTION].find_one(
        {
            "tenant_id": tenant_id,
            "source_system": source_system,
            "external_reference": external_reference,
        }
    )
    return doc


async def store_payload_record(
    *,
    tenant_id: str,
    source_system: str,
    external_reference: str,
    observation_id: str,
    key_id: str,
    original_payload: Dict[str, Any],
) -> None:
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "source_system": source_system,
        "external_reference": external_reference,
        "observation_id": observation_id,
        "key_id": key_id,
        "payload_fingerprint": _payload_fingerprint(original_payload),
        "original_payload": original_payload,
        "created_at": _now_iso(),
    }
    await db[PAYLOADS_COLLECTION].insert_one(doc)


async def get_observation_by_id(observation_id: str, user: dict) -> Optional[Dict[str, Any]]:
    return await db.observations.find_one(
        merge_tenant_filter({"id": observation_id}, user),
    )


async def match_equipment(
    payload: Dict[str, Any],
    *,
    user: dict,
    source_system: str,
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Equipment matching priority:
    1. AssetIQ equipment_id
    2. external_equipment_id mapping on equipment_nodes.external_mappings
    3. equipment_tag exact match
    4. equipment_name exact match
    5. equipment_name fuzzy match
    """
    tenant_filter = merge_tenant_filter({}, user)

    equipment_id = (payload.get("equipment_id") or "").strip()
    if equipment_id:
        equip = await db.equipment_nodes.find_one({**tenant_filter, "id": equipment_id})
        if equip:
            return equipment_id, {
                "equipment_id": equip.get("id"),
                "tag": equip.get("tag"),
                "name": equip.get("name"),
                "match_type": "assetiq_id",
                "confidence": 100,
            }

    external_equipment_id = (payload.get("external_equipment_id") or "").strip()
    if external_equipment_id and source_system:
        mapping_query = {
            **tenant_filter,
            f"external_mappings.{source_system}": external_equipment_id,
        }
        equip = await db.equipment_nodes.find_one(mapping_query)
        if equip:
            return equip.get("id"), {
                "equipment_id": equip.get("id"),
                "tag": equip.get("tag"),
                "name": equip.get("name"),
                "match_type": "external_mapping",
                "confidence": 95,
            }

    equipment_tag = (payload.get("equipment_tag") or "").strip()
    if equipment_tag:
        equip = await db.equipment_nodes.find_one(
            {**tenant_filter, "tag": {"$regex": f"^{equipment_tag}$", "$options": "i"}}
        )
        if equip:
            return equip.get("id"), {
                "equipment_id": equip.get("id"),
                "tag": equip.get("tag"),
                "name": equip.get("name"),
                "match_type": "tag_exact",
                "confidence": 90,
            }

    equipment_name = (payload.get("equipment_name") or "").strip()
    if equipment_name:
        equip = await db.equipment_nodes.find_one(
            {**tenant_filter, "name": {"$regex": f"^{equipment_name}$", "$options": "i"}}
        )
        if equip:
            return equip.get("id"), {
                "equipment_id": equip.get("id"),
                "tag": equip.get("tag"),
                "name": equip.get("name"),
                "match_type": "name_exact",
                "confidence": 85,
            }

        fuzzy = await db.equipment_nodes.find_one(
            {**tenant_filter, "name": {"$regex": equipment_name, "$options": "i"}}
        )
        if fuzzy:
            return fuzzy.get("id"), {
                "equipment_id": fuzzy.get("id"),
                "tag": fuzzy.get("tag"),
                "name": fuzzy.get("name"),
                "match_type": "name_fuzzy",
                "confidence": 60,
            }

    return None, None


async def create_external_observation(
    payload: Dict[str, Any],
    *,
    user: dict,
    key_id: str,
) -> Dict[str, Any]:
    source_system = (payload.get("source_system") or "").strip()
    external_reference = (payload.get("external_reference") or "").strip()
    idempotency_mode = payload.get("idempotency_mode") or "return_existing"
    tenant_id = user.get("company_id") or user.get("tenant_id")

    if not source_system or not external_reference:
        raise HTTPException(status_code=422, detail="source_system and external_reference are required")

    existing = await find_duplicate(tenant_id, source_system, external_reference)
    if existing:
        fingerprint = _payload_fingerprint(payload)
        if existing.get("payload_fingerprint") != fingerprint and idempotency_mode == "conflict":
            raise HTTPException(
                status_code=409,
                detail="Duplicate external_reference with conflicting payload",
            )
        observation = await get_observation_by_id(existing["observation_id"], user)
        return {
            "observation_id": existing["observation_id"],
            "status": (observation or {}).get("status", "open"),
            "equipment_match": (observation or {}).get("equipment_match"),
            "duplicate": True,
            "created_at": existing.get("created_at"),
        }

    equipment_id, equipment_match = await match_equipment(payload, user=user, source_system=source_system)
    status = "open"
    if not equipment_id:
        status = EQUIPMENT_MATCH_REQUIRED_STATUS

    observation_data: Dict[str, Any] = {
        "description": payload["description"],
        "severity": payload.get("severity") or "medium",
        "observation_type": payload.get("observation_type") or "general",
        "media_urls": payload.get("media_urls") or [],
        "measured_values": payload.get("measured_values") or [],
        "location": payload.get("location"),
        "tags": list(payload.get("tags") or []),
    }
    if equipment_id:
        observation_data["equipment_id"] = equipment_id
    if payload.get("equipment_tag"):
        observation_data["equipment_tag"] = payload["equipment_tag"]

    created_by = user.get("id") or f"{EXTERNAL_API_USER_ID_PREFIX}{key_id}"
    result = await observation_service.create_observation(
        observation_data,
        created_by=created_by,
        source="external_system",
        user=user,
    )
    observation = result if isinstance(result, dict) else {}
    observation_id = observation.get("id")

    extra_tags = [
        f"source:{source_system}",
        f"ext_ref:{external_reference}",
    ]
    update_fields: Dict[str, Any] = {
        "external_source_system": source_system,
        "external_reference": external_reference,
        "external_api_key_id": key_id,
        "equipment_match": equipment_match,
        "tags": list(set((observation.get("tags") or []) + extra_tags)),
    }
    if status == EQUIPMENT_MATCH_REQUIRED_STATUS:
        update_fields["status"] = EQUIPMENT_MATCH_REQUIRED_STATUS

    from services.work_signal_lifecycle import update_work_signal

    await update_work_signal(
        observation_id,
        user=user,
        set_fields=update_fields,
        graph_label="external_observation_ingest",
        sync_graph=False,
    )

    store_payload = {k: v for k, v in payload.items() if k != "idempotency_mode"}
    await store_payload_record(
        tenant_id=tenant_id,
        source_system=source_system,
        external_reference=external_reference,
        observation_id=observation_id,
        key_id=key_id,
        original_payload=store_payload,
    )

    return {
        "observation_id": observation_id,
        "status": update_fields.get("status", observation.get("status", "open")),
        "equipment_match": equipment_match,
        "duplicate": False,
        "created_at": observation.get("created_at") or _now_iso(),
    }
