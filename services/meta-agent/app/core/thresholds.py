from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Thresholds(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='META_', extra='ignore')

    BOTTLENECK_MIN_TRACE_COUNT: int = 3
    BOTTLENECK_LATENCY_P95_MS: int = 2000

    REPEATED_FAILURE_MIN_COUNT: int = 3
    REPEATED_FAILURE_WINDOW_SECONDS: int = 300

    DECISION_PATTERN_MIN_COUNT: int = 3
    DECISION_PATTERN_WINDOW_SECONDS: int = 300

    ANOMALY_SPIKE_RATE_PER_MIN: int = 10
    ANOMALY_CORRELATION_WINDOW_SECONDS: int = 120

    LOAD_THROUGHPUT_THRESHOLD: int = 50
    LOAD_LATENCY_P95_MS: int = 3000
    LOAD_DEGRADED_AGENT_COUNT: int = 2


def thresholds_snapshot(thresholds: Thresholds) -> dict[str, float]:
    data = thresholds.model_dump()
    return {key: float(value) for key, value in data.items()}
