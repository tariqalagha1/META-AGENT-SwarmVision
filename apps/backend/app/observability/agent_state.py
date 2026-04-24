"""Agent state modeling with Redis cache and in-memory fallback."""

from __future__ import annotations

from datetime import datetime
import json
from typing import Any

from app.observability.aggregation_service import AggregationService

try:
    import redis.asyncio as redis_asyncio
except ModuleNotFoundError:  # pragma: no cover
    redis_asyncio = None


class AgentStateStore:
    def __init__(self, redis_url: str, redis_enabled: bool = False):
        self.redis_enabled = redis_enabled and redis_asyncio is not None
        self.redis_url = redis_url
        self.redis = None
        self.memory_state: dict[str, dict[str, Any]] = {}

    async def connect(self) -> None:
        if not self.redis_enabled:
            return
        self.redis = redis_asyncio.from_url(self.redis_url, decode_responses=True)

    async def close(self) -> None:
        if self.redis is not None:
            await self.redis.close()

    async def update_from_metrics(
        self, agent_metric: dict[str, Any], event: dict[str, Any]
    ) -> dict[str, Any]:
        if not agent_metric:
            return {}

        failure_rate = float(agent_metric.get("failure_rate") or 0)
        latency_avg = float(agent_metric.get("latency_avg") or 0)
        event_type = str(event.get("event_type") or event.get("type") or "")

        state = "ACTIVE"
        if failure_rate >= 0.3 or event_type == "TASK_FAIL":
            state = "FAILED"
        elif failure_rate >= 0.1 or latency_avg >= 300000:
            state = "DEGRADED"

        snapshot = {
            "agent_id": agent_metric["agent_id"],
            "state": state,
            "last_seen": agent_metric.get("last_seen") or datetime.utcnow().isoformat(),
            "latency_avg": latency_avg,
            "error_rate": failure_rate,
            "throughput": int(agent_metric.get("throughput") or 0),
        }

        self.memory_state[snapshot["agent_id"]] = snapshot
        if self.redis is not None:
            key = f"agent_state:{snapshot['agent_id']}"
            await self.redis.set(key, json.dumps(snapshot))
        return snapshot

    def get_agent_state(self, agent_id: str) -> dict[str, Any] | None:
        return self.memory_state.get(agent_id)

    def list_states(self) -> list[dict[str, Any]]:
        return [self.memory_state[key] for key in sorted(self.memory_state)]


def build_agent_panel_payload(aggregation_service: AggregationService, states: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "agents": states,
        "metrics": aggregation_service.snapshot_metrics().get("agents", []),
    }
