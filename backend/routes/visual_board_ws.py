"""
Visual Management Board WebSocket — realtime display updates.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services import visual_board_data_service as data_svc
from services.visual_board_service import resolve_token
from services.visual_board_token import hash_token, validate_token_format
from services.visual_board_ws_hub import vmb_ws_hub

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/vmb/{token}")
async def vmb_websocket(websocket: WebSocket, token: str):
    if not validate_token_format(token):
        await websocket.close(code=4400)
        return

    token_hash = hash_token(token)
    refresh_task = None
    try:
        await vmb_ws_hub.connect(token_hash, websocket)
        await websocket.send_json({"event": "connected", "payload": {"ok": True}})
        refresh_task = asyncio.create_task(_periodic_data_refresh(token, token_hash))

        while True:
            msg = await websocket.receive_text()
            if msg.strip().lower() == "ping":
                await websocket.send_json({"event": "pong", "payload": {}})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("VMB websocket closed: %s", exc)
    finally:
        if refresh_task:
            refresh_task.cancel()
        await vmb_ws_hub.disconnect(token_hash, websocket)


async def _periodic_data_refresh(raw_token: str, token_hash: str) -> None:
    try:
        ctx = await resolve_token(raw_token)
        board = ctx["board"]
        interval = int(board.get("refresh_interval_seconds") or 30)
        while True:
            await asyncio.sleep(max(interval, 10))
            try:
                data = await data_svc.get_public_data(raw_token)
                await vmb_ws_hub.notify_data_refreshed(token_hash, data.model_dump())
            except Exception:
                logger.debug("Periodic VMB data refresh failed", exc_info=True)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.debug("VMB refresh loop ended", exc_info=True)
