"""Rule-based analytics and root cause intelligence built from persisted events."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from statistics import mean
from typing import Any

from app.core.settings import get_settings
from app.neo4j.replay import build_topology_snapshot

settings = get_settings()


def build_summary_response(
    events: list[dict[str, Any]], from_timestamp: datetime, to_timestamp: datetime
) -> dict[str, Any]:
    snapshot = build_topology_snapshot(events, to_timestamp)
    handoff_latencies = _collect_handoff_latencies(events)
    completion_latencies = _collect_completion_latencies(events)

    return {
        "available": True,
        "from_timestamp": from_timestamp,
        "to_timestamp": to_timestamp,
        "metrics": {
            "total_events": len(events),
            "active_agents": sum(
                1
                for agent in snapshot["agents"].values()
                if agent["state"] in {"active", "working"}
            ),
            "failed_tasks": sum(1 for event in events if event.get("type") == "TASK_FAIL"),
            "successful_tasks": sum(
                1 for event in events if event.get("type") == "TASK_SUCCESS"
            ),
            "average_handoff_latency_ms": _safe_average(handoff_latencies),
            "peak_concurrent_agents": _calculate_peak_concurrent_agents(events),
            "average_task_completion_time_ms": _safe_average(completion_latencies),
        },
    }


def build_failures_response(
    events: list[dict[str, Any]], from_timestamp: datetime, to_timestamp: datetime
) -> dict[str, Any]:
    failure_events = [event for event in events if event.get("type") == "TASK_FAIL"]
    handoff_latencies = _collect_handoff_latencies(events, with_timestamps=True)
    latency_baseline = mean([item["latency_ms"] for item in handoff_latencies]) if handoff_latencies else 0

    incidents = []
    for event in failure_events:
        payload = event.get("payload", {}) or {}
        timestamp = _to_datetime(event["timestamp"])
        task_id = payload.get("task_id")
        suspected_source = _find_suspected_source(events, task_id, timestamp) or payload.get(
            "agent_id"
        )
        related_recent_failures = sum(
            1
            for failure in failure_events
            if failure["id"] != event["id"]
            and _to_datetime(failure["timestamp"])
            >= timestamp - timedelta(minutes=settings.analytics_failure_lookback_minutes)
            and _to_datetime(failure["timestamp"]) <= timestamp
            and (
                failure.get("payload", {}).get("agent_id") == payload.get("agent_id")
                or _find_suspected_source(
                    events, failure.get("payload", {}).get("task_id"), _to_datetime(failure["timestamp"])
                )
                == suspected_source
            )
        )
        recent_latencies = [
            item["latency_ms"]
            for item in handoff_latencies
            if timestamp - timedelta(minutes=settings.analytics_latency_window_minutes)
            <= item["timestamp"]
            <= timestamp
        ]
        recent_average = mean(recent_latencies) if recent_latencies else 0
        latency_spike = bool(
            recent_latencies
            and (
                recent_average >= settings.analytics_latency_spike_absolute_ms
                or (
                    latency_baseline
                    and recent_average
                    > latency_baseline * settings.analytics_latency_spike_ratio
                )
            )
        )

        incidents.append(
            {
                "event_id": event["id"],
                "timestamp": timestamp,
                "agent_id": payload.get("agent_id"),
                "task_id": task_id,
                "suspected_source_node": suspected_source,
                "upstream_chain": _build_upstream_chain(events, task_id, timestamp),
                "related_recent_failures": related_recent_failures,
                "latency_spike_correlation": latency_spike,
                "message": payload.get("error")
                or payload.get("message")
                or payload.get("task")
                or "task failed",
            }
        )

    return {
        "available": True,
        "from_timestamp": from_timestamp,
        "to_timestamp": to_timestamp,
        "total_failures": len(failure_events),
        "failures_over_time": _build_failure_buckets(failure_events, from_timestamp, to_timestamp),
        "incidents": incidents,
    }


def build_latency_response(
    events: list[dict[str, Any]], from_timestamp: datetime, to_timestamp: datetime
) -> dict[str, Any]:
    event_buckets = defaultdict(int)
    for event in events:
        event_buckets[_floor_minute(_to_datetime(event["timestamp"]))] += 1

    handoff_buckets = defaultdict(list)
    for item in _collect_handoff_latencies(events, with_timestamps=True):
        handoff_buckets[_floor_minute(item["timestamp"])].append(item["latency_ms"])

    completion_buckets = defaultdict(list)
    for item in _collect_completion_latencies(events, with_timestamps=True):
        completion_buckets[_floor_minute(item["timestamp"])].append(item["latency_ms"])

    minutes = _iterate_minutes(from_timestamp, to_timestamp)

    return {
        "available": True,
        "from_timestamp": from_timestamp,
        "to_timestamp": to_timestamp,
        "events_per_minute": [
            {"bucket": bucket, "value": float(event_buckets.get(bucket, 0))}
            for bucket in minutes
        ],
        "latency_over_time": [
            {
                "bucket": bucket,
                "average_handoff_latency_ms": _safe_average(handoff_buckets.get(bucket, [])),
                "average_task_completion_time_ms": _safe_average(
                    completion_buckets.get(bucket, [])
                ),
            }
            for bucket in minutes
        ],
    }


def build_bottlenecks_response(
    events: list[dict[str, Any]], from_timestamp: datetime, to_timestamp: datetime
) -> dict[str, Any]:
    snapshot = build_topology_snapshot(events, to_timestamp)
    per_agent = _aggregate_agent_metrics(events)
    global_completion_avg = _safe_average(
        [
            latency
            for metrics in per_agent.values()
            for latency in metrics["completion_latencies"]
        ]
    )
    global_handoff_avg = _safe_average(
        [latency for metrics in per_agent.values() for latency in metrics["handoff_latencies"]]
    )

    agents = []
    root_causes = []
    failure_index = {
        agent_id: metrics["failures"]
        for agent_id, metrics in per_agent.items()
    }

    for agent_id, agent in snapshot["agents"].items():
        metrics = per_agent.get(agent_id, _empty_agent_metrics())
        failure_rate = (
            metrics["failures"] / metrics["terminal_events"]
            if metrics["terminal_events"]
            else 0
        )
        avg_completion = _safe_average(metrics["completion_latencies"])
        avg_handoff = _safe_average(metrics["handoff_latencies"])
        stuck_task_ids = [
            task_id
            for task_id, started_at in metrics["open_tasks"].items()
            if to_timestamp - started_at > timedelta(minutes=settings.analytics_stuck_task_minutes)
        ]
        blocker_count = metrics["handoff_blockers"]

        categories: list[str] = []
        if (
            avg_completion
            and global_completion_avg
            and avg_completion
            > global_completion_avg * settings.analytics_slow_completion_ratio
        ):
            categories.append("slow_nodes")
        if failure_rate >= settings.analytics_failure_rate_threshold and metrics["failures"] >= 1:
            categories.append("high_failure_nodes")
        if stuck_task_ids:
            categories.append("stuck_nodes")
        if blocker_count >= 1 or avg_handoff >= settings.analytics_latency_spike_absolute_ms or (
            avg_handoff
            and global_handoff_avg
            and avg_handoff > global_handoff_avg * settings.analytics_handoff_latency_ratio
        ):
            categories.append("frequent_handoff_blockers")

        severity = "healthy"
        if len(categories) >= 2 or "stuck_nodes" in categories:
            severity = "bottleneck"
        elif categories:
            severity = "warning"

        summary = _summarize_bottleneck(
            agent["name"], categories, avg_completion, avg_handoff, failure_rate, stuck_task_ids
        )

        agent_item = {
            "agent_id": agent_id,
            "agent_name": agent["name"],
            "severity": severity,
            "categories": categories,
            "summary": summary,
            "failure_rate": failure_rate,
            "avg_completion_time_ms": avg_completion,
            "avg_handoff_latency_ms": avg_handoff,
            "blocker_count": blocker_count,
            "stuck_task_ids": stuck_task_ids,
        }
        agents.append(agent_item)

        if severity != "healthy":
            root_causes.append(
                {
                    "agent_id": agent_id,
                    "severity": severity,
                    "summary": summary,
                    "upstream_chain": _latest_upstream_chain(events, agent_id, to_timestamp),
                    "recent_failure_count": failure_index.get(agent_id, 0),
                    "latency_spike_correlation": bool(
                        avg_handoff
                        and global_handoff_avg
                        and avg_handoff
                        > global_handoff_avg * settings.analytics_root_cause_latency_ratio
                    ),
                }
            )

    agents.sort(key=lambda item: (item["severity"] != "bottleneck", item["severity"] != "warning", item["agent_name"]))
    root_causes.sort(
        key=lambda item: (
            item["severity"] != "bottleneck",
            item["severity"] != "warning",
            -item["recent_failure_count"],
        )
    )

    return {
        "available": True,
        "from_timestamp": from_timestamp,
        "to_timestamp": to_timestamp,
        "agents": agents,
        "suspected_root_causes": root_causes[:8],
    }


def _aggregate_agent_metrics(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    metrics = defaultdict(_empty_agent_metrics)
    open_task_starts: dict[str, tuple[str, datetime]] = {}
    pending_handoffs: list[dict[str, Any]] = []

    for event in events:
        timestamp = _to_datetime(event["timestamp"])
        payload = event.get("payload", {}) or {}
        event_type = event.get("type")

        if event_type == "TASK_START":
            agent_id = payload.get("agent_id")
            task_id = payload.get("task_id")
            if agent_id:
                metrics[agent_id]["seen"] = True
                if task_id:
                    metrics[agent_id]["open_tasks"][task_id] = timestamp
                    open_task_starts[task_id] = (agent_id, timestamp)

        elif event_type == "TASK_HANDOFF":
            source_id = payload.get("source_agent_id")
            target_id = payload.get("target_agent_id")
            task_id = payload.get("task_id")
            if source_id:
                metrics[source_id]["seen"] = True
            if target_id:
                metrics[target_id]["seen"] = True
                pending_handoffs.append(
                    {
                        "target_id": target_id,
                        "task_id": task_id,
                        "timestamp": timestamp,
                    }
                )

        elif event_type in {"TASK_SUCCESS", "TASK_FAIL"}:
            agent_id = payload.get("agent_id")
            task_id = payload.get("task_id")
            if not agent_id:
                continue

            agent_metrics = metrics[agent_id]
            agent_metrics["seen"] = True
            agent_metrics["terminal_events"] += 1
            if event_type == "TASK_FAIL":
                agent_metrics["failures"] += 1

            if task_id and task_id in open_task_starts:
                started_by, started_at = open_task_starts.pop(task_id)
                metrics[started_by]["completion_latencies"].append(
                    (timestamp - started_at).total_seconds() * 1000
                )
                metrics[started_by]["open_tasks"].pop(task_id, None)

            match_index = None
            for index, pending in enumerate(pending_handoffs):
                if pending["target_id"] != agent_id:
                    continue
                if pending["task_id"] and task_id and pending["task_id"] != task_id:
                    continue
                match_index = index
                break
            if match_index is not None:
                pending = pending_handoffs.pop(match_index)
                agent_metrics["handoff_latencies"].append(
                    (timestamp - pending["timestamp"]).total_seconds() * 1000
                )
            elif event_type == "TASK_FAIL":
                agent_metrics["handoff_blockers"] += 1

    for pending in pending_handoffs:
        metrics[pending["target_id"]]["handoff_blockers"] += 1

    return metrics


def _empty_agent_metrics() -> dict[str, Any]:
    return {
        "seen": False,
        "failures": 0,
        "terminal_events": 0,
        "completion_latencies": [],
        "handoff_latencies": [],
        "handoff_blockers": 0,
        "open_tasks": {},
    }


def _calculate_peak_concurrent_agents(events: list[dict[str, Any]]) -> int:
    states: dict[str, str] = {}
    peak = 0

    for event in events:
        payload = event.get("payload", {}) or {}
        event_type = event.get("type")

        if event_type == "AGENT_SPAWN" and payload.get("agent_id"):
            states[payload["agent_id"]] = "active"
        elif event_type == "TASK_START" and payload.get("agent_id"):
            states[payload["agent_id"]] = "working"
        elif event_type == "TASK_HANDOFF":
            if payload.get("source_agent_id"):
                states[payload["source_agent_id"]] = "active"
            if payload.get("target_agent_id"):
                states[payload["target_agent_id"]] = "working"
        elif event_type in {"TASK_SUCCESS", "TASK_FAIL"} and payload.get("agent_id"):
            states[payload["agent_id"]] = "success" if event_type == "TASK_SUCCESS" else "failed"
        elif event_type == "AGENT_TERMINATION" and payload.get("agent_id"):
            states[payload["agent_id"]] = "terminated"

        peak = max(peak, sum(1 for state in states.values() if state in {"active", "working"}))

    return peak


def _collect_completion_latencies(
    events: list[dict[str, Any]], with_timestamps: bool = False
) -> list[Any]:
    starts: dict[str, datetime] = {}
    results = []

    for event in events:
        payload = event.get("payload", {}) or {}
        timestamp = _to_datetime(event["timestamp"])
        if event.get("type") == "TASK_START" and payload.get("task_id"):
            starts[payload["task_id"]] = timestamp
        elif event.get("type") in {"TASK_SUCCESS", "TASK_FAIL"} and payload.get("task_id"):
            task_id = payload["task_id"]
            if task_id in starts:
                latency_ms = (timestamp - starts.pop(task_id)).total_seconds() * 1000
                if with_timestamps:
                    results.append({"timestamp": timestamp, "latency_ms": latency_ms})
                else:
                    results.append(latency_ms)

    return results


def _collect_handoff_latencies(
    events: list[dict[str, Any]], with_timestamps: bool = False
) -> list[Any]:
    pending_handoffs: list[dict[str, Any]] = []
    results = []

    for event in events:
        payload = event.get("payload", {}) or {}
        timestamp = _to_datetime(event["timestamp"])
        event_type = event.get("type")

        if event_type == "TASK_HANDOFF":
            target_id = payload.get("target_agent_id")
            if target_id:
                pending_handoffs.append(
                    {
                        "target_id": target_id,
                        "task_id": payload.get("task_id"),
                        "timestamp": timestamp,
                    }
                )
            continue

        if event_type not in {"TASK_START", "TASK_SUCCESS", "TASK_FAIL"}:
            continue

        agent_id = payload.get("agent_id")
        if not agent_id:
            continue

        task_id = payload.get("task_id")
        match_index = None
        for index, pending in enumerate(pending_handoffs):
            if pending["target_id"] != agent_id:
                continue
            if pending["task_id"] and task_id and pending["task_id"] != task_id:
                continue
            match_index = index
            break

        if match_index is None:
            continue

        pending = pending_handoffs.pop(match_index)
        latency_ms = (timestamp - pending["timestamp"]).total_seconds() * 1000
        if with_timestamps:
            results.append({"timestamp": timestamp, "latency_ms": latency_ms})
        else:
            results.append(latency_ms)

    return results


def _build_failure_buckets(
    failure_events: list[dict[str, Any]], from_timestamp: datetime, to_timestamp: datetime
) -> list[dict[str, Any]]:
    buckets = defaultdict(int)
    for event in failure_events:
        buckets[_floor_minute(_to_datetime(event["timestamp"]))] += 1

    return [
        {"bucket": bucket, "value": float(buckets.get(bucket, 0))}
        for bucket in _iterate_minutes(from_timestamp, to_timestamp)
    ]


def _find_suspected_source(
    events: list[dict[str, Any]], task_id: str | None, until_timestamp: datetime
) -> str | None:
    if not task_id:
        return None

    for event in reversed(events):
        timestamp = _to_datetime(event["timestamp"])
        if timestamp > until_timestamp:
            continue
        payload = event.get("payload", {}) or {}
        if event.get("type") == "TASK_HANDOFF" and payload.get("task_id") == task_id:
            return payload.get("source_agent_id") or payload.get("agent_id")

    for event in reversed(events):
        timestamp = _to_datetime(event["timestamp"])
        if timestamp > until_timestamp:
            continue
        payload = event.get("payload", {}) or {}
        if event.get("type") == "TASK_START" and payload.get("task_id") == task_id:
            return payload.get("agent_id")

    return None


def _build_upstream_chain(
    events: list[dict[str, Any]], task_id: str | None, until_timestamp: datetime
) -> list[str]:
    if not task_id:
        return []

    chain: list[str] = []
    for event in events:
        timestamp = _to_datetime(event["timestamp"])
        if timestamp > until_timestamp:
            break
        payload = event.get("payload", {}) or {}
        if payload.get("task_id") != task_id:
            continue
        if event.get("type") == "TASK_START" and payload.get("agent_id"):
            if not chain or chain[-1] != payload["agent_id"]:
                chain.append(payload["agent_id"])
        elif event.get("type") == "TASK_HANDOFF":
            source_id = payload.get("source_agent_id")
            target_id = payload.get("target_agent_id")
            for agent_id in (source_id, target_id):
                if agent_id and (not chain or chain[-1] != agent_id):
                    chain.append(agent_id)
        elif payload.get("agent_id"):
            if not chain or chain[-1] != payload["agent_id"]:
                chain.append(payload["agent_id"])

    return chain[-6:]


def _latest_upstream_chain(
    events: list[dict[str, Any]], agent_id: str, until_timestamp: datetime
) -> list[str]:
    related_task_id = None
    for event in reversed(events):
        timestamp = _to_datetime(event["timestamp"])
        if timestamp > until_timestamp:
            continue
        payload = event.get("payload", {}) or {}
        if payload.get("agent_id") == agent_id or payload.get("target_agent_id") == agent_id:
            related_task_id = payload.get("task_id")
            break

    return _build_upstream_chain(events, related_task_id, until_timestamp)


def _summarize_bottleneck(
    agent_name: str,
    categories: list[str],
    avg_completion: float,
    avg_handoff: float,
    failure_rate: float,
    stuck_task_ids: list[str],
) -> str:
    if not categories:
        return f"{agent_name} is operating within normal thresholds."

    fragments = []
    if "slow_nodes" in categories:
        fragments.append(f"slow completion average at {round(avg_completion)} ms")
    if "high_failure_nodes" in categories:
        fragments.append(f"failure rate at {failure_rate:.0%}")
    if "stuck_nodes" in categories:
        fragments.append(f"stuck on {len(stuck_task_ids)} task(s)")
    if "frequent_handoff_blockers" in categories:
        fragments.append(f"handoff latency elevated to {round(avg_handoff)} ms")

    return f"{agent_name} shows {', '.join(fragments)}."


def _iterate_minutes(from_timestamp: datetime, to_timestamp: datetime) -> list[datetime]:
    start = _floor_minute(from_timestamp)
    end = _floor_minute(to_timestamp)
    current = start
    buckets = []
    while current <= end:
        buckets.append(current)
        current += timedelta(minutes=1)
    return buckets


def _floor_minute(value: datetime) -> datetime:
    return value.replace(second=0, microsecond=0)


def _safe_average(values: list[float]) -> float:
    return round(mean(values), 2) if values else 0


def _to_datetime(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
