from __future__ import annotations

from datetime import datetime, timedelta

from app.services.storage import apply_retention_policy


def test_retention_drops_rows_older_than_threshold():
    now = datetime.utcnow()
    rows = [
        {'id': 'fresh', 'timestamp': now - timedelta(days=1)},
        {'id': 'stale', 'timestamp': now - timedelta(days=31)},
    ]

    kept = apply_retention_policy(rows, now=now, retention_days=30, max_rows=10_000)

    ids = [r['id'] for r in kept]
    assert 'fresh' in ids
    assert 'stale' not in ids


def test_retention_enforces_max_row_cap():
    now = datetime.utcnow()
    rows = [{'id': str(i), 'timestamp': now - timedelta(minutes=i)} for i in range(500)]

    kept = apply_retention_policy(rows, now=now, retention_days=30, max_rows=100)

    assert len(kept) == 100


def test_retention_returns_most_recent_rows_when_capped():
    now = datetime.utcnow()
    rows = [{'id': str(i), 'timestamp': now - timedelta(minutes=i)} for i in range(200)]

    kept = apply_retention_policy(rows, now=now, retention_days=30, max_rows=50)

    # Most recent are id='0' .. id='49' (smallest offset)
    kept_ids = {r['id'] for r in kept}
    assert '0' in kept_ids
    assert '199' not in kept_ids


def test_retention_empty_input_returns_empty():
    now = datetime.utcnow()
    assert apply_retention_policy([], now=now) == []


def test_retention_rows_missing_timestamp_are_dropped():
    now = datetime.utcnow()
    rows = [
        {'id': 'no-ts'},
        {'id': 'has-ts', 'timestamp': now - timedelta(hours=1)},
    ]

    kept = apply_retention_policy(rows, now=now, retention_days=30, max_rows=10_000)

    ids = [r['id'] for r in kept]
    assert 'has-ts' in ids
    assert 'no-ts' not in ids
