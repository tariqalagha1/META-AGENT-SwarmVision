from __future__ import annotations

from typing import Any, Literal

from .models import DiagnosticReport, DiagnosticStage

_PASS_THRESHOLD = 0.8


class DiagnosticCollector:
    def __init__(self) -> None:
        self._stages: list[DiagnosticStage] = []

    def add(
        self,
        name: str,
        status: Literal["passed", "failed", "skipped", "warning"],
        details: dict[str, Any] | None = None,
    ) -> None:
        self._stages.append(
            DiagnosticStage(name=name, status=status, details=details or {})
        )

    def build(self, request_id: str) -> DiagnosticReport:
        # warnings are excluded from both numerator and denominator —
        # they flag concern without altering pass/fail ratio
        scoreable = [s for s in self._stages if s.status not in {"skipped", "warning"}]
        passed = sum(1 for s in scoreable if s.status == "passed")
        total = len(scoreable)
        score = passed / total if total > 0 else 0.0
        verdict = "PASS" if score >= _PASS_THRESHOLD else "FAIL"
        return DiagnosticReport(
            request_id=request_id,
            stages=list(self._stages),
            score=round(score, 4),
            verdict=verdict,
        )
