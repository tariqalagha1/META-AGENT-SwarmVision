from __future__ import annotations

from datetime import datetime
from importlib import import_module
from importlib.util import find_spec
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
_prometheus = find_spec('prometheus_client')
if _prometheus is not None:
    prometheus_client = import_module('prometheus_client')
    CONTENT_TYPE_LATEST = prometheus_client.CONTENT_TYPE_LATEST
    generate_latest = prometheus_client.generate_latest
else:  # pragma: no cover
    CONTENT_TYPE_LATEST = 'text/plain; version=0.0.4; charset=utf-8'

    def generate_latest() -> bytes:  # type: ignore
        return b''

from app.api.middleware import LocalRateLimiter, enforce_auth, is_trusted_request
from app.core.settings import Settings
from app.schemas.context import MetaContext
from app.services.analyzer import Analyzer
from app.services.metrics import (
    meta_analyze_duration_seconds,
    meta_analyze_errors_total,
    meta_analyze_requests_total,
    meta_analyze_timeouts_total,
    meta_context_truncation_total,
    meta_insights_deduped_total,
    meta_insights_emitted_total,
)
from app.services.serializer import serialize_insights
from app.services.storage import InsightStore

logger = logging.getLogger(__name__)


def build_router(
    settings: Settings,
    analyzer: Analyzer,
    store: InsightStore,
    rate_limiter: LocalRateLimiter,
) -> APIRouter:
    router = APIRouter()

    @router.post('/analyze')
    async def analyze_context(request: Request, context: MetaContext):
        if not enforce_auth(request, settings):
            raise HTTPException(status_code=401, detail='Missing or invalid X-Meta-Token')

        trusted = is_trusted_request(request, settings)
        if not trusted:
            client_host = request.client.host if request.client else 'unknown'
            if not rate_limiter.allow(client_host):
                raise HTTPException(status_code=429, detail='Rate limit exceeded')

        meta_analyze_requests_total.inc()
        if context.truncation_applied:
            meta_context_truncation_total.inc()

        started = datetime.utcnow()
        try:
            insights, timed_out = await analyzer.analyze(context)
            if timed_out:
                meta_analyze_timeouts_total.inc()
                logger.warning('analyze partial response due to timeout')

            for insight in insights:
                created = store.upsert_insight(insight)
                if not created:
                    meta_insights_deduped_total.inc()
                meta_insights_emitted_total.labels(
                    category=insight.category,
                    severity=insight.severity,
                ).inc()

            elapsed = (datetime.utcnow() - started).total_seconds()
            meta_analyze_duration_seconds.observe(elapsed)
            return serialize_insights(insights)
        except Exception as exc:
            meta_analyze_errors_total.labels(error_type=type(exc).__name__).inc()
            logger.exception('analyze failed')
            raise HTTPException(status_code=500, detail='analysis failed')

    @router.get('/health')
    async def health() -> dict[str, Any]:
        return {
            'status': 'ok',
            'mode': 'passive',
            'schema_version': settings.SCHEMA_VERSION,
        }

    @router.get('/version')
    async def version() -> dict[str, str]:
        return {
            'service': settings.SERVICE_NAME,
            'version': settings.SERVICE_VERSION,
            'schema_version': settings.SCHEMA_VERSION,
        }

    @router.get('/metrics')
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    if settings.META_DEBUG:
        @router.get('/insights/recent')
        async def recent_insights(limit: int = 50) -> list[dict[str, Any]]:
            return store.get_recent(limit=limit)

    return router
