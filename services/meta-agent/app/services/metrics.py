from __future__ import annotations

try:
    from prometheus_client import Counter, Histogram
except ModuleNotFoundError:  # pragma: no cover
    class _NoopMetric:
        def labels(self, **_kwargs):
            return self

        def inc(self, *_args, **_kwargs):
            return None

        def observe(self, *_args, **_kwargs):
            return None

    def Counter(*_args, **_kwargs):  # type: ignore
        return _NoopMetric()

    def Histogram(*_args, **_kwargs):  # type: ignore
        return _NoopMetric()

meta_analyze_requests_total = Counter('meta_analyze_requests_total', 'Analyze requests received')
meta_analyze_duration_seconds = Histogram('meta_analyze_duration_seconds', 'Analyze duration in seconds')
meta_analyze_errors_total = Counter('meta_analyze_errors_total', 'Analyze errors', ['error_type'])
meta_analyze_timeouts_total = Counter('meta_analyze_timeouts_total', 'Analyze timeouts')
meta_insights_emitted_total = Counter(
    'meta_insights_emitted_total',
    'Insights emitted',
    ['category', 'severity'],
)
meta_insights_deduped_total = Counter('meta_insights_deduped_total', 'Insights deduped')
meta_context_truncation_total = Counter('meta_context_truncation_total', 'Context truncation input count')
meta_rate_limit_rejections_total = Counter('meta_rate_limit_rejections_total', 'Rate limit rejections')
meta_auth_rejections_total = Counter('meta_auth_rejections_total', 'Auth rejections')
