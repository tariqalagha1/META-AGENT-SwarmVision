from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ScrapeRequest(BaseModel):
    input_data: dict[str, Any] = Field(default_factory=dict)
    trace_id: str | None = None
    # Names of pipeline/agent stages that ran — used by execution_depth check.
    # Optional: callers that don't supply it will receive a "skipped" stage.
    trace_stages: list[str] = Field(default_factory=list)


class UnifiedVerdictResult(BaseModel):
    final_score: float
    effective_weight_used: int
    verdict: str
    top_issues: list[dict[str, str]] = Field(default_factory=list)


class DiagnosticResult(BaseModel):
    request_id: str
    score: float
    verdict: str
    stages: list[dict[str, Any]] = Field(default_factory=list)
    unified: UnifiedVerdictResult | None = None


class EnforcementWarning(BaseModel):
    diagnostic_warning: bool = True
    message: str


class ScrapeResponse(BaseModel):
    request_id: str
    output_data: dict[str, Any] = Field(default_factory=dict)
    trace_id: str | None = None
    diagnostic: DiagnosticResult
    # Populated only when DIAGNOSTIC_ENFORCEMENT=soft and verdict=FAIL
    enforcement_warning: EnforcementWarning | None = None
