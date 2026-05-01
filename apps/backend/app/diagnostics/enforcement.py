from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal

from .models import DiagnosticStage, UnifiedVerdict

# ── Configuration ─────────────────────────────────────────────────────────────

EnforcementMode = Literal["off", "soft", "strict"]

# Resolved once at import time; can be overridden in tests by patching
# get_enforcement_mode() or by changing the env var before the first import.
_VALID_MODES: frozenset[str] = frozenset({"off", "soft", "strict"})


def get_enforcement_mode() -> EnforcementMode:
    raw = os.environ.get("DIAGNOSTIC_ENFORCEMENT", "off").strip().lower()
    if raw not in _VALID_MODES:
        return "off"
    return raw  # type: ignore[return-value]


# ── Decision model ────────────────────────────────────────────────────────────

@dataclass
class EnforcementDecision:
    # Whether the original output_data should be replaced with an error payload
    block: bool = False
    # If True (soft mode), append a warning flag to output_data in-place
    warn: bool = False
    # Human-readable reason surfaced in the response
    reason: str = ""
    # Which rule triggered this decision
    trigger: str = ""


# ── Public API ────────────────────────────────────────────────────────────────

def evaluate_enforcement(
    unified: UnifiedVerdict,
    stages: list[DiagnosticStage],
) -> EnforcementDecision:
    """
    Evaluate whether enforcement action is required for this response.

    Enforcement is gated by the DIAGNOSTIC_ENFORCEMENT environment variable:
      off    → always return a no-op decision
      soft   → append a warning flag on FAIL; block on partial-block triggers
      strict → replace output_data with an error payload on FAIL

    Partial-block rule: if fake_success_detection = failed, block regardless
    of mode (except "off").
    """
    mode = get_enforcement_mode()

    if mode == "off":
        return EnforcementDecision()

    stage_map = {s.name: s.status for s in stages}

    # ── Partial-block rule: always fires in soft or strict ─────────────────
    if stage_map.get("fake_success_detection") == "failed":
        return EnforcementDecision(
            block=True,
            reason="fake success detected: output claimed success with empty data",
            trigger="fake_success_detection",
        )

    # ── Verdict-based rules ────────────────────────────────────────────────
    if unified.verdict != "FAIL":
        return EnforcementDecision()

    if mode == "strict":
        return EnforcementDecision(
            block=True,
            reason="diagnostic verdict is FAIL — output suppressed in strict mode",
            trigger="unified_verdict_fail",
        )

    # soft mode
    return EnforcementDecision(
        warn=True,
        reason="System detected unreliable output",
        trigger="unified_verdict_fail",
    )
