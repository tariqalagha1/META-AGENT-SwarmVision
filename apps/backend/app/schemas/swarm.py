from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class AgentDefinition(BaseModel):
    agent_id: str
    name: str
    role: str
    capabilities: list[str] = Field(default_factory=list)
    status: str = "active"


class SwarmStep(BaseModel):
    agent_id: str
    step_name: str
    input_key: str | None = None
    output_key: str | None = None


class AgentExecutionResult(BaseModel):
    agent_id: str
    step_name: str
    status: Literal["completed", "failed"]
    input: dict[str, Any] = Field(default_factory=dict)
    output: dict[str, Any] | None = None
    error: str | None = None
    started_at: datetime
    completed_at: datetime


class SwarmRunRequest(BaseModel):
    trace_id: str | None = None
    task: str
    steps: list[SwarmStep] | None = None


class SwarmRunResponse(BaseModel):
    trace_id: str
    status: Literal["completed", "failed"]
    steps: list[AgentExecutionResult] = Field(default_factory=list)
    final_output: dict[str, Any] = Field(default_factory=dict)

