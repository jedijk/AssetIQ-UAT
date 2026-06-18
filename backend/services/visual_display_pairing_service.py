"""Visual display device pairing lifecycle (Phase 4a)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

from database import db, get_database, get_current_db_name, set_request_db, AVAILABLE_DATABASES
from models.visual_display import (
    CompletePairingResponse,
    DisplayDeviceSummary,
    PairingPreviewResponse,
    PairingStatusResponse,
    RequestPairingResponse,
)
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.visual_board_helpers import BOARDS_COLLECTION
from services.visual_display_helpers import (
    DEVICES_COLLECTION,
    EVENTS_COLLECTION,
    PAIRINGS_COLLECTION,
    PAIRING_EXPIRY_SECONDS,
    new_id,
    now_iso,
)
from services.visual_display_token import generate_device_token, generate_pair_code

logger = logging.getLogger(__name__)


def _pairing_lookup_db_names() -> list[str]:
    """Databases to search for pairing codes (request default, then others)."""
    names: list[str] = []
    for candidate in (get_current_db_name(), *[m["name"] for m in AVAILABLE_DATABASES.values()]):
        if candidate and candidate not in names:
            names.append(candidate)
    return names


def _normalize_pair_code(code: str) -> str:
    return (code or "").strip().upper()


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _expires_in_seconds(expires_at: Optional[str]) -> int:
    exp = _parse_iso(expires_at)
    if not exp:
        return 0
    return max(0, int((exp - datetime.now(timezone.utc)).total_seconds()))


async def _expire_stale_pairing(doc: dict) -> None:
    if doc.get("status") != "pending":
        return
    if _expires_in_seconds(doc.get("expires_at")) > 0:
        return
    await db[PAIRINGS_COLLECTION].update_one(
        {"id": doc["id"]},
        {"$set": {"status": "expired", "updated_at": now_iso()}},
    )
    doc["status"] = "expired"


async def _record_event(
    *,
    device_id: Optional[str],
    event: str,
    tenant_id: Optional[str] = None,
    pairing_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    doc: Dict[str, Any] = {
        "id": new_id("vde"),
        "device_id": device_id,
        "pairing_id": pairing_id,
        "event": event,
        "metadata": metadata or {},
        "timestamp": now_iso(),
    }
    if tenant_id:
        doc["tenant_id"] = tenant_id
    try:
        await db[EVENTS_COLLECTION].insert_one(doc)
    except Exception:
        logger.debug("Display event insert failed", exc_info=True)


async def _generate_unique_pair_code() -> str:
    for _ in range(12):
        code = generate_pair_code()
        existing = await db[PAIRINGS_COLLECTION].find_one(
            {"pair_code": code, "status": "pending"},
            {"_id": 0, "id": 1},
        )
        if not existing:
            return code
    raise HTTPException(status_code=503, detail="Unable to generate pairing code")


async def request_pairing(
    *,
    device_fingerprint: str,
    user_agent: Optional[str] = None,
    screen_width: Optional[int] = None,
    screen_height: Optional[int] = None,
    device_label: Optional[str] = None,
) -> RequestPairingResponse:
    fingerprint = (device_fingerprint or "").strip()
    if not fingerprint:
        raise HTTPException(status_code=400, detail="device_fingerprint is required")

    existing = await db[PAIRINGS_COLLECTION].find_one(
        {"device_fingerprint": fingerprint, "status": "pending"},
        {"_id": 0},
    )
    if existing:
        await _expire_stale_pairing(existing)
        if existing.get("status") == "pending" and _expires_in_seconds(existing.get("expires_at")) > 0:
            return RequestPairingResponse(
                pair_code=existing["pair_code"],
                pairing_id=existing["id"],
                expires_in=_expires_in_seconds(existing.get("expires_at")),
            )

    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(seconds=PAIRING_EXPIRY_SECONDS)).isoformat()
    pair_code = await _generate_unique_pair_code()
    pairing_id = new_id("pair")

    doc = {
        "id": pairing_id,
        "pair_code": pair_code,
        "device_fingerprint": fingerprint,
        "user_agent": user_agent,
        "screen_width": screen_width,
        "screen_height": screen_height,
        "device_label": device_label,
        "status": "pending",
        "expires_at": expires_at,
        "device_id": None,
        "token_delivered": False,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db[PAIRINGS_COLLECTION].insert_one(doc)
    await _record_event(device_id=None, event="pairing_requested", pairing_id=pairing_id)

    return RequestPairingResponse(
        pair_code=pair_code,
        pairing_id=pairing_id,
        expires_in=PAIRING_EXPIRY_SECONDS,
    )


async def _get_pairing_by_code(pair_code: str) -> dict:
    code = _normalize_pair_code(pair_code)
    doc = None
    for db_name in _pairing_lookup_db_names():
        coll = get_database(db_name)[PAIRINGS_COLLECTION]
        doc = await coll.find_one({"pair_code": code}, {"_id": 0})
        if doc:
            set_request_db(db_name)
            break
    if not doc:
        raise HTTPException(status_code=404, detail="Pairing code not found")
    await _expire_stale_pairing(doc)
    return doc


async def get_pairing_preview(pair_code: str) -> PairingPreviewResponse:
    doc = await _get_pairing_by_code(pair_code)
    if doc.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Pairing code is {doc.get('status')}")
    if _expires_in_seconds(doc.get("expires_at")) <= 0:
        raise HTTPException(status_code=400, detail="Pairing code expired")

    width = doc.get("screen_width")
    height = doc.get("screen_height")
    resolution = f"{width}x{height}" if width and height else None

    return PairingPreviewResponse(
        pair_code=doc["pair_code"],
        pairing_id=doc["id"],
        status=doc["status"],
        expires_at=doc.get("expires_at"),
        device_label=doc.get("device_label"),
        user_agent=doc.get("user_agent"),
        screen_width=width,
        screen_height=height,
        resolution=resolution,
    )


async def complete_pairing(
    *,
    pair_code: str,
    board_id: str,
    screen_name: str,
    location: Optional[str],
    area: Optional[str],
    user: dict,
) -> CompletePairingResponse:
    doc = await _get_pairing_by_code(pair_code)
    if doc.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Pairing code is {doc.get('status')}")
    if _expires_in_seconds(doc.get("expires_at")) <= 0:
        raise HTTPException(status_code=400, detail="Pairing code expired")

    board = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1, "name": 1, "status": 1},
    )
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    raw_token, token_hash = generate_device_token()
    now = now_iso()
    device_id = new_id("device")

    device_doc = with_tenant_id(
        {
            "id": device_id,
            "screen_name": screen_name.strip(),
            "board_id": board_id,
            "location": location or "",
            "area": area or "",
            "status": "active",
            "token_hash": token_hash,
            "user_agent": doc.get("user_agent"),
            "screen_width": doc.get("screen_width"),
            "screen_height": doc.get("screen_height"),
            "device_label": doc.get("device_label"),
            "device_fingerprint": doc.get("device_fingerprint"),
            "pairing_id": doc["id"],
            "last_seen": None,
            "created_at": now,
            "paired_at": now,
        },
        user,
    )
    await db[DEVICES_COLLECTION].insert_one(device_doc)

    await db[PAIRINGS_COLLECTION].update_one(
        {"id": doc["id"]},
        {
            "$set": {
                "status": "completed",
                "device_id": device_id,
                "board_id": board_id,
                "screen_name": screen_name.strip(),
                "tenant_id": device_doc.get("tenant_id"),
                "pending_delivery_token": raw_token,
                "token_delivered": False,
                "updated_at": now,
            }
        },
    )

    tenant_id = device_doc.get("tenant_id")
    await _record_event(
        device_id=device_id,
        event="paired",
        tenant_id=tenant_id,
        pairing_id=doc["id"],
        metadata={"board_id": board_id, "screen_name": screen_name},
    )

    return CompletePairingResponse(
        device_id=device_id,
        device_token=raw_token,
        board_id=board_id,
        screen_name=screen_name.strip(),
    )


async def poll_pairing_status(
    pair_code: str,
    *,
    device_fingerprint: str,
) -> PairingStatusResponse:
    doc = await _get_pairing_by_code(pair_code)
    fingerprint = (device_fingerprint or "").strip()
    if doc.get("device_fingerprint") != fingerprint:
        raise HTTPException(status_code=403, detail="Invalid device session")

    status = doc.get("status", "pending")
    if status == "pending":
        remaining = _expires_in_seconds(doc.get("expires_at"))
        if remaining <= 0:
            return PairingStatusResponse(status="expired", expires_in=0)
        return PairingStatusResponse(status="pending", expires_in=remaining)

    if status == "expired":
        return PairingStatusResponse(status="expired", expires_in=0)

    if status == "completed":
        device_id = doc.get("device_id")
        if not device_id:
            return PairingStatusResponse(status="pending")

        device = await db[DEVICES_COLLECTION].find_one({"id": device_id}, {"_id": 0, "token_hash": 0})
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")

        if doc.get("token_delivered"):
            return PairingStatusResponse(
                status="paired",
                device_id=device_id,
                board_id=device.get("board_id"),
                screen_name=device.get("screen_name"),
            )

        pending_token = doc.get("pending_delivery_token")
        if not pending_token:
            return PairingStatusResponse(
                status="paired",
                device_id=device_id,
                board_id=device.get("board_id"),
                screen_name=device.get("screen_name"),
            )

        await db[PAIRINGS_COLLECTION].update_one(
            {"id": doc["id"]},
            {
                "$set": {"token_delivered": True, "updated_at": now_iso()},
                "$unset": {"pending_delivery_token": ""},
            },
        )
        await _record_event(
            device_id=device_id,
            event="token_delivered",
            tenant_id=device.get("tenant_id"),
            pairing_id=doc["id"],
        )

        return PairingStatusResponse(
            status="paired",
            device_id=device_id,
            device_token=pending_token,
            board_id=device.get("board_id"),
            screen_name=device.get("screen_name"),
        )

    return PairingStatusResponse(status=status)


async def list_display_devices(user: dict) -> Dict[str, Any]:
    devices = await db[DEVICES_COLLECTION].find(
        merge_tenant_filter({}, user),
        {"_id": 0, "token_hash": 0},
    ).sort("created_at", -1).to_list(500)

    board_ids = list({d.get("board_id") for d in devices if d.get("board_id")})
    board_names: Dict[str, str] = {}
    if board_ids:
        boards = await db[BOARDS_COLLECTION].find(
            merge_tenant_filter({"id": {"$in": board_ids}}, user),
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(len(board_ids))
        board_names = {b["id"]: b.get("name", "") for b in boards}

    items = [
        DisplayDeviceSummary(
            id=d["id"],
            screen_name=d.get("screen_name", ""),
            board_id=d.get("board_id"),
            board_name=board_names.get(d.get("board_id", "")),
            location=d.get("location") or None,
            area=d.get("area") or None,
            status=d.get("status", "active"),
            last_seen=d.get("last_seen"),
            user_agent=d.get("user_agent"),
            screen_width=d.get("screen_width"),
            screen_height=d.get("screen_height"),
            created_at=d.get("created_at"),
            paired_at=d.get("paired_at"),
        ).model_dump()
        for d in devices
    ]
    return {"items": items, "total": len(items)}
