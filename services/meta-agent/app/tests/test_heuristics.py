from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from app.core.settings import Settings
from app.core.thresholds import Thresholds
from app.schemas.context import MetaContext
from app.services.analyzer import Analyzer


def _context() -> MetaContext:
    now = datetime.utcnow()
    return MetaContext(
        trace_id='trace-a',
        events=[
            {
                'event_id': f'evt-{index}',
                'event_type': 'TASK_SUCCESS',
                'timestamp': (now - timedelta(seconds=index)).isoformat(),
                'trace_id': 'trace-a',
                'agent_id': 'agent-a',
                'payload': {},
            }
            for index in range(10)
        ],
        decisions=[
            {
                'event_id': f'dec-{index}',
                'timestamp': (now - timedelta(seconds=index * 30)).isoformat(),
                'trace_id': 'trace-a',
                'agent_id': 'agent-a',
                'decision_flag': 'FALLBACK',
                'payload': {'decision_point': 'route'},
            }
            for index in range(4)
        ],
        anomalies=[
            {
                'event_id': f'anom-{index}',
                'timestamp': (now - timedelta(seconds=index * 20)).isoformat(),
                'trace_id': 'trace-a',
                'agent_id': 'agent-a',
                'payload': {'type': 'LATENCY_SPIKE'},
            }
            for index in range(4)
        ],
        metrics={
            'timestamp': now.isoformat(),
            'agents': [
                {
                    'agent_id': 'agent-a',
                    'latency_avg': 3200,
                    'failure_rate': 0.2,
                    'throughput': 80,
                    'state': 'DEGRADED',
                }
            ],
            'traces': [
                {'trace_id': f'trace-{index}', 'duration_ms': 3600, 'retry_count': 2}
                for index in range(50)
            ],
        },
        agent_states=[
            {'agent_id': 'agent-a', 'state': 'DEGRADED', 'last_seen': now.isoformat()}
        ],
        timestamp=now,
        window_start=now - timedelta(minutes=5),
        window_end=now,
        truncation_applied=False,
        trigger='manual',
    )


def test_deterministic_analysis_same_input_same_output():
    settings = Settings(META_REQUIRE_AUTH_IN_PROD=False)
    analyzer = Analyzer(settings=settings, thresholds=Thresholds())
    context = _context()

    first, _ = asyncio.run(analyzer.analyze(context))
    second, _ = asyncio.run(analyzer.analyze(context))

    normalized_first = [
        (item.category, item.severity, item.title, item.dedup_key)
        for item in first
    ]
    normalized_second = [
        (item.category, item.severity, item.title, item.dedup_key)
        for item in second
    ]

    assert normalized_first == normalized_second


def test_threshold_override_changes_output():
    settings = Settings(META_REQUIRE_AUTH_IN_PROD=False)
    context = _context()

    baseline = Analyzer(settings=settings, thresholds=Thresholds())
    strict = Analyzer(
        settings=settings,
        thresholds=Thresholds(DECISION_PATTERN_MIN_COUNT=10, REPEATED_FAILURE_MIN_COUNT=10),
    )

    baseline_insights, _ = asyncio.run(baseline.analyze(context))
    strict_insights, _ = asyncio.run(strict.analyze(context))

    assert len(strict_insights) < len(baseline_insights)
