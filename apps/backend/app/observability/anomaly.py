"""Lightweight anomaly detection rules for streaming alerts."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4


def detect_agent_anomalies(agent_metric: dict[str, Any]) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    if not agent_metric:
        return anomalies

    latency = float(agent_metric.get("latency_avg") or 0)
    baseline = float(agent_metric.get("baseline_latency") or 0)
    failure_rate = float(agent_metric.get("failure_rate") or 0)
    agent_id = str(agent_metric.get("agent_id") or "")

    if baseline > 0 and latency > baseline * 1.5:
        anomalies.append(
            _anomaly_event(
                anomaly_type="LATENCY_SPIKE",
                severity="MEDIUM",
                agent_id=agent_id,
                details={"latency_avg": latency, "baseline_latency": baseline},
            )
        )

    if failure_rate > 0.1:
        anomalies.append(
            _anomaly_event(
                anomaly_type="HIGH_FAILURE_RATE",
                severity="HIGH" if failure_rate >= 0.3 else "MEDIUM",
                agent_id=agent_id,
                details={"failure_rate": failure_rate},
            )
        )

    return anomalies


def _anomaly_event(
    anomaly_type: str,
    severity: str,
    agent_id: str,
    details: dict[str, Any],
) -> dict[str, Any]:
    return {
        "event_id": str(uuid4()),
        "event_type": "ANOMALY",
        "timestamp": datetime.utcnow().isoformat(),
        "source": "system",
        "agent_id": agent_id,
        "latency_ms": 0,
        "payload": {
            "type": anomaly_type,
            "severity": severity,
            "agent_id": agent_id,
            "details": details,
        },
        "context": {},
    }
