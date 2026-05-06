"""
Agent Registry — allows external orchestration apps to self-register
agents with SwarmVision using an API key.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, Any
import os
import uuid
import time

router = APIRouter(prefix="/agents", tags=["agent-registry"])

# In-memory registry (extend to Redis/DB for production)
_registry: dict[str, dict] = {}
_connections: dict[str, dict] = {}  # session_token → app info

SWARMVISION_MASTER_KEY = os.getenv("SWARMVISION_MASTER_KEY", "sv-dev-key-change-in-prod")


class AgentRegistration(BaseModel):
    agent_id: str
    name: str
    type: str
    description: Optional[str] = None
    source_app: str
    capabilities: list[str] = []
    metadata: dict[str, Any] = {}


class AppConnection(BaseModel):
    app_name: str
    app_version: str = "1.0"
    description: Optional[str] = None


@router.post("/connect")
async def connect_app(
    body: AppConnection,
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """
    Register an external orchestration app and receive a session token.
    Use SWARMVISION_MASTER_KEY as X-API-Key for initial connection.
    """
    if x_api_key != SWARMVISION_MASTER_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_token = f"sv-{str(uuid.uuid4())}"
    _connections[session_token] = {
        "app_name":     body.app_name,
        "app_version":  body.app_version,
        "description":  body.description,
        "connected_at": time.time(),
        "agent_ids":    [],
    }
    return {
        "status":        "connected",
        "session_token": session_token,
        "message":       f"Connected as '{body.app_name}'. Use session_token as X-Session-Token for agent registration.",
    }


@router.post("/register")
async def register_agent(
    body: AgentRegistration,
    x_session_token: str = Header(..., alias="X-Session-Token"),
):
    """
    Register an agent from an external orchestration app.
    Use the session_token from /agents/connect as X-Session-Token.
    """
    if x_session_token not in _connections:
        raise HTTPException(status_code=401, detail="Invalid session token. Call /agents/connect first.")

    conn = _connections[x_session_token]
    _registry[body.agent_id] = {
        "agent_id":      body.agent_id,
        "name":          body.name,
        "type":          body.type,
        "description":   body.description,
        "source_app":    body.source_app,
        "capabilities":  body.capabilities,
        "metadata":      body.metadata,
        "registered_at": time.time(),
        "session_token": x_session_token,
    }
    conn["agent_ids"].append(body.agent_id)

    return {
        "status":   "registered",
        "agent_id": body.agent_id,
        "message":  f"Agent '{body.agent_id}' registered from '{body.source_app}'",
    }


@router.get("/registry")
async def get_registry():
    """Return all registered agents. Used by the frontend AgentEcosystemPanel."""
    return {
        "agents": list(_registry.values()),
        "connections": [
            {
                "app_name":    v["app_name"],
                "agent_count": len(v["agent_ids"]),
                "connected_at": v["connected_at"],
            }
            for v in _connections.values()
        ],
        "total": len(_registry),
    }


@router.delete("/registry/{agent_id}")
async def deregister_agent(
    agent_id: str,
    x_session_token: str = Header(..., alias="X-Session-Token"),
):
    if x_session_token not in _connections:
        raise HTTPException(status_code=401, detail="Invalid session token")
    if agent_id not in _registry:
        raise HTTPException(status_code=404, detail="Agent not found")
    del _registry[agent_id]
    return {"status": "deregistered", "agent_id": agent_id}
