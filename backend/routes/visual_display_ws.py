"""
Visual Display device WebSocket — realtime kiosk updates.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from services import visual_display_device_service as device_svc
from services.visual_display_token import validate_device_token_format
from services.visual_display_ws_hub import display_ws_hub

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/display")
async def display_websocket(websocket: WebSocket, token: str = Query(...)):
    if not validate_device_token_format(token):
        await websocket.close(code=4400)
        return

    refresh_task = None
    device_id = None
    try:
        ctx = await device_svc.resolve_device_token(token)
        device = ctx["device"]
        board = ctx["board"]
        device_id = device["id"]
        await display_ws_hub.connect(device_id, websocket)
        await websocket.send_json({"event": "connected", "payload": {"device_id": device_id, "ok": True}})

        interval = int(board.get("refresh_interval_seconds") or 30)
        refresh_task = asyncio.create_task(_periodic_data_refresh(token, device_id, interval))

        while True:
            msg = await websocket.receive_text()
            if msg.strip().lower() == "ping":
                await websocket.send_json({"event": "pong", "payload": {}})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("Display websocket closed: %s", exc)
    finally:
        if refresh_task:
            refresh_task.cancel()
        if device_id:
            await display_ws_hub.disconnect(device_id, websocket)


async def _periodic_data_refresh(raw_token: str, device_id: str, interval: int) -> None:
    try:
        while True:
            await asyncio.sleep(max(interval, 10))
            try:
                data = await device_svc.get_device_data(raw_token)
                await display_ws_hub.notify(device_id, "data_refreshed", data)
            except Exception:
                logger.debug("Periodic display data refresh failed", exc_info=True)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.debug("Display refresh loop ended", exc_info=True)
