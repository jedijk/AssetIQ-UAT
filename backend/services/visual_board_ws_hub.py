"""
WebSocket hub for Visual Management Board realtime updates.

Clients connect at /ws/vmb/{token} and receive board_updated, widget_updated,
and data_refreshed events. Falls back to REST polling when disconnected.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class VisualBoardWSHub:
    def __init__(self) -> None:
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, token_hash: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(token_hash, set()).add(websocket)

    async def disconnect(self, token_hash: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(token_hash)
            if not conns:
                return
            conns.discard(websocket)
            if not conns:
                self._connections.pop(token_hash, None)

    async def _broadcast(self, token_hash: str, event: str, payload: Dict[str, Any]) -> None:
        async with self._lock:
            conns = list(self._connections.get(token_hash, set()))
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
            await self.disconnect(token_hash, ws)

    async def notify_board_updated(self, token_hash: str, board_id: str, version: int) -> None:
        await self._broadcast(token_hash, "board_updated", {"board_id": board_id, "version": version})

    async def notify_widget_updated(self, token_hash: str, widget_id: str, data: Dict[str, Any]) -> None:
        await self._broadcast(token_hash, "widget_updated", {"widget_id": widget_id, "data": data})

    async def notify_data_refreshed(self, token_hash: str, data_payload: Dict[str, Any]) -> None:
        await self._broadcast(token_hash, "data_refreshed", data_payload)

    async def broadcast_board_tokens(self, token_hashes: list[str], event: str, payload: Dict[str, Any]) -> None:
        for th in token_hashes:
            await self._broadcast(th, event, payload)


vmb_ws_hub = VisualBoardWSHub()
