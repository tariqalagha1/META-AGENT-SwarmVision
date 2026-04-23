from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from statistics import quantiles
from typing import Callable, Literal
from uuid import uuid4

from app.core.thresholds import Thresholds, thresholds_snapshot
from app.schemas.context import MetaContext
from app.schemas.insight import Evidence, InsightMetadata, MetaInsight


def _build_metadata(context: MetaContext, thresholds: Thresholds, heuristic_name: str) -> InsightMetadata:
    return InsightMetadata(
        heuristic_name=heuristic_name,
        thresholds_used=thresholds_snapshot(thresholds),
        window_start=context.window_start,
        window_end=context.window_end,
        truncation_applied=context.truncation_applied,
    )


def _new_insight(
    context: MetaContext,
    thresholds: Thresholds,
    *,
    category: Literal[
        'BOTTLENECK',
        'REPEATED_FAILURE',
        'DECISION_PATTERN',
        'ANOMALY_CORRELATION',
        'LOAD_RISK',
        'GENERAL',
    ],
    severity: Literal['LOW', 'MEDIUM', 'HIGH'],
    confidence: float,
    title: str,
    summary: str,
    suggestion: str | None,
    trace_id: str | None,
    agent_id: str | None,
    evidence: Evidence,
    heuristic_name: str,
) -> MetaInsight:
    return MetaInsight(
        insight_id=uuid4(),
        dedup_key='pending',
        timestamp=context.timestamp,
        trace_id=trace_id,
        agent_id=agent_id,
        category=category,
        severity=severity,
        confidence=confidence,
        title=title,
        summary=summary,
        suggestion=suggestion,
        evidence=evidence,
        metadata=_build_metadata(context, thresholds, heuristic_name),
    )


def detect_bottlenecks(context: MetaContext, thresholds: Thresholds) -> list[MetaInsight]:
    insights: list[MetaInsight] = []
    slow_traces_by_agent: dict[str, list[str]] = defaultdict(list)
    state_by_agent = {state.agent_id: state.state for state in context.agent_states}

    for trace in context.metrics.traces:
        if trace.duration_ms > thresholds.BOTTLENECK_LATENCY_P95_MS:
            for decision in context.decisions:
                if decision.trace_id == trace.trace_id and decision.agent_id:
                    slow_traces_by_agent[decision.agent_id].append(trace.trace_id)

    for agent_id, trace_ids in slow_traces_by_agent.items():
        if len(set(trace_ids)) < thresholds.BOTTLENECK_MIN_TRACE_COUNT:
            continue
        state = state_by_agent.get(agent_id, 'ACTIVE')
        if state not in {'DEGRADED', 'FAILED'}:
            continue
        over = len(set(trace_ids)) - thresholds.BOTTLENECK_MIN_TRACE_COUNT
        severity = 'HIGH' if over >= 3 else 'MEDIUM'
        confidence = min(1.0, 0.65 + over * 0.08)
        insights.append(
            _new_insight(
                context,
                thresholds,
                category='BOTTLENECK',
                severity=severity,
                confidence=confidence,
                title=f'Potential bottleneck on {agent_id}',
                summary=f'{agent_id} appears in {len(set(trace_ids))} slow traces while in {state} state.',
                suggestion='Inspect queue depth and handoff load for this agent.',
                trace_id=context.trace_id,
                agent_id=agent_id,
                evidence=Evidence(decision_ids=[d.event_id for d in context.decisions if d.agent_id == agent_id][:50]),
                heuristic_name='bottleneck_detection',
            )
        )

    return insights


def detect_repeated_failure(context: MetaContext, thresholds: Thresholds) -> list[MetaInsight]:
    grouped: dict[str, list] = defaultdict(list)
    for anomaly in context.anomalies:
        anomaly_type = str(anomaly.payload.get('type') or anomaly.payload.get('anomaly_type') or 'UNKNOWN')
        grouped[anomaly_type].append(anomaly)

    insights: list[MetaInsight] = []
    for anomaly_type, anomalies in grouped.items():
        anomalies = sorted(anomalies, key=lambda a: a.timestamp)
        if len(anomalies) < thresholds.REPEATED_FAILURE_MIN_COUNT:
            continue

        latest = anomalies[-1].timestamp
        window_start = latest - timedelta(seconds=thresholds.REPEATED_FAILURE_WINDOW_SECONDS)
        in_window = [item for item in anomalies if item.timestamp >= window_start]
        if len(in_window) < thresholds.REPEATED_FAILURE_MIN_COUNT:
            continue

        severity = 'HIGH' if len(in_window) >= thresholds.REPEATED_FAILURE_MIN_COUNT + 2 else 'MEDIUM'
        confidence = min(0.95, 0.6 + len(in_window) * 0.08)
        insights.append(
            _new_insight(
                context,
                thresholds,
                category='REPEATED_FAILURE',
                severity=severity,
                confidence=confidence,
                title=f'Repeated anomaly: {anomaly_type}',
                summary=f'{anomaly_type} occurred {len(in_window)} times within the active window.',
                suggestion='Review recent deployment changes and failure signatures for this anomaly type.',
                trace_id=context.trace_id,
                agent_id=in_window[-1].agent_id,
                evidence=Evidence(anomaly_ids=[item.event_id for item in in_window][:50]),
                heuristic_name='repeated_failure',
            )
        )

    return insights


def detect_decision_pattern(context: MetaContext, thresholds: Thresholds) -> list[MetaInsight]:
    tracked_flags = {'FALLBACK', 'BLOCK', 'RETRY'}
    grouped: dict[tuple[str, str], list] = defaultdict(list)

    for decision in context.decisions:
        flag = str(decision.decision_flag or '').upper()
        if flag not in tracked_flags or not decision.agent_id:
            continue
        grouped[(decision.agent_id, flag)].append(decision)

    insights: list[MetaInsight] = []
    for (agent_id, flag), decisions in grouped.items():
        decisions = sorted(decisions, key=lambda d: d.timestamp)
        latest = decisions[-1].timestamp
        window_start = latest - timedelta(seconds=thresholds.DECISION_PATTERN_WINDOW_SECONDS)
        in_window = [item for item in decisions if item.timestamp >= window_start]
        if len(in_window) < thresholds.DECISION_PATTERN_MIN_COUNT:
            continue

        severity = 'HIGH' if flag == 'BLOCK' else 'MEDIUM'
        confidence = min(0.95, 0.55 + len(in_window) * 0.1)
        insights.append(
            _new_insight(
                context,
                thresholds,
                category='DECISION_PATTERN',
                severity=severity,
                confidence=confidence,
                title=f'Repeated {flag} decisions for {agent_id}',
                summary=f'{flag} was emitted {len(in_window)} times for {agent_id} in the configured window.',
                suggestion='Inspect upstream input quality and fallback guardrails for this agent.',
                trace_id=context.trace_id,
                agent_id=agent_id,
                evidence=Evidence(decision_ids=[item.event_id for item in in_window][:50]),
                heuristic_name='decision_pattern',
            )
        )

    return insights


def detect_anomaly_correlation(context: MetaContext, thresholds: Thresholds) -> list[MetaInsight]:
    insights: list[MetaInsight] = []
    anomalies_sorted = sorted(context.anomalies, key=lambda a: a.timestamp)
    if not anomalies_sorted:
        return insights

    for decision in sorted(context.decisions, key=lambda d: d.timestamp):
        if decision.decision_flag is None:
            continue

        window_end = decision.timestamp + timedelta(seconds=thresholds.ANOMALY_CORRELATION_WINDOW_SECONDS)
        related = [a for a in anomalies_sorted if decision.timestamp <= a.timestamp <= window_end]
        if not related:
            continue

        minutes = max(1, thresholds.ANOMALY_CORRELATION_WINDOW_SECONDS / 60)
        rate_per_min = len(related) / minutes
        if rate_per_min <= thresholds.ANOMALY_SPIKE_RATE_PER_MIN:
            continue

        severity = 'HIGH' if rate_per_min >= thresholds.ANOMALY_SPIKE_RATE_PER_MIN * 1.5 else 'MEDIUM'
        confidence = min(0.98, 0.65 + min(rate_per_min / thresholds.ANOMALY_SPIKE_RATE_PER_MIN, 1.0) * 0.25)
        insights.append(
            _new_insight(
                context,
                thresholds,
                category='ANOMALY_CORRELATION',
                severity=severity,
                confidence=confidence,
                title='Decision followed by anomaly spike',
                summary=f'Anomaly rate reached {rate_per_min:.1f}/min within {thresholds.ANOMALY_CORRELATION_WINDOW_SECONDS}s after a decision.',
                suggestion='Review the decision output and immediate downstream effects.',
                trace_id=decision.trace_id,
                agent_id=decision.agent_id,
                evidence=Evidence(
                    decision_ids=[decision.event_id],
                    anomaly_ids=[item.event_id for item in related][:50],
                ),
                heuristic_name='anomaly_correlation',
            )
        )

    return insights


def detect_load_risk(context: MetaContext, thresholds: Thresholds) -> list[MetaInsight]:
    if not context.metrics.traces:
        return []

    trace_count = len(context.metrics.traces)
    durations = sorted(max(float(trace.duration_ms), 0.0) for trace in context.metrics.traces)
    p95 = durations[-1] if len(durations) == 1 else quantiles(durations, n=100, method='inclusive')[94]
    degraded_agents = [state.agent_id for state in context.agent_states if state.state == 'DEGRADED']

    if not (
        trace_count >= thresholds.LOAD_THROUGHPUT_THRESHOLD
        and p95 > thresholds.LOAD_LATENCY_P95_MS
        and len(degraded_agents) >= thresholds.LOAD_DEGRADED_AGENT_COUNT
    ):
        return []

    return [
        _new_insight(
            context,
            thresholds,
            category='LOAD_RISK',
            severity='HIGH',
            confidence=0.86,
            title='Load risk increasing',
            summary=f'Trace throughput is {trace_count} with p95 latency {p95:.0f}ms and {len(degraded_agents)} degraded agents.',
            suggestion='Scale horizontally or shed low-priority work to avoid cascade failures.',
            trace_id=context.trace_id,
            agent_id=degraded_agents[0] if degraded_agents else None,
            evidence=Evidence(event_ids=[event.event_id for event in context.events[:50]]),
            heuristic_name='load_risk',
        )
    ]


HEURISTICS: list[tuple[str, Callable[[MetaContext, Thresholds], list[MetaInsight]]]] = [
    ('BOTTLENECK_DETECTION', detect_bottlenecks),
    ('REPEATED_FAILURE', detect_repeated_failure),
    ('DECISION_PATTERN', detect_decision_pattern),
    ('ANOMALY_CORRELATION', detect_anomaly_correlation),
    ('LOAD_RISK', detect_load_risk),
]
