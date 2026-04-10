"""
WebSocket Manager

Handles WebSocket connections and broadcasts events to all connected clients.
"""

from fastapi import WebSocket
import logging
import json
from datetime import datetime

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections and event broadcasting"""

    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.connection_metadata = {}  # Track connection info
        self.total_events_broadcast = 0

    async def connect(self, websocket: WebSocket):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.append(websocket)
        
        # Store metadata
        conn_id = id(websocket)
        self.connection_metadata[conn_id] = {
            "connected_at": datetime.utcnow().isoformat(),
            "events_received": 0
        }
        
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")
        
        # Send welcome message
        welcome = {
            "type": "CONNECTION_ESTABLISHED",
            "timestamp": datetime.utcnow().isoformat(),
            "message": "Connected to SwarmVision Graph event stream"
        }
        try:
            await websocket.send_text(json.dumps(welcome))
        except Exception as e:
            logger.error(f"Failed to send welcome message: {e}")

    async def disconnect(self, websocket: WebSocket):
        """Remove a disconnected client"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            conn_id = id(websocket)
            if conn_id in self.connection_metadata:
                del self.connection_metadata[conn_id]
            logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients"""
        if not self.active_connections:
            logger.debug("No active connections to broadcast to")
            return

        message_str = json.dumps(message)
        disconnected = []

        for connection in self.active_connections:
            try:
                await connection.send_text(message_str)
                # Track metadata
                conn_id = id(connection)
                if conn_id in self.connection_metadata:
                    self.connection_metadata[conn_id]["events_received"] += 1
            except Exception as e:
                logger.debug(f"Failed to send message (client may have disconnected): {e}")
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
        except Exception as e:
            logger.error(f"Failed to send personal message: {e}")
            await self.disconnect(websocket)

    def get_client_count(self) -> int:
        """Get the number of active connections"""
        return len(self.active_connections)

    def get_stats(self) -> dict:
        """Get WebSocket manager statistics"""
        return {
            "active_connections": len(self.active_connections),
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
