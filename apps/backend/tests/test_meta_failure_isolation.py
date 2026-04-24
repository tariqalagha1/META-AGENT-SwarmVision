from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from app.clients.meta_client import (
    configure_meta_client,
    dispatch_to_meta,
    fire_and_forget_meta,
)
from app.schemas.meta import MetaContext


def _context() -> MetaContext:
    now = datetime.utcnow()
    return MetaContext(
        trace_id='trace-isolation',
        events=[],
        decisions=[],
        anomalies=[],
        metrics={'timestamp': now.isoformat(), 'agents': [], 'traces': []},
        agent_states=[],
        timestamp=now,
        window_start=now - timedelta(minutes=5),
        window_end=now,
        truncation_applied=False,
        trigger='manual',
    )


def test_meta_offline_dispatch_fails_silently():
    configure_meta_client(
        enabled=True,
        url='http://127.0.0.1:65530',
        timeout_ms=100,
        shared_secret='token',
        semaphore_size=16,
    )

    asyncio.run(dispatch_to_meta(_context()))


def test_fire_and_forget_returns_immediately_when_disabled():
    configure_meta_client(
        enabled=False,
        url='http://127.0.0.1:65530',
        timeout_ms=100,
        shared_secret='token',
        semaphore_size=16,
    )

    start = datetime.utcnow()
    fire_and_forget_meta(_context())
    elapsed = (datetime.utcnow() - start).total_seconds()

    assert elapsed < 0.01
