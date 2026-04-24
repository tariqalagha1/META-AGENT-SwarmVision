"""Runtime settings for SwarmVision backend services."""

from functools import lru_cache
import os

from pydantic import BaseModel

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - optional convenience only
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()


class Settings(BaseModel):
    """Application configuration loaded from environment variables."""

    neo4j_enabled: bool = os.getenv("NEO4J_ENABLED", "true").lower() == "true"
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_username: str = os.getenv("NEO4J_USERNAME", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "password")
    neo4j_database: str = os.getenv("NEO4J_DATABASE", "neo4j")
    neo4j_connect_timeout: float = float(os.getenv("NEO4J_CONNECT_TIMEOUT", "3"))
    replay_default_window_minutes: int = int(
        os.getenv("REPLAY_DEFAULT_WINDOW_MINUTES", "60")
    )
    pulse_interval_seconds: float = float(os.getenv("PULSE_INTERVAL_SECONDS", "2"))
    pulse_min_interval_seconds: float = float(
        os.getenv("PULSE_MIN_INTERVAL_SECONDS", "0.1")
    )
    analytics_failure_lookback_minutes: int = int(
        os.getenv("ANALYTICS_FAILURE_LOOKBACK_MINUTES", "15")
    )
    analytics_latency_window_minutes: int = int(
        os.getenv("ANALYTICS_LATENCY_WINDOW_MINUTES", "10")
    )
    analytics_stuck_task_minutes: int = int(
        os.getenv("ANALYTICS_STUCK_TASK_MINUTES", "5")
    )
    analytics_latency_spike_absolute_ms: int = int(
        os.getenv("ANALYTICS_LATENCY_SPIKE_ABSOLUTE_MS", "300000")
    )
    analytics_latency_spike_ratio: float = float(
        os.getenv("ANALYTICS_LATENCY_SPIKE_RATIO", "1.25")
    )
    analytics_slow_completion_ratio: float = float(
        os.getenv("ANALYTICS_SLOW_COMPLETION_RATIO", "1.5")
    )
    analytics_failure_rate_threshold: float = float(
        os.getenv("ANALYTICS_FAILURE_RATE_THRESHOLD", "0.35")
    )
    analytics_handoff_latency_ratio: float = float(
        os.getenv("ANALYTICS_HANDOFF_LATENCY_RATIO", "1.5")
    )
    analytics_root_cause_latency_ratio: float = float(
        os.getenv("ANALYTICS_ROOT_CAUSE_LATENCY_RATIO", "1.25")
    )
    realtime_metrics_interval_seconds: float = float(
        os.getenv("REALTIME_METRICS_INTERVAL_SECONDS", "2")
    )
    anomaly_latency_multiplier: float = float(
        os.getenv("ANOMALY_LATENCY_MULTIPLIER", "1.5")
    )
    anomaly_failure_rate_threshold: float = float(
        os.getenv("ANOMALY_FAILURE_RATE_THRESHOLD", "0.1")
    )
    redis_enabled: bool = os.getenv("REDIS_ENABLED", "false").lower() == "true"
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    meta_agent_enabled: bool = os.getenv("META_AGENT_ENABLED", "false").lower() == "true"
    meta_agent_url: str = os.getenv("META_AGENT_URL", "http://meta-agent:9001")
    meta_agent_timeout_ms: int = int(os.getenv("META_AGENT_TIMEOUT_MS", "1000"))
    meta_shared_secret: str | None = os.getenv("META_SHARED_SECRET")
    meta_dispatch_semaphore_size: int = int(
        os.getenv("META_DISPATCH_SEMAPHORE_SIZE", "16")
    )


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings."""

    return Settings()
