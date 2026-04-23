from __future__ import annotations

from app.api.middleware import LocalRateLimiter


def test_rate_limiter_enforces_backpressure():
    limiter = LocalRateLimiter(requests_per_second=10)
    allowed = 0
    denied = 0

    for _ in range(1000):
        if limiter.allow('127.0.0.1'):
            allowed += 1
        else:
            denied += 1

    assert allowed <= 10
    assert denied >= 990
