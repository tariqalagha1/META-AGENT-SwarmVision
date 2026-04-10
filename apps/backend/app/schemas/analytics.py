"""Analytics response schemas for operational intelligence endpoints."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TimeBucketMetric(BaseModel):
    bucket: datetime
    value: float


class LatencyBucketMetric(BaseModel):
    bucket: datetime
    average_handoff_latency_ms: float = 0
    average_task_completion_time_ms: float = 0


class AnalyticsSummaryMetrics(BaseModel):
    total_events: int
    active_agents: int
    failed_tasks: int
    successful_tasks: int
    average_handoff_latency_ms: float
    peak_concurrent_agents: int
    average_task_completion_time_ms: float


class AnalyticsSummaryResponse(BaseModel):
    available: bool
    from_timestamp: datetime
    to_timestamp: datetime
    metrics: AnalyticsSummaryMetrics


class FailureIncident(BaseModel):
    event_id: str
    timestamp: datetime
    agent_id: Optional[str] = None
    task_id: Optional[str] = None
    suspected_source_node: Optional[str] = None
    upstream_chain: list[str] = Field(default_factory=list)
    related_recent_failures: int = 0
    latency_spike_correlation: bool = False
    message: str = "task failed"


class AnalyticsFailuresResponse(BaseModel):
    available: bool
    from_timestamp: datetime
    to_timestamp: datetime
    total_failures: int
    failures_over_time: list[TimeBucketMetric] = Field(default_factory=list)
    incidents: list[FailureIncident] = Field(default_factory=list)


class AnalyticsLatencyResponse(BaseModel):
    available: bool
    from_timestamp: datetime
    to_timestamp: datetime
    events_per_minute: list[TimeBucketMetric] = Field(default_factory=list)
    latency_over_time: list[LatencyBucketMetric] = Field(default_factory=list)


class BottleneckAgent(BaseModel):
    agent_id: str
    agent_name: str
    severity: str
    categories: list[str] = Field(default_factory=list)
    summary: str
    failure_rate: float = 0
    avg_completion_time_ms: float = 0
    avg_handoff_latency_ms: float = 0
    blocker_count: int = 0
    stuck_task_ids: list[str] = Field(default_factory=list)


class RootCauseCandidate(BaseModel):
    agent_id: str
    severity: str
    summary: str
    upstream_chain: list[str] = Field(default_factory=list)
    recent_failure_count: int = 0
    latency_spike_correlation: bool = False


class AnalyticsBottlenecksResponse(BaseModel):
    available: bool
    from_timestamp: datetime
    to_timestamp: datetime
    agents: list[BottleneckAgent] = Field(default_factory=list)
    suspected_root_causes: list[RootCauseCandidate] = Field(default_factory=list)
