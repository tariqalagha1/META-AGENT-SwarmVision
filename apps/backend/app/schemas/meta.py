from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class MetaEvent(BaseModel):
    event_id: str
    event_type: str
    timestamp: datetime
    trace_id: str | None = None
    agent_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class MetaDecisionEvent(BaseModel):
    event_id: str
    timestamp: datetime
    trace_id: str | None = None
    agent_id: str | None = None
    decision_flag: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class MetaAnomalyEvent(BaseModel):
    event_id: str
    timestamp: datetime
    trace_id: str | None = None
    agent_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class MetaAgentMetric(BaseModel):
    agent_id: str
    latency_avg: float = 0
    failure_rate: float = 0
    throughput: int = 0
    state: str = 'ACTIVE'


class MetaTraceMetric(BaseModel):
    trace_id: str
    duration_ms: float = 0
    retry_count: int = 0


class MetaMetrics(BaseModel):
    timestamp: datetime
    agents: list[MetaAgentMetric] = Field(default_factory=list, max_length=50)
    traces: list[MetaTraceMetric] = Field(default_factory=list, max_length=50)


class MetaAgentState(BaseModel):
    agent_id: str
    state: str
    last_seen: datetime | None = None


class MetaContext(BaseModel):
    schema_version: str = '1.0'
    trace_id: str | None = None
    events: list[MetaEvent] = Field(default_factory=list)
    decisions: list[MetaDecisionEvent] = Field(default_factory=list)
    anomalies: list[MetaAnomalyEvent] = Field(default_factory=list)
    metrics: MetaMetrics
    agent_states: list[MetaAgentState] = Field(default_factory=list)
    timestamp: datetime
    window_start: datetime
    window_end: datetime
    truncation_applied: bool = False
    trigger: Literal['trace_complete', 'anomaly_detected', 'periodic', 'manual']
