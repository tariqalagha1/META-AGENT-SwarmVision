"""
WebSocket Manager

Handles WebSocket connections and broadcasts events to all connected clients.
"""

from fastapi import WebSocket
import logging
import json
from datetime import datetime

from app.observability import normalize_error

logger = logging.getLogger(__name__)


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

    async def connect(self, websocket: WebSocket, channel: str = "events"):
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

    async def broadcast(self, message: dict, channel: str = "events"):
        """Broadcast a message to all connected clients for a channel."""
        normalized_channel = channel if channel in self.active_connections else "events"
        targets = self.active_connections[normalized_channel]
        if not targets:
            logger.debug("No active %s connections to broadcast to", normalized_channel)
            return

        message_str = json.dumps(message)
        disconnected = []

        for connection in targets:
            try:
                await connection.send_text(message_str)
                # Track metadata
                conn_id = id(connection)
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
