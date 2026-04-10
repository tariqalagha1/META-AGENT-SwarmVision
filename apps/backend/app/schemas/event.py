"""
Event Schema Definitions

Pydantic models for event validation and serialization.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
from typing import Optional, Any


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
    id: str = Field(default_factory=lambda: str(__import__('uuid').uuid4()))
    type: EventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    source: str
    payload: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        use_enum_values = True


class AgentSpawnEvent(Event):
    """Event: Agent spawned"""
    type: EventType = EventType.AGENT_SPAWN
    agent: Agent


class AgentMoveEvent(Event):
    """Event: Agent moved in pipeline"""
    type: EventType = EventType.AGENT_MOVE
    agent: Agent
    from_node: str
    to_node: str


class TaskStartEvent(Event):
    """Event: Task started"""
    type: EventType = EventType.TASK_START
    task: Task
    agent_id: str


class TaskHandoffEvent(Event):
    """Event: Task handed off between agents"""
    type: EventType = EventType.TASK_HANDOFF
    task: Task
    from_agent: str
    to_agent: str


class TaskSuccessEvent(Event):
    """Event: Task completed successfully"""
    type: EventType = EventType.TASK_SUCCESS
    task: Task
    result: Optional[dict[str, Any]] = None


class TaskFailEvent(Event):
    """Event: Task failed"""
    type: EventType = EventType.TASK_FAIL
    task: Task
    error: str
    error_details: Optional[dict[str, Any]] = None


class PipelineUpdateEvent(Event):
    """Event: Pipeline flow updated"""
    type: EventType = EventType.PIPELINE_UPDATE
    pipeline_state: dict[str, Any]


class HealthCheckEvent(Event):
    """Event: Health check"""
    type: EventType = EventType.HEALTH_CHECK
    system_health: dict[str, Any]
