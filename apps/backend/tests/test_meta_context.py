from __future__ import annotations

from datetime import datetime, timedelta

from app.observability.aggregation_service import AggregationService
from app.observability.meta_context import build_meta_context


def test_build_meta_context_applies_caps_and_truncation():
    now = datetime.utcnow()
    recent_events = [
        {
            'event_id': f'e{index}',
            'event_type': 'TASK_SUCCESS',
            'timestamp': (now - timedelta(seconds=index)).isoformat(),
            'trace_id': 'trace-1',
            'agent_id': 'agent-1',
            'payload': {},
        }
        for index in range(250)
    ]
    recent_decisions = [
        {
            'event_id': f'd{index}',
            'timestamp': (now - timedelta(seconds=index)).isoformat(),
            'trace_id': 'trace-1',
            'agent_id': 'agent-1',
            'decision_flag': 'FALLBACK',
            'payload': {},
        }
        for index in range(140)
    ]
    recent_anomalies = [
        {
            'event_id': f'a{index}',
            'timestamp': (now - timedelta(seconds=index)).isoformat(),
            'trace_id': 'trace-1',
            'agent_id': 'agent-1',
            'payload': {},
        }
        for index in range(140)
    ]

    agg = AggregationService()
    context = build_meta_context(
        recent_events=recent_events,
        recent_decisions=recent_decisions,
        recent_anomalies=recent_anomalies,
        aggregation_service=agg,
        agent_states=[{'agent_id': f'agent-{index}', 'state': 'ACTIVE'} for index in range(60)],
        trace_id='trace-1',
        trigger='manual',
    )

    assert len(context.events) == 200
    assert len(context.decisions) == 100
    assert len(context.anomalies) == 100
    assert len(context.agent_states) == 50
    assert context.truncation_applied is True
