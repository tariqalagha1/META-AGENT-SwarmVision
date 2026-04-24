from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal

from app.observability.aggregation_service import AggregationService
from app.schemas.meta import (
    MetaAgentMetric,
    MetaAgentState,
    MetaAnomalyEvent,
    MetaContext,
    MetaDecisionEvent,
    MetaEvent,
    MetaMetrics,
    MetaTraceMetric,
)


def _parse_timestamp(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace('Z', '+00:00')).replace(tzinfo=None)


def _parse_optional_timestamp(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return _parse_timestamp(str(value))


def _in_window(item: dict, window_start: datetime, window_end: datetime, trace_id: str | None) -> bool:
    ts = _parse_timestamp(item.get('timestamp') or window_end)
    if ts < window_start or ts > window_end:
        return False
    if trace_id and item.get('trace_id') != trace_id:
        return False
    return True


def build_meta_context(
    *,
    recent_events: list[dict],
    recent_decisions: list[dict],
    recent_anomalies: list[dict],
    aggregation_service: AggregationService,
    agent_states: list[dict],
    trace_id: str | None = None,
    trigger: Literal['trace_complete', 'anomaly_detected', 'periodic', 'manual'] = 'manual',
) -> MetaContext:
    now = datetime.utcnow()
    window_start = now - timedelta(minutes=5)

    events_filtered = [item for item in recent_events if _in_window(item, window_start, now, trace_id)]
    decisions_filtered = [item for item in recent_decisions if _in_window(item, window_start, now, trace_id)]
    anomalies_filtered = [item for item in recent_anomalies if _in_window(item, window_start, now, trace_id)]

    events_sorted = sorted(events_filtered, key=lambda item: _parse_timestamp(item['timestamp']))
    decisions_sorted = sorted(decisions_filtered, key=lambda item: _parse_timestamp(item['timestamp']))
    anomalies_sorted = sorted(anomalies_filtered, key=lambda item: _parse_timestamp(item['timestamp']))

    events_capped = events_sorted[-200:]
    decisions_capped = decisions_sorted[-100:]
    anomalies_capped = anomalies_sorted[-100:]

    metrics_raw = aggregation_service.snapshot_metrics()
    metrics_agents = [
        MetaAgentMetric(
            agent_id=str(item.get('agent_id') or ''),
            latency_avg=float(item.get('latency_avg') or 0),
            failure_rate=float(item.get('failure_rate') or 0),
            throughput=int(item.get('throughput') or 0),
            state='DEGRADED' if bool(item.get('is_bottleneck')) else 'ACTIVE',
        )
        for item in metrics_raw.get('agents', [])[:50]
        if item.get('agent_id')
    ]

    metrics_traces = [
        MetaTraceMetric(
            trace_id=str(item.get('trace_id') or ''),
            duration_ms=float(item.get('duration_ms') or 0),
            retry_count=int(item.get('retry_count') or 0),
        )
        for item in metrics_raw.get('traces', [])[:50]
        if item.get('trace_id')
    ]

    states_capped = [
        MetaAgentState(
            agent_id=str(item.get('agent_id') or ''),
            state=str(item.get('state') or 'ACTIVE'),
            last_seen=_parse_optional_timestamp(item.get('last_seen')),
        )
        for item in agent_states[:50]
        if item.get('agent_id')
    ]

    truncation_applied = (
        len(events_sorted) > len(events_capped)
        or len(decisions_sorted) > len(decisions_capped)
        or len(anomalies_sorted) > len(anomalies_capped)
        or len(metrics_raw.get('agents', [])) > 50
        or len(metrics_raw.get('traces', [])) > 50
        or len(agent_states) > 50
    )

    return MetaContext(
        trace_id=trace_id,
        events=[
            MetaEvent(
                event_id=str(item.get('event_id') or item.get('id') or ''),
                event_type=str(item.get('event_type') or item.get('type') or 'UNKNOWN'),
                timestamp=_parse_timestamp(item['timestamp']),
                trace_id=item.get('trace_id'),
                agent_id=item.get('agent_id'),
                payload=dict(item.get('payload') or {}),
            )
            for item in events_capped
            if item.get('timestamp')
        ],
        decisions=[
            MetaDecisionEvent(
                event_id=str(item.get('event_id') or item.get('id') or ''),
                timestamp=_parse_timestamp(item['timestamp']),
                trace_id=item.get('trace_id'),
                agent_id=item.get('agent_id'),
                decision_flag=item.get('decision_flag'),
                payload=dict(item.get('payload') or {}),
            )
            for item in decisions_capped
            if item.get('timestamp')
        ],
        anomalies=[
            MetaAnomalyEvent(
                event_id=str(item.get('event_id') or item.get('id') or ''),
                timestamp=_parse_timestamp(item['timestamp']),
                trace_id=item.get('trace_id'),
                agent_id=item.get('agent_id'),
                payload=dict(item.get('payload') or {}),
            )
            for item in anomalies_capped
            if item.get('timestamp')
        ],
        metrics=MetaMetrics(timestamp=now, agents=metrics_agents, traces=metrics_traces),
        agent_states=states_capped,
        timestamp=now,
        window_start=window_start,
        window_end=now,
        truncation_applied=truncation_applied,
        trigger=trigger,
    )
