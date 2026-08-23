"""WebSocket endpoints (docs/05-api-spec.md Section 10).

Auth per ADR-004 / docs/08-security-spec.md Section 1: token passed as a query
param (?token=...) or via the Sec-WebSocket-Protocol header at handshake;
connection rejected (4401) if invalid or expired."""
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.api.deps import resolve_ws_token
from app.core.websocket import manager

logger = logging.getLogger("mediq.ws")

router = APIRouter()


def _extract_token(websocket: WebSocket, token: str | None) -> str | None:
    if token:
        return token
    # subprotocol trick: client sends ["bearer", "<jwt>"]
    protocols = websocket.headers.get("sec-websocket-protocol", "")
    parts = [p.strip() for p in protocols.split(",") if p.strip()]
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


@router.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket, token: str | None = Query(default=None)):
    handshake_token = _extract_token(websocket, token)
    if not resolve_ws_token(handshake_token):
        await websocket.close(code=4401)
        return
    await manager.connect("alerts", websocket)
    try:
        while True:
            await websocket.receive_text()  # keepalive; server pushes are one-way
    except WebSocketDisconnect:
        await manager.disconnect("alerts", websocket)


@router.websocket("/ws/patients/{patient_id}/vitals")
async def ws_patient_vitals(websocket: WebSocket, patient_id: str,
                            token: str | None = Query(default=None)):
    handshake_token = _extract_token(websocket, token)
    if not resolve_ws_token(handshake_token):
        await websocket.close(code=4401)
        return
    channel = f"vitals:{patient_id}"
    await manager.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(channel, websocket)
