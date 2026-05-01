from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


class DiagnosticStage(BaseModel):
    name: str
    status: Literal["passed", "failed", "skipped", "warning"]
    details: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DiagnosticReport(BaseModel):
    request_id: str
    stages: list[DiagnosticStage]
    score: float = Field(ge=0.0, le=1.0)
    verdict: Literal["PASS", "FAIL"]


class UnifiedVerdict(BaseModel):
    """Weighted 0–100 score computed across all named diagnostic stages."""
    final_score: float = Field(ge=0.0, le=100.0)
    effective_weight_used: int
    verdict: Literal["PASS", "WARNING", "FAIL"]
    top_issues: list[dict[str, str]] = Field(default_factory=list)
