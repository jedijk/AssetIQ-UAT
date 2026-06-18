"""
WebSocket hub for Visual Display device realtime updates.

Clients connect at /ws/display?token=dvc_... and receive board_updated,
board_reassigned, data_refreshed, and lifecycle events keyed by device_id.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class VisualDisplayWSHub:
    def __init__(self) -> None:
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, device_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(device_id, set()).add(websocket)

    async def disconnect(self, device_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(device_id)
            if not conns:
                return
            conns.discard(websocket)
            if not conns:
                self._connections.pop(device_id, None)

    async def notify(self, device_id: str, event: str, payload: Dict[str, Any]) -> None:
        async with self._lock:
            conns = list(self._connections.get(device_id, set()))
        if not conns:
            return
        message = json.dumps({"event": event, "payload": payload})
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(device_id, ws)


display_ws_hub = VisualDisplayWSHub()
