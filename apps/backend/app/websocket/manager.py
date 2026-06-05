"""
WebSocket Manager

Handles WebSocket connections and broadcasts events to all connected clients.
"""

from fastapi import WebSocket
import logging
import json
from datetime import datetime
from uuid import uuid4

from app.core.security import AuthContext, ROLE_SUPER_ADMIN, auth_disabled
from app.observability import normalize_error

logger = logging.getLogger(__name__)


def _with_provenance(message: dict) -> dict:
    """Additive compatibility wrapper for Sprint 1 provenance payloads."""
    if not isinstance(message, dict):
        return message
    if message.get("provenance"):
        return message

    event_id = str(message.get("event_id") or message.get("id") or uuid4())
    trace_id = str(message.get("trace_id") or "unscoped-trace")
    timestamp = str(message.get("timestamp") or datetime.utcnow().isoformat())
    sequence_no_raw = message.get("step_index")
    sequence_no = int(sequence_no_raw) + 1 if isinstance(sequence_no_raw, int) else 1
    source = str(message.get("source") or "unknown").lower()
    source_type = "runtime"
    trust_level = "verified"
    if source in {"system", "meta-agent"}:
        source_type = "derived"
        trust_level = "derived"
    elif source in {"viz-mock", "mock", "demo"}:
        source_type = "mock"
        trust_level = "mock"

    return {
        **message,
        "event_id": event_id,
        "id": message.get("id") or event_id,
        "trace_id": trace_id,
        "timestamp": timestamp,
        "provenance": {
            "event_id": event_id,
            "trace_id": trace_id,
            "sequence_no": sequence_no,
            "source_type": source_type,
            "source_component": str(
                message.get("source_component") or "websocket.broadcast"
            ),
            "trust_level": trust_level,
            "persistence_status": str(
                message.get("persistence_status") or "live_unpersisted"
            ),
            "timestamp": timestamp,
        },
    }


class WebSocketManager:
    """Manages WebSocket connections and event broadcasting"""

    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {
            "events": [],
            "metrics": [],
            "alerts": [],
            "agents": [],
        }
        self.connection_metadata = {}  # Track connection info
        self.total_events_broadcast = 0

    async def connect(
        self,
        websocket: WebSocket,
        channel: str = "events",
        auth: AuthContext | None = None,
    ):
        """Accept a new WebSocket connection"""
        normalized_channel = channel if channel in self.active_connections else "events"
        await websocket.accept()
        self.active_connections[normalized_channel].append(websocket)
        
        # Store metadata
        conn_id = id(websocket)
        self.connection_metadata[conn_id] = {
            "connected_at": datetime.utcnow().isoformat(),
            "events_received": 0,
            "channel": normalized_channel,
            "tenant_id": getattr(auth, "tenant_id", None),
            "role": getattr(auth, "role", None),
        }
        
        logger.info(
            "Client connected. channel=%s total_connections=%s",
            normalized_channel,
            self.get_client_count(),
        )
        
        # Send welcome message
        welcome = {
            "type": "CONNECTION_ESTABLISHED",
            "timestamp": datetime.utcnow().isoformat(),
            "message": "Connected to SwarmVision Graph event stream",
            "channel": normalized_channel,
        }
        try:
            await websocket.send_text(json.dumps(welcome))
        except Exception as exc:
            logger.error("welcome_message_error=%s", normalize_error(exc))

    async def disconnect(self, websocket: WebSocket):
        """Remove a disconnected client"""
        for _channel, connections in self.active_connections.items():
            if websocket in connections:
                connections.remove(websocket)
                break
        conn_id = id(websocket)
        if conn_id in self.connection_metadata:
            del self.connection_metadata[conn_id]
        logger.info("Client disconnected. Total connections: %s", self.get_client_count())

    async def broadcast(
        self,
        message: dict,
        channel: str = "events",
        tenant_id: str | None = None,
    ):
        """Broadcast a message to all connected clients for a channel."""
        normalized_channel = channel if channel in self.active_connections else "events"
        targets = self.active_connections[normalized_channel]
        if not targets:
            logger.debug("No active %s connections to broadcast to", normalized_channel)
            return

        message_payload = _with_provenance(message)
        message_tenant_id = tenant_id
        if message_tenant_id is None and isinstance(message_payload, dict):
            context = message_payload.get("context")
            if isinstance(context, dict) and context.get("tenant_id"):
                message_tenant_id = str(context.get("tenant_id"))
            elif message_payload.get("tenant_id"):
                message_tenant_id = str(message_payload.get("tenant_id"))

        if auth_disabled():
            message_str = json.dumps(message_payload)
        else:
            message_str = json.dumps(message_payload)

        disconnected = []

        for connection in targets:
            conn_id = id(connection)
            metadata = self.connection_metadata.get(conn_id, {})
            if not auth_disabled():
                if metadata.get("role") != ROLE_SUPER_ADMIN:
                    if not message_tenant_id:
                        continue
                    if metadata.get("tenant_id") != message_tenant_id:
                        continue
            try:
                await connection.send_text(message_str)
                # Track metadata
                if conn_id in self.connection_metadata:
                    self.connection_metadata[conn_id]["events_received"] += 1
            except Exception as exc:
                logger.debug(
                    "broadcast_delivery_error=%s",
                    normalize_error(exc),
                )
                disconnected.append(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            await self.disconnect(connection)

        self.total_events_broadcast += 1

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific client"""
        try:
            await websocket.send_text(json.dumps(message))
            conn_id = id(websocket)
            if conn_id in self.connection_metadata:
                self.connection_metadata[conn_id]["events_received"] += 1
        except Exception as exc:
            logger.error("personal_message_error=%s", normalize_error(exc))
            await self.disconnect(websocket)

    def get_client_count(self) -> int:
        """Get the number of active connections"""
        return sum(len(connections) for connections in self.active_connections.values())

    def get_stats(self) -> dict:
        """Get WebSocket manager statistics"""
        return {
            "active_connections": self.get_client_count(),
            "channels": {
                channel: len(connections)
                for channel, connections in self.active_connections.items()
            },
            "total_events_broadcast": self.total_events_broadcast,
            "connections": [
                {
                    "id": i,
                    "connected_at": meta["connected_at"],
                    "events_received": meta["events_received"]
                }
                for i, meta in enumerate(self.connection_metadata.values())
            ]
        }
