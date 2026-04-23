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
        trace_id='trace-iso',
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


def test_timeout_returns_partial_without_exception(monkeypatch):
    settings = Settings(META_REQUIRE_AUTH_IN_PROD=False, ANALYZE_TIMEOUT_MS=80, HEURISTIC_TIMEOUT_MS=80)
    analyzer = Analyzer(settings=settings, thresholds=Thresholds())

    from app.services import analyzer as analyzer_module

    def _slow(*_args, **_kwargs):
        import time

        time.sleep(1.5)
        return []

    monkeypatch.setattr(analyzer_module, 'HEURISTICS', [('SLOW', _slow)])
    insights, timed_out = asyncio.run(analyzer.analyze(_context()))

    assert timed_out is True
    assert insights == []


def test_analyzer_failure_isolation(monkeypatch):
    settings = Settings(META_REQUIRE_AUTH_IN_PROD=False)
    analyzer = Analyzer(settings=settings, thresholds=Thresholds())

    from app.services import analyzer as analyzer_module

    def _boom(*_args, **_kwargs):
        raise RuntimeError('forced')

    monkeypatch.setattr(analyzer_module, 'HEURISTICS', [('FAIL', _boom)])

    insights, timed_out = asyncio.run(analyzer.analyze(_context()))
    assert insights == []
    assert timed_out is False
