"""Real-time aggregation engine for agent and trace metrics."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from statistics import mean
from typing import Any


def _to_datetime(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)


@dataclass
class AgentRollup:
    latencies: deque[float]
    failures: int = 0
    successes: int = 0
    seen: int = 0
    baseline_latency: float = 0
    last_seen: datetime | None = None


class AggregationService:
    """Maintains rolling metrics without changing execution behavior."""

    def __init__(self, max_latency_points: int = 120):
        self.max_latency_points = max_latency_points
        self.agent_rollups: dict[str, AgentRollup] = {}
        self.trace_ranges: dict[str, dict[str, datetime]] = {}
        self.retry_counts: dict[str, int] = defaultdict(int)

    def _get_rollup(self, agent_id: str) -> AgentRollup:
        rollup = self.agent_rollups.get(agent_id)
        if rollup is None:
            rollup = AgentRollup(latencies=deque(maxlen=self.max_latency_points))
            self.agent_rollups[agent_id] = rollup
        return rollup

    def ingest_event(self, event: dict[str, Any]) -> None:
        trace_id = event.get("trace_id")
        timestamp = _to_datetime(event["timestamp"])
        event_type = str(event.get("event_type") or event.get("type") or "")
        agent_id = event.get("agent_id")
        latency = float(event.get("latency_ms") or 0)

        if trace_id:
            entry = self.trace_ranges.setdefault(trace_id, {"start": timestamp, "end": timestamp})
            if timestamp < entry["start"]:
                entry["start"] = timestamp
            if timestamp > entry["end"]:
                entry["end"] = timestamp

        if event_type == "DECISION":
            decision_name = str((event.get("payload") or {}).get("decision_point") or "")
            if "retry" in decision_name.lower() and trace_id:
                self.retry_counts[trace_id] += 1

        if not agent_id:
            return

        rollup = self._get_rollup(agent_id)
        rollup.seen += 1
        rollup.last_seen = timestamp
        if latency > 0:
            rollup.latencies.append(latency)
            # Slow-changing baseline for anomaly comparison.
            if rollup.baseline_latency == 0:
                rollup.baseline_latency = latency
            else:
                rollup.baseline_latency = (rollup.baseline_latency * 0.95) + (latency * 0.05)

        if event_type == "TASK_FAIL":
            rollup.failures += 1
        elif event_type == "TASK_SUCCESS":
            rollup.successes += 1

    def _agent_metric(self, agent_id: str, rollup: AgentRollup) -> dict[str, Any]:
        completions = rollup.successes + rollup.failures
        failure_rate = (rollup.failures / completions) if completions else 0.0
        latency_avg = mean(rollup.latencies) if rollup.latencies else 0.0
        is_bottleneck = latency_avg > 0 and (
            latency_avg >= max(rollup.baseline_latency * 1.5, 300000)
            or failure_rate >= 0.1
        )
        return {
            "agent_id": agent_id,
            "latency_avg": round(latency_avg, 2),
            "failure_rate": round(failure_rate, 4),
            "throughput": rollup.seen,
            "is_bottleneck": is_bottleneck,
            "last_seen": rollup.last_seen.isoformat() if rollup.last_seen else None,
            "baseline_latency": round(rollup.baseline_latency, 2),
        }

    def get_agent_metric(self, agent_id: str) -> dict[str, Any] | None:
        rollup = self.agent_rollups.get(agent_id)
        if rollup is None:
            return None
        return self._agent_metric(agent_id, rollup)

    def snapshot_metrics(self) -> dict[str, Any]:
        agents = [
            self._agent_metric(agent_id, rollup)
            for agent_id, rollup in sorted(self.agent_rollups.items())
        ]
        traces = []
        for trace_id, span in self.trace_ranges.items():
            duration_ms = (span["end"] - span["start"]).total_seconds() * 1000
            traces.append(
                {
                    "trace_id": trace_id,
                    "start": span["start"].isoformat(),
                    "end": span["end"].isoformat(),
                    "duration_ms": round(duration_ms, 2),
                    "retry_count": self.retry_counts.get(trace_id, 0),
                }
            )

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "agents": agents,
            "traces": traces,
        }
