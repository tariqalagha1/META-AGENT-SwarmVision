"""Replay and historical topology response schemas."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ReplayAgent(BaseModel):
    id: str
    name: str
    state: str
    x: float
    y: float
    tasks: list[str] = Field(default_factory=list)
    last_action: str
    last_event_time: datetime


class ReplayEdge(BaseModel):
    source: str
    target: str
    last_active: datetime
    count: int


class ReplayEvent(BaseModel):
    id: str
    event_id: Optional[str] = None
    type: str
    event_type: Optional[str] = None
    timestamp: datetime
    source: str
    trace_id: Optional[str] = None
    parent_event_id: Optional[str] = None
    step_index: Optional[int] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)


class ReplayStatusResponse(BaseModel):
    available: bool
    enabled: bool
    message: str
    last_error: Optional[str] = None


class ReplayEventsResponse(BaseModel):
    available: bool
    from_timestamp: datetime
    to_timestamp: datetime
    count: int
    events: list[ReplayEvent]


class ReplayTopologyResponse(BaseModel):
    available: bool
    timestamp: datetime
    event_count: int
    agents: list[ReplayAgent]
    edges: list[ReplayEdge]
    active_handoffs: list[dict[str, Any]] = Field(default_factory=list)


class ReplayRangeResponse(BaseModel):
    available: bool
    from_timestamp: datetime
    to_timestamp: datetime
    count: int
    timeline: list[datetime]
    events: list[ReplayEvent]
    topology: ReplayTopologyResponse
