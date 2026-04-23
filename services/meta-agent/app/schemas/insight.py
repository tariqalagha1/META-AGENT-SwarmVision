from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class Evidence(BaseModel):
    event_ids: list[str] = Field(default_factory=list, max_length=50)
    decision_ids: list[str] = Field(default_factory=list, max_length=50)
    anomaly_ids: list[str] = Field(default_factory=list, max_length=50)


class InsightMetadata(BaseModel):
    heuristic_name: str
    thresholds_used: dict[str, float] = Field(default_factory=dict)
    window_start: datetime
    window_end: datetime
    truncation_applied: bool = False


class MetaInsight(BaseModel):
    schema_version: str = '1.0'
    insight_id: UUID
    dedup_key: str
    event_type: Literal['META_INSIGHT'] = 'META_INSIGHT'
    timestamp: datetime
    trace_id: str | None = None
    agent_id: str | None = None
    category: Literal[
        'BOTTLENECK',
        'REPEATED_FAILURE',
        'DECISION_PATTERN',
        'ANOMALY_CORRELATION',
        'LOAD_RISK',
        'GENERAL',
    ]
    severity: Literal['LOW', 'MEDIUM', 'HIGH']
    confidence: float = Field(ge=0.0, le=1.0)
    title: str = Field(max_length=120)
    summary: str = Field(max_length=500)
    suggestion: str | None = Field(default=None, max_length=500)
    evidence: Evidence
    metadata: InsightMetadata
