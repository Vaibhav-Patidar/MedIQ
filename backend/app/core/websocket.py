import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger("mediq.ws")


class ConnectionManager:
    """In-process WebSocket connection manager (docs/05-api-spec.md Section 10).

    Channels: "alerts" for /ws/alerts, "vitals:{patient_id}" for per-patient
    vitals. Single process only — no Redis pub/sub needed at hackathon scale.
    Publishes are safe from any thread: they are scheduled onto the captured
    main event loop (set at app startup), which makes them work identically
    under uvicorn and inside sync FastAPI background tasks."""

    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._main_loop: asyncio.AbstractEventLoop | None = None

    def set_main_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._main_loop = loop

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._channels[channel].add(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._channels[channel].discard(websocket)
            if not self._channels[channel]:
                self._channels.pop(channel, None)

    async def _broadcast(self, channel: str, payload: dict) -> None:
        async with self._lock:
            sockets = list(self._channels.get(channel, ()))
        dead = []
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(channel, ws)

    def publish(self, channel: str, payload: dict) -> None:
        """Fire-and-forget broadcast, callable from request handlers or worker
        threads. Never raises into the clinical flow."""
        try:
            loop = self._main_loop
            if loop is not None and loop.is_running():
                asyncio.run_coroutine_threadsafe(self._broadcast(channel, payload), loop)
            else:
                asyncio.run(self._broadcast(channel, payload))
        except Exception as exc:
            logger.warning("websocket publish failed on %s: %s", channel, exc)


manager = ConnectionManager()
