from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.settings import Settings
from app.services.metrics import meta_auth_rejections_total, meta_rate_limit_rejections_total


class PayloadSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_body_bytes: int):
        super().__init__(app)
        self.max_body_bytes = max_body_bytes

    async def dispatch(self, request: Request, call_next: Callable):
        if request.url.path != '/analyze' or request.method != 'POST':
            return await call_next(request)

        content_length = request.headers.get('content-length')
        if content_length and int(content_length) > self.max_body_bytes:
            return JSONResponse(status_code=413, content={'detail': 'Payload Too Large'})

        body = await request.body()
        if len(body) > self.max_body_bytes:
            return JSONResponse(status_code=413, content={'detail': 'Payload Too Large'})

        request._body = body
        return await call_next(request)


class LocalRateLimiter:
    def __init__(self, requests_per_second: int = 10):
        self.requests_per_second = requests_per_second
        self._buckets: dict[str, deque[datetime]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = datetime.utcnow()
        bucket = self._buckets[key]
        cutoff = now - timedelta(seconds=1)

        while bucket and bucket[0] < cutoff:
            bucket.popleft()

        if len(bucket) >= self.requests_per_second:
            meta_rate_limit_rejections_total.inc()
            return False

        bucket.append(now)
        return True


def parse_rate_limit(rate_limit_per_ip: str) -> int:
    amount, _, period = rate_limit_per_ip.partition('/')
    if period.strip().lower() != 'second':
        return 10
    try:
        return max(1, int(amount))
    except ValueError:
        return 10


def is_trusted_request(request: Request, settings: Settings) -> bool:
    token = request.headers.get('X-Meta-Token')
    if token and settings.META_SHARED_SECRET and token == settings.META_SHARED_SECRET:
        return True
    return False


def enforce_auth(request: Request, settings: Settings) -> bool:
    if not settings.META_REQUIRE_AUTH_IN_PROD:
        return True
    if is_trusted_request(request, settings):
        return True
    meta_auth_rejections_total.inc()
    return False


def install_middlewares(app: FastAPI, settings: Settings) -> LocalRateLimiter:
    app.add_middleware(PayloadSizeLimitMiddleware, max_body_bytes=settings.MAX_ANALYZE_BODY_BYTES)
    return LocalRateLimiter(requests_per_second=parse_rate_limit(settings.RATE_LIMIT_PER_IP))
