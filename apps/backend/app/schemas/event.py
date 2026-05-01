"""
Event Schema Definitions

Pydantic models for event validation and serialization.
"""

from pydantic import BaseModel, Field
from pydantic import model_validator
from enum import Enum
from datetime import datetime
from typing import Optional, Any
from uuid import uuid4


class EventType(str, Enum):
    """Enumeration of all possible event types"""
    AGENT_SPAWN = "AGENT_SPAWN"
    AGENT_MOVE = "AGENT_MOVE"
    AGENT_TERMINATION = "AGENT_TERMINATION"
    TASK_START = "TASK_START"
    TASK_HANDOFF = "TASK_HANDOFF"
    TASK_SUCCESS = "TASK_SUCCESS"
    TASK_FAIL = "TASK_FAIL"
    PIPELINE_UPDATE = "PIPELINE_UPDATE"
    HEALTH_CHECK = "HEALTH_CHECK"
    DECISION_POINT = "DECISION_POINT"
    DECISION = "DECISION"
    ANOMALY = "ANOMALY"
    META_INSIGHT = "META_INSIGHT"


class AgentState(str, Enum):
    """Enumeration of agent states"""
    IDLE = "IDLE"
    ACTIVE = "ACTIVE"
    WORKING = "WORKING"
    WAITING = "WAITING"
    ERROR = "ERROR"
    TERMINATED = "TERMINATED"


class TaskState(str, Enum):
    """Enumeration of task states"""
    PENDING = "PENDING"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ABANDONED = "ABANDONED"


class Agent(BaseModel):
    """Agent information"""
    id: str
    name: str
    type: str
    state: AgentState
    metadata: Optional[dict[str, Any]] = None


class Task(BaseModel):
    """Task information"""
    id: str
    name: str
    state: TaskState
    assigned_to: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class Event(BaseModel):
    """Base event model"""
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    id: Optional[str] = None
    event_type: EventType
    type: Optional[EventType] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    agent_id: Optional[str] = None
    trace_id: Optional[str] = None
    session_id: Optional[str] = None
    step_id: Optional[str] = None
    parent_step: Optional[str] = None
    parent_event_id: Optional[str] = None
    step_index: int = 0
    latency_ms: float = 0
    input_ref: Optional[str] = None
    output_ref: Optional[str] = None
    confidence_score: Optional[float] = None
    decision_flag: Optional[str] = None
    source: str
    payload: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _normalize_legacy_fields(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values

        raw_id = values.get("event_id") or values.get("id")
        values["event_id"] = str(raw_id or uuid4())
        values["id"] = values.get("id") or values["event_id"]

        raw_type = values.get("event_type") or values.get("type")
        values["event_type"] = raw_type or EventType.PIPELINE_UPDATE.value
        values["type"] = values.get("type") or values["event_type"]

        payload = values.get("payload", {}) or {}
        values["agent_id"] = (
            values.get("agent_id")
            or payload.get("agent_id")
            or payload.get("source_agent_id")
            or payload.get("target_agent_id")
        )
        values["parent_event_id"] = (
            values.get("parent_event_id")
            or values.get("previous_event_id")
            or (values.get("context", {}) or {}).get("parent_event_id")
            or (values.get("context", {}) or {}).get("previous_event_id")
        )
        values["trace_id"] = (
            values.get("trace_id")
            or (values.get("context", {}) or {}).get("trace_id")
            or str(uuid4())
        )
        if values.get("step_index") is None:
            values["step_index"] = 0
        return values

    @model_validator(mode="after")
    def _sync_alias_fields(self) -> "Event":
        self.id = self.event_id
        self.type = self.event_type
        return self
    
    class Config:
        use_enum_values = True


class AgentSpawnEvent(Event):
    """Event: Agent spawned"""
    event_type: EventType = EventType.AGENT_SPAWN
    agent: Agent


class AgentMoveEvent(Event):
    """Event: Agent moved in pipeline"""
    event_type: EventType = EventType.AGENT_MOVE
    agent: Agent
    from_node: str
    to_node: str


class TaskStartEvent(Event):
    """Event: Task started"""
    event_type: EventType = EventType.TASK_START
    task: Task
    agent_id: str


class TaskHandoffEvent(Event):
    """Event: Task handed off between agents"""
    event_type: EventType = EventType.TASK_HANDOFF
    task: Task
    from_agent: str
    to_agent: str


class TaskSuccessEvent(Event):
    """Event: Task completed successfully"""
    event_type: EventType = EventType.TASK_SUCCESS
    task: Task
    result: Optional[dict[str, Any]] = None


class TaskFailEvent(Event):
    """Event: Task failed"""
    event_type: EventType = EventType.TASK_FAIL
    task: Task
    error: str
    error_details: Optional[dict[str, Any]] = None


class PipelineUpdateEvent(Event):
    """Event: Pipeline flow updated"""
    event_type: EventType = EventType.PIPELINE_UPDATE
    pipeline_state: dict[str, Any]


class HealthCheckEvent(Event):
    """Event: Health check"""
    event_type: EventType = EventType.HEALTH_CHECK
    system_health: dict[str, Any]
