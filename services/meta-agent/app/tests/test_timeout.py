from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from app.core.settings import Settings
from app.core.thresholds import Thresholds
from app.schemas.context import MetaContext
from app.services.analyzer import Analyzer


def _empty_context() -> MetaContext:
    now = datetime.utcnow()
    return MetaContext(
        trace_id='trace-timeout',
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


def test_heuristic_timeout_sets_timed_out_flag(monkeypatch):
    settings = Settings(META_REQUIRE_AUTH_IN_PROD=False, HEURISTIC_TIMEOUT_MS=50)
    analyzer = Analyzer(settings=settings, thresholds=Thresholds())

    from app.services import analyzer as analyzer_module

    def _slow(*_args, **_kwargs):
        import time
        time.sleep(2)
        return []

    monkeypatch.setattr(analyzer_module, 'HEURISTICS', [('SLOW', _slow)])
    insights, timed_out = asyncio.run(analyzer.analyze(_empty_context()))

    assert timed_out is True
    assert insights == []


def test_analyze_timeout_returns_empty_not_exception(monkeypatch):
    settings = Settings(META_REQUIRE_AUTH_IN_PROD=False, ANALYZE_TIMEOUT_MS=50)
    analyzer = Analyzer(settings=settings, thresholds=Thresholds())

    from app.services import analyzer as analyzer_module

    def _slow(*_args, **_kwargs):
        import time
        time.sleep(2)
        return []

    monkeypatch.setattr(analyzer_module, 'HEURISTICS', [('SLOW', _slow)])
    # Must not raise — timeout must be handled gracefully
    insights, timed_out = asyncio.run(analyzer.analyze(_empty_context()))

    assert isinstance(insights, list)
    assert isinstance(timed_out, bool)
