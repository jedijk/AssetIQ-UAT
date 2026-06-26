"""Chat conversation state and message persistence — extracted from chat_routes_service.py (WS4)."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from database import db, failure_modes_service
from failure_modes import FAILURE_MODES_LIBRARY
from chat_handler_v2 import ChatState
from services.tenant_schema import with_tenant_id
from services.tenant_scope import scoped

logger = logging.getLogger(__name__)


async def get_failure_modes_from_db():
    try:
        result = await failure_modes_service.get_all(limit=2000)
        fm = result.get("failure_modes", [])
        if fm:
            logger.info("Chat using %s/%s failure modes from database", len(fm), result.get("total", 0))
            return fm
    except Exception as e:
        logger.error("Failed to fetch failure modes from DB: %s", e)
    logger.info("Using static FAILURE_MODES_LIBRARY (%s entries)", len(FAILURE_MODES_LIBRARY))
    return FAILURE_MODES_LIBRARY


async def tenant_ctx_for_user(user_id: str) -> Optional[dict]:
    return await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "company_id": 1, "organization_id": 1},
    )


async def read_conv(user_id: str) -> dict:
    """Read conversation state. Returns empty-ish dict if none exists."""
    tenant_user = await tenant_ctx_for_user(user_id)
    conv_q = scoped(tenant_user, {"user_id": user_id}) if tenant_user else {"user_id": user_id}
    doc = await db.chat_conversations.find_one(conv_q, {"_id": 0})
    if doc:
        return doc

    msg_q = scoped(tenant_user, {
        "user_id": user_id,
        "role": "assistant",
        "chat_state": {"$exists": True, "$ne": None},
    }) if tenant_user else {
        "user_id": user_id,
        "role": "assistant",
        "chat_state": {"$exists": True, "$ne": None},
    }
    msgs = await db.chat_messages.find(
        msg_q,
        {"_id": 0, "chat_state": 1, "equipment_suggestions": 1,
         "failure_mode_suggestions": 1, "pending_data": 1,
         "original_message": 1, "awaiting_context_for_threat": 1},
    ).sort("created_at", -1).limit(1).to_list(1)

    if msgs:
        m = msgs[0]
        state = m.get("chat_state")
        if state and state != ChatState.INITIAL:
            logger.info("Migrating state '%s' from chat_messages to chat_conversations", state)
            migrated = {
                "user_id": user_id,
                "state": state,
                "pending_data": m.get("pending_data", {}),
                "equipment_suggestions": m.get("equipment_suggestions"),
                "failure_mode_suggestions": m.get("failure_mode_suggestions"),
                "original_message": m.get("original_message"),
                "awaiting_context_for_threat": m.get("awaiting_context_for_threat"),
            }
            await db.chat_conversations.update_one(
                {"user_id": user_id}, {"$set": migrated}, upsert=True
            )
            return migrated

    return {"user_id": user_id, "state": ChatState.INITIAL}


async def write_conv(user_id: str, **fields):
    """Atomically update conversation state."""
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.chat_conversations.update_one(
        {"user_id": user_id}, {"$set": fields}, upsert=True
    )


async def reset_conv(user_id: str):
    await write_conv(
        user_id,
        state=ChatState.INITIAL,
        pending_data={},
        equipment_suggestions=None,
        failure_mode_suggestions=None,
        original_message=None,
        awaiting_context_for_threat=None,
        issue_description=None,
        issue_summary=None,
    )


async def store_assistant_msg(user_id: str, content: str, **extra) -> dict:
    msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "assistant",
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    with_tenant_id(msg, await tenant_ctx_for_user(user_id))
    await db.chat_messages.insert_one(msg)
    return msg
