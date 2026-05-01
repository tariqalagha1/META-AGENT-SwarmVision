from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from .models import DiagnosticReport, UnifiedVerdict

if TYPE_CHECKING:
    from .collector import DiagnosticCollector

# ── Stage weights ─────────────────────────────────────────────────────────────
# Total of all weights = 100.  Stages absent from this map (e.g. trace_linked,
# diagnostic_engine) carry no weight and are excluded from scoring entirely.

_WEIGHTS: dict[str, int] = {
    "input_integrity":                    10,
    "contract_integrity":                 15,
    "fake_success_detection":             20,
    "execution_depth":                    10,
    "trace_authenticity":                 10,
    "execution_consistency":              10,
    "pipeline_step_order":                 5,
    "pipeline_transformation_evidence":    5,
    "pipeline_claim_honesty":              5,
    "record_substance":                    5,
    "lineage_consistency":                 3,
    "deduplication_honesty":               2,
}

_TOTAL_POSSIBLE_WEIGHT: int = 100  # sum of all values in _WEIGHTS

# Partial credit multiplier for "warning" status
_WARNING_CREDIT: float = 0.5

# Verdict thresholds (applied to the 0–100 final_score)
_PASS_THRESHOLD:    float = 80.0
_WARNING_THRESHOLD: float = 60.0

# Module 14 — coverage thresholds
_COVERAGE_PASS:    float = 0.70
_COVERAGE_WARN:    float = 0.40


# ── Primary scorer ────────────────────────────────────────────────────────────

def compute_unified_verdict(report: DiagnosticReport) -> UnifiedVerdict:
    """
    Compute a weighted 0–100 score from a DiagnosticReport.

    Rules
    -----
    • passed  → full stage weight
    • warning → 50 % of stage weight
    • failed  → 0
    • skipped → excluded from both numerator and denominator
    • Stages not in _WEIGHTS are ignored entirely.
    """
    earned_weight: float = 0.0
    effective_weight: int = 0
    issue_stages: list[tuple[int, str, str]] = []  # (weight, name, status)

    stage_map = {s.name: s for s in report.stages}

    for stage_name, weight in _WEIGHTS.items():
        stage = stage_map.get(stage_name)
        if stage is None or stage.status == "skipped":
            continue

        effective_weight += weight

        if stage.status == "passed":
            earned_weight += weight
        elif stage.status == "warning":
            earned_weight += weight * _WARNING_CREDIT
            issue_stages.append((weight, stage_name, "warning"))
        else:  # failed
            issue_stages.append((weight, stage_name, "failed"))

    final_score: float = (
        round((earned_weight / effective_weight) * 100, 2)
        if effective_weight > 0
        else 0.0
    )

    verdict = _apply_verdict_overrides(_score_to_verdict(final_score), stage_map)

    # Top-3 issues: sort by weight descending so highest-impact problems surface first
    issue_stages.sort(key=lambda t: t[0], reverse=True)
    top_issues: list[dict[str, str]] = [
        {
            "stage":  name,
            "status": status,
            "weight": str(weight),
            "reason": _reason_for(stage_map[name]),
        }
        for weight, name, status in issue_stages[:3]
    ]

    return UnifiedVerdict(
        final_score=final_score,
        effective_weight_used=effective_weight,
        verdict=verdict,
        top_issues=top_issues,
    )


# ── Module 14 + 15 — coverage checks (run after primary scoring) ──────────────
#
# These two modules depend on effective_weight_used, which is only known after
# compute_unified_verdict() has run.  They are therefore a second-pass step:
# run_coverage_checks() appends their stages to the collector, then recomputes
# and returns a revised UnifiedVerdict that incorporates them.

def run_coverage_checks(
    collector: DiagnosticCollector,
    first_pass: UnifiedVerdict,
    report: DiagnosticReport,
) -> UnifiedVerdict:
    """
    Append diagnostic_coverage (Module 14) and score_validity (Module 15) to
    the collector, then return a recomputed UnifiedVerdict.

    Must be called after compute_unified_verdict() so that effective_weight_used
    and final_score are available.
    """
    _check_diagnostic_coverage(collector, first_pass.effective_weight_used)
    _check_score_validity(collector, first_pass.final_score, first_pass.effective_weight_used)

    # Rebuild the report with the two new stages appended and recompute
    updated_report = report.model_copy(update={"stages": list(collector._stages)})  # noqa: SLF001
    return compute_unified_verdict(updated_report)


# ── Module 14 — Diagnostic Coverage ──────────────────────────────────────────

def _check_diagnostic_coverage(
    collector: DiagnosticCollector,
    effective_weight: int,
) -> None:
    coverage_ratio = round(effective_weight / _TOTAL_POSSIBLE_WEIGHT, 4)

    details = {
        "effective_weight":      effective_weight,
        "total_possible_weight": _TOTAL_POSSIBLE_WEIGHT,
        "coverage_ratio":        coverage_ratio,
    }

    if coverage_ratio >= _COVERAGE_PASS:
        status = "passed"
    elif coverage_ratio >= _COVERAGE_WARN:
        status = "warning"
    else:
        status = "failed"

    collector.add("diagnostic_coverage", status, details)


# ── Module 15 — Score Validity ────────────────────────────────────────────────
#
# A high score is only trustworthy when coverage is also high.  A PASS verdict
# derived from just 30 % of possible weight is structurally misleading — most
# of the system was never evaluated.

def _check_score_validity(
    collector: DiagnosticCollector,
    final_score: float,
    effective_weight: int,
) -> None:
    coverage_ratio = effective_weight / _TOTAL_POSSIBLE_WEIGHT
    score_claims_pass = final_score >= _PASS_THRESHOLD
    coverage_insufficient = coverage_ratio < _COVERAGE_PASS

    details = {
        "final_score":      final_score,
        "coverage_ratio":   round(coverage_ratio, 4),
        "score_claims_pass": score_claims_pass,
        "coverage_sufficient": not coverage_insufficient,
    }

    if score_claims_pass and coverage_insufficient:
        details["reason"] = (
            f"score {final_score} qualifies as PASS but coverage "
            f"{round(coverage_ratio * 100, 1)} % is below the 70 % threshold"
        )
        collector.add("score_validity", "failed", details)
    else:
        collector.add("score_validity", "passed", details)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _score_to_verdict(score: float) -> Literal["PASS", "WARNING", "FAIL"]:
    if score >= _PASS_THRESHOLD:
        return "PASS"
    if score >= _WARNING_THRESHOLD:
        return "WARNING"
    return "FAIL"


def _apply_verdict_overrides(
    verdict: Literal["PASS", "WARNING", "FAIL"],
    stage_map: dict,
) -> Literal["PASS", "WARNING", "FAIL"]:
    """
    Override the score-derived verdict based on coverage integrity signals.

    Override rules (applied in priority order — strongest first):
      1. diagnostic_coverage failed  → FAIL  (not enough of the system was evaluated)
      2. score_validity failed        → WARNING  (high score is structurally untrustworthy)

    Rules 1 and 2 only escalate; they never improve a verdict that is already
    worse (e.g. a FAIL score stays FAIL regardless of coverage status).
    """
    coverage_status = getattr(stage_map.get("diagnostic_coverage"), "status", None)
    validity_status = getattr(stage_map.get("score_validity"),       "status", None)

    # Rule 1 — coverage failure is the hardest constraint
    if coverage_status == "failed":
        return "FAIL"

    # Rule 2 — invalid PASS must be demoted; WARNING/FAIL are already at least as bad
    if validity_status == "failed" and verdict == "PASS":
        return "WARNING"

    return verdict


def _reason_for(stage: object) -> str:
    """Extract a human-readable reason string from a DiagnosticStage."""
    details: dict = getattr(stage, "details", {}) or {}

    if "reason" in details:
        return str(details["reason"])
    if "violations" in details:
        return "; ".join(str(v) for v in details["violations"][:2])
    if "mismatches" in details:
        return "; ".join(str(m) for m in details["mismatches"][:2])
    if "missing_fields" in details and details["missing_fields"]:
        return f"missing fields: {details['missing_fields']}"
    if "missing_keys" in details and details["missing_keys"]:
        return f"missing keys: {details['missing_keys']}"
    if "suspicious_patterns" in details and details["suspicious_patterns"]:
        return f"suspicious patterns: {details['suspicious_patterns']}"
    if "impossible_transitions" in details:
        return "; ".join(str(t) for t in details["impossible_transitions"][:2])
    return stage.status  # fallback: repeat the status
