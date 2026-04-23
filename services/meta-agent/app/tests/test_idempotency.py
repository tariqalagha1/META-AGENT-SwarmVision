from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from app.schemas.insight import Evidence, InsightMetadata, MetaInsight
from app.services.dedup import DedupCache, compute_dedup_key
from app.services.storage import apply_retention_policy


def _insight(window_start: datetime, evidence: list[str]) -> MetaInsight:
    return MetaInsight(
        insight_id=uuid4(),
        dedup_key='pending',
        timestamp=window_start + timedelta(seconds=30),
        trace_id='trace-id',
        agent_id='agent-id',
        category='DECISION_PATTERN',
        severity='MEDIUM',
        confidence=0.8,
        title='Repeated fallback',
        summary='Fallback appears repeatedly.',
        suggestion='Investigate routing policy.',
        evidence=Evidence(decision_ids=evidence),
        metadata=InsightMetadata(
            heuristic_name='decision_pattern',
            thresholds_used={'DECISION_PATTERN_MIN_COUNT': 3.0},
            window_start=window_start,
            window_end=window_start + timedelta(minutes=5),
            truncation_applied=False,
        ),
    )


def test_dedup_key_stable_with_same_bucket():
    window = datetime.utcnow().replace(second=10, microsecond=0)
    a = _insight(window, ['d2', 'd1'])
    b = _insight(window + timedelta(seconds=30), ['d1', 'd2'])

    assert compute_dedup_key(a) == compute_dedup_key(b)


def test_dedup_cache_recognizes_repeat():
    cache = DedupCache(max_entries=10)
    key = 'abc'

    assert cache.seen(key) is False
    assert cache.seen(key) is True


def test_dedup_key_changes_for_different_bucket():
    now = datetime.utcnow().replace(second=0, microsecond=0)
    a = _insight(now, ['x'])
    b = _insight(now + timedelta(minutes=1), ['x'])

    assert compute_dedup_key(a) != compute_dedup_key(b)


def test_retention_policy_enforces_age_and_global_cap():
    now = datetime.utcnow()
    rows = []

    for index in range(15_000):
        rows.append({'id': f'new-{index}', 'timestamp': now - timedelta(minutes=index)})

    rows.append({'id': 'old-1', 'timestamp': now - timedelta(days=31)})
    rows.append({'id': 'old-2', 'timestamp': now - timedelta(days=45)})

    kept = apply_retention_policy(rows, now=now, retention_days=30, max_rows=10_000)

    assert len(kept) == 10_000
    assert all(item['timestamp'] >= now - timedelta(days=30) for item in kept)
