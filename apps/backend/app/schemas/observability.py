"""Schemas for real-time observability endpoints."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TraceEventItem(BaseModel):
    event_id: str
    event_type: str
    timestamp: datetime
    step_index: int = 0
    parent_event_id: str | None = None
    agent_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class TracePathResponse(BaseModel):
    trace_id: str
    count: int
    events: list[TraceEventItem] = Field(default_factory=list)


class AgentMetricResponse(BaseModel):
    agent_id: str
    latency_avg: float
    failure_rate: float
    throughput: int
    is_bottleneck: bool
    state: str
    last_seen: datetime | None = None


class AnomalyResponseItem(BaseModel):
    event_id: str
    timestamp: datetime
    type: str
    severity: str
    agent_id: str | None = None
    trace_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class AnomalyListResponse(BaseModel):
    count: int
    anomalies: list[AnomalyResponseItem] = Field(default_factory=list)
