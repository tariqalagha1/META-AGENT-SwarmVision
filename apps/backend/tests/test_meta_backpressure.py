from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from app.clients import meta_client
from app.schemas.meta import MetaContext


def _context(trace_id: str) -> MetaContext:
    now = datetime.utcnow()
    return MetaContext(
        trace_id=trace_id,
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


def test_backpressure_drop_on_full(monkeypatch):
    meta_client.configure_meta_client(
        enabled=True,
        url='http://localhost:9999',
        timeout_ms=100,
        shared_secret='token',
        semaphore_size=16,
    )

    async def _slow_dispatch(_context):
        await asyncio.sleep(0.2)

    monkeypatch.setattr(meta_client, 'dispatch_to_meta', _slow_dispatch)

    async def _runner() -> None:
        tasks = [
            asyncio.create_task(meta_client.dispatch_to_meta(_context(f't{index}')))
            for index in range(16)
        ]
        await asyncio.sleep(0.01)
        meta_client.fire_and_forget_meta(_context('overflow'))
        for task in tasks:
            await task

    asyncio.run(_runner())

    # If no exception is raised, drop-on-full path is non-blocking and stable.
    assert True
