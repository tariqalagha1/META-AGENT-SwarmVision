"""Historical replay reconstruction for persisted graph events."""

from __future__ import annotations

from datetime import datetime
from math import cos, pi, sin
from typing import Any


DEFAULT_AGENT_LAYOUT = {
    "OCR": {"x": 100.0, "y": 150.0},
    "Parser": {"x": 250.0, "y": 150.0},
    "Linker": {"x": 400.0, "y": 150.0},
    "Memory": {"x": 250.0, "y": 300.0},
    "Orchestrator": {"x": 250.0, "y": 50.0},
}


def create_initial_topology() -> dict[str, Any]:
    agents = {}
    now = datetime.utcnow()
    for name, pos in DEFAULT_AGENT_LAYOUT.items():
        agents[name] = {
            "id": name,
            "name": name,
            "state": "idle",
            "x": pos["x"],
            "y": pos["y"],
            "tasks": [],
            "last_action": "initialized",
            "last_event_time": now,
        }

    return {"agents": agents, "edges": {}, "active_handoffs": []}


def _dynamic_position(index: int) -> tuple[float, float]:
    angle = (index * 360) / max(index + 1, 1)
    radius = 100
    return (
        320 + radius * cos((angle * pi) / 180),
        180 + radius * sin((angle * pi) / 180),
    )


def _ensure_agent(
    agents: dict[str, dict[str, Any]],
    agent_id: str,
    timestamp: datetime,
    state: str,
    action: str,
    task_id: str | None = None,
    name: str | None = None,
) -> None:
    if agent_id not in agents:
        x, y = _dynamic_position(len(agents))
        agents[agent_id] = {
            "id": agent_id,
            "name": name or agent_id,
            "state": state,
            "x": x,
            "y": y,
            "tasks": [task_id] if task_id else [],
            "last_action": action,
            "last_event_time": timestamp,
        }
        return

    agent = agents[agent_id]
    agent["state"] = state
    agent["last_action"] = action
    agent["last_event_time"] = timestamp
    if task_id and task_id not in agent["tasks"]:
        agent["tasks"].append(task_id)


def build_topology_snapshot(events: list[dict[str, Any]], timestamp: datetime) -> dict[str, Any]:
    state = create_initial_topology()

    for event in events:
        event_timestamp = _to_datetime(event["timestamp"])
        if event_timestamp > timestamp:
            break

        payload = event.get("payload", {}) or {}
        event_type = event.get("type")

        if event_type == "AGENT_SPAWN":
            agent_id = payload.get("agent_id")
            if agent_id:
                _ensure_agent(
                    state["agents"],
                    agent_id,
                    event_timestamp,
                    "active",
                    "spawned",
                    name=payload.get("agent_name") or agent_id,
                )
        elif event_type == "TASK_START":
            agent_id = payload.get("agent_id")
            if agent_id:
                _ensure_agent(
                    state["agents"],
                    agent_id,
                    event_timestamp,
                    "working",
                    f"task {(payload.get('task_id') or 'started')[:8]}",
                    task_id=payload.get("task_id"),
                )
        elif event_type == "TASK_HANDOFF":
            source_id = payload.get("source_agent_id")
            target_id = payload.get("target_agent_id")
            task_id = payload.get("task_id")
            if source_id:
                _ensure_agent(
                    state["agents"],
                    source_id,
                    event_timestamp,
                    "active",
                    f"handoff to {(target_id or 'target')[:8]}",
                    task_id=task_id,
                )
            if target_id:
                _ensure_agent(
                    state["agents"],
                    target_id,
                    event_timestamp,
                    "working",
                    f"received from {(source_id or 'source')[:8]}",
                    task_id=task_id,
                )
            if source_id and target_id:
                edge_key = f"{source_id}->{target_id}"
                edge = state["edges"].get(edge_key)
                if edge:
                    edge["count"] += 1
                    edge["last_active"] = event_timestamp
                else:
                    state["edges"][edge_key] = {
                        "source": source_id,
                        "target": target_id,
                        "last_active": event_timestamp,
                        "count": 1,
                    }
        elif event_type == "TASK_SUCCESS":
            agent_id = payload.get("agent_id")
            if agent_id:
                _ensure_agent(
                    state["agents"],
                    agent_id,
                    event_timestamp,
                    "success",
                    "task completed",
                    task_id=payload.get("task_id"),
                )
        elif event_type == "TASK_FAIL":
            agent_id = payload.get("agent_id")
            if agent_id:
                _ensure_agent(
                    state["agents"],
                    agent_id,
                    event_timestamp,
                    "failed",
                    "task failed",
                    task_id=payload.get("task_id"),
                )
        elif event_type == "AGENT_TERMINATION":
            agent_id = payload.get("agent_id")
            if agent_id:
                _ensure_agent(
                    state["agents"],
                    agent_id,
                    event_timestamp,
                    "terminated",
                    "terminated",
                )

    return state


def _to_datetime(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
