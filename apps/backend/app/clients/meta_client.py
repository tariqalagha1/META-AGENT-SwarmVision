from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from datetime import datetime
from importlib import import_module
from importlib.util import find_spec
import logging
from typing import Awaitable, Callable, Sequence

import httpx
_prometheus = find_spec('prometheus_client')
if _prometheus is not None:
    Counter = import_module('prometheus_client').Counter
else:  # pragma: no cover
    class _NoopCounter:
        def inc(self, *_args, **_kwargs):
            return None

    def Counter(*_args, **_kwargs):  # type: ignore
        return _NoopCounter()

from app.schemas.meta import MetaContext

logger = logging.getLogger(__name__)

_meta_semaphore = asyncio.Semaphore(16)
meta_inflight_dropped_total = Counter('meta_inflight_dropped_total', 'Dropped meta dispatch due to backpressure')
meta_dispatch_errors_total = Counter('meta_dispatch_errors_total', 'Meta dispatch errors')

_trace_last_dispatch: dict[str, datetime] = {}
_global_dispatch_ticks: deque[datetime] = deque()

META_AGENT_ENABLED = False
META_AGENT_URL = 'http://meta-agent:9001'
META_AGENT_TIMEOUT_MS = 1000
META_SHARED_SECRET: str | None = None
InsightCallback = Callable[[list[dict], MetaContext], Awaitable[None] | None]


def configure_meta_client(
    *,
    enabled: bool,
    url: str,
    timeout_ms: int,
    shared_secret: str | None,
    semaphore_size: int,
) -> None:
    global META_AGENT_ENABLED, META_AGENT_URL, META_AGENT_TIMEOUT_MS, META_SHARED_SECRET, _meta_semaphore
    META_AGENT_ENABLED = enabled
    META_AGENT_URL = url
    META_AGENT_TIMEOUT_MS = timeout_ms
    META_SHARED_SECRET = shared_secret
    _meta_semaphore = asyncio.Semaphore(semaphore_size)


def _passes_debounce(context: MetaContext) -> bool:
    now = datetime.utcnow()

    cutoff = now.timestamp() - 1.0
    while _global_dispatch_ticks and _global_dispatch_ticks[0].timestamp() < cutoff:
        _global_dispatch_ticks.popleft()

    if len(_global_dispatch_ticks) >= 50:
        logger.debug('meta dispatch dropped: global rate limit exceeded')
        meta_inflight_dropped_total.inc()
        return False

    if context.trace_id:
        previous = _trace_last_dispatch.get(context.trace_id)
        if previous and (now - previous).total_seconds() < 2:
            logger.debug('meta dispatch dropped: trace debounce active')
            meta_inflight_dropped_total.inc()
            return False
        _trace_last_dispatch[context.trace_id] = now

    _global_dispatch_ticks.append(now)
    return True


async def dispatch_to_meta(
    context: MetaContext,
    on_insights: InsightCallback | None = None,
) -> list[dict]:
    if not META_AGENT_ENABLED:
        return []
    if not _passes_debounce(context):
        return []

    if _meta_semaphore.locked():
        meta_inflight_dropped_total.inc()
        logger.debug('meta dispatch dropped: semaphore full')
        return []

    async with _meta_semaphore:
        try:
            headers = {}
            if META_SHARED_SECRET:
                headers['X-Meta-Token'] = META_SHARED_SECRET

            timeout_seconds = max(0.05, META_AGENT_TIMEOUT_MS / 1000.0)
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(
                    f'{META_AGENT_URL}/analyze',
                    json=context.model_dump(mode='json'),
                    headers=headers,
                )
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, Sequence):
                    return []
                insights = [item for item in payload if isinstance(item, dict)]
                if on_insights and insights:
                    maybe_coro = on_insights(insights, context)
                    if asyncio.iscoroutine(maybe_coro):
                        await maybe_coro
                return insights
        except Exception as exc:
            meta_dispatch_errors_total.inc()
            logger.debug('meta dispatch failed silently: %s', exc)
            return []


def fire_and_forget_meta(
    context: MetaContext,
    on_insights: InsightCallback | None = None,
) -> None:
    if not META_AGENT_ENABLED:
        return
    try:
        if on_insights is None:
            asyncio.create_task(dispatch_to_meta(context))
        else:
            asyncio.create_task(dispatch_to_meta(context, on_insights=on_insights))
    except RuntimeError as exc:
        logger.debug('meta fire-and-forget skipped: %s', exc)
