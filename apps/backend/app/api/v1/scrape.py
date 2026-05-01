from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from fastapi import APIRouter

from app.diagnostics import (
    DiagnosticCollector,
    compute_unified_verdict,
    evaluate_enforcement,
    run_coverage_checks,
)
from app.observability import get_trace_context
from app.schemas.scrape import (
    DiagnosticResult,
    EnforcementWarning,
    ScrapeRequest,
    ScrapeResponse,
    UnifiedVerdictResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["scrape"])

# ── Constants ────────────────────────────────────────────────────────────────

_REQUIRED_INPUT_FIELDS: tuple[str, ...] = ("query", "fields", "location")
_PLACEHOLDER_VALUES: frozenset[str] = frozenset({"", "test", "123", "!!!"})
_SUCCESS_STATUSES: frozenset[str] = frozenset({"success", "ok"})
_REQUIRED_OUTPUT_KEYS: dict[str, type] = {
    "status": str,
    "data": list,
    "total": int,
    "quality": dict,
    "errors": list,
    "request_id": str,
}
_EXECUTION_STAGE_KEYWORDS: frozenset[str] = frozenset({"execution", "pipeline", "agent"})
_MIN_TRACE_DEPTH: int = 3

# Modules 16–17 — cross-request consistency store
# Maps stable_hash(input_data) → ResponseSnapshot from the previous call.
# Process-scoped; resets on restart.  Thread-safe because FastAPI runs each
# request on the async event loop (single-threaded per coroutine).
_response_snapshots: dict[str, "_ResponseSnapshot"] = {}

# Thresholds for response_stability (Module 17)
_STABILITY_FAIL_RATIO:    float = 5.0   # current/previous or previous/current > 5×  → fail
_STABILITY_WARN_RATIO:    float = 2.0   # ratio > 2×                                  → warning

# Module 6 — stage names that are suspiciously generic (exact lowercase match)
_GENERIC_STAGE_VALUES: frozenset[str] = frozenset({"execution", "pipeline", "done", "start", "end", "step"})
# Ratio of generic stages that tips the verdict to "failed" (> 50 % → fake)
_GENERIC_FAIL_RATIO: float = 0.5

# Modules 8–10 — pipeline phase taxonomy
# Each entry is (canonical_phase_name, set_of_accepted_keywords).
# Order is significant: this list defines the expected execution sequence.
_PIPELINE_PHASES: tuple[tuple[str, frozenset[str]], ...] = (
    ("scrape",       frozenset({"scrape", "fetch", "collect", "extract"})),
    ("normalize",    frozenset({"normalize", "normalise", "clean", "sanitize"})),
    ("deduplicate",  frozenset({"deduplicate", "dedupe", "unique"})),
    ("quality",      frozenset({"quality", "score", "validate"})),
)
# How many detected phases constitute a "pass" vs "warning"
_PHASE_PASS_MIN: int = 3
_PHASE_WARN_MIN: int = 2
# Keys expected in output_data for transformation evidence (Module 9)
_SNAPSHOT_KEYS: tuple[str, ...] = ("raw_count", "normalized_count", "deduplicated_count", "final_count")

# Modules 11–13 — record-level lineage
_EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
_PHONE_RE = re.compile(r"[\d\s\-\(\)\+]{7,}")
# Majority threshold: > 50 % invalid records → fail; any invalid → warning
_RECORD_FAIL_RATIO: float = 0.5
_RECORD_WARN_RATIO: float = 0.0
# Module 13: when deduplication is claimed, at least this fraction of raw
# records must actually be duplicates to make the claim credible
_DEDUP_PLAUSIBILITY_RATIO: float = 0.05


# ── Module 1 — Input Integrity ───────────────────────────────────────────────

def _check_input_integrity(collector: DiagnosticCollector, input_data: dict[str, Any]) -> None:
    missing_fields: list[str] = []
    invalid_values: list[dict[str, str]] = []

    for field in _REQUIRED_INPUT_FIELDS:
        value = input_data.get(field)

        if value is None:
            missing_fields.append(field)
            continue

        str_value = str(value).strip()

        if not str_value:
            missing_fields.append(field)
            continue

        if str_value.lower() in _PLACEHOLDER_VALUES or str_value in _PLACEHOLDER_VALUES:
            invalid_values.append({"field": field, "value": str_value, "reason": "placeholder"})
            continue

        # fields must be a non-empty collection when it is a list
        if field == "fields" and isinstance(value, list) and len(value) == 0:
            missing_fields.append(field)

    details = {"missing_fields": missing_fields, "invalid_values": invalid_values}

    if missing_fields or invalid_values:
        status = "failed" if missing_fields else "warning"
    else:
        status = "passed"

    collector.add("input_integrity", status, details)


# ── Module 2 — Contract Integrity ────────────────────────────────────────────

def _check_contract_integrity(collector: DiagnosticCollector, output_data: dict[str, Any]) -> None:
    missing_keys: list[str] = []
    invalid_types: dict[str, str] = {}
    extra_keys: list[str] = []

    for key, expected_type in _REQUIRED_OUTPUT_KEYS.items():
        if key not in output_data:
            missing_keys.append(key)
        elif not isinstance(output_data[key], expected_type):
            actual = type(output_data[key]).__name__
            invalid_types[key] = f"expected {expected_type.__name__}, got {actual}"

    known_keys = set(_REQUIRED_OUTPUT_KEYS)
    extra_keys = [k for k in output_data if k not in known_keys]

    details = {
        "missing_keys": missing_keys,
        "invalid_types": invalid_types,
        "extra_keys": extra_keys,
    }

    if missing_keys or invalid_types:
        status = "failed"
    elif extra_keys:
        status = "warning"
    else:
        status = "passed"

    collector.add("contract_integrity", status, details)


# ── Module 3 — Fake Success Detection ────────────────────────────────────────

def _check_fake_success(collector: DiagnosticCollector, output_data: dict[str, Any]) -> None:
    raw_status = str(output_data.get("status", "")).strip().lower()
    data_field = output_data.get("data")

    is_success_status = raw_status in _SUCCESS_STATUSES
    is_empty_data = data_field is None or (isinstance(data_field, list) and len(data_field) == 0)

    if is_success_status and is_empty_data:
        collector.add(
            "fake_success_detection",
            "failed",
            {"reason": "empty data with success status", "status_value": raw_status},
        )
    else:
        collector.add("fake_success_detection", "passed", {})


# ── Module 4 — Error Consistency ─────────────────────────────────────────────

def _check_error_consistency(collector: DiagnosticCollector, output_data: dict[str, Any]) -> None:
    raw_status = str(output_data.get("status", "")).strip().lower()
    errors = output_data.get("errors")

    has_errors = isinstance(errors, list) and len(errors) > 0
    is_success_status = raw_status in _SUCCESS_STATUSES

    if has_errors and is_success_status:
        collector.add(
            "error_consistency",
            "failed",
            {
                "reason": "errors present but status reports success",
                "status_value": raw_status,
                "error_count": len(errors),
            },
        )
    else:
        collector.add("error_consistency", "passed", {})


# ── Module 5 — Execution Depth ───────────────────────────────────────────────

def _check_execution_depth(
    collector: DiagnosticCollector,
    trace_stages: list[str],
) -> None:
    if not trace_stages:
        collector.add(
            "execution_depth",
            "skipped",
            {"reason": "trace_stages not provided by caller"},
        )
        return

    trace_length = len(trace_stages)
    lowered = [s.lower() for s in trace_stages]
    execution_stage_found = any(
        keyword in stage
        for stage in lowered
        for keyword in _EXECUTION_STAGE_KEYWORDS
    )

    details = {
        "trace_length": trace_length,
        "execution_stage_found": execution_stage_found,
    }

    if trace_length < _MIN_TRACE_DEPTH or not execution_stage_found:
        status = "failed"
    else:
        status = "passed"

    collector.add("execution_depth", status, details)


# ── Module 6 — Trace Authenticity ────────────────────────────────────────────
#
# Heuristic: trace_stages is always client-supplied (request body), so it has
# no inherent authority. We flag it as suspicious when:
#   • every stage name is a bare generic keyword with no qualifying suffix
#     (e.g. "execution" alone vs. "execution:fetch_listings")
#   • the ratio of generic names exceeds _GENERIC_FAIL_RATIO  → failed
#   • any generic names present but ratio is within threshold  → warning
#   • no generic names found                                   → passed

def _check_trace_authenticity(
    collector: DiagnosticCollector,
    trace_stages: list[str],
) -> None:
    if not trace_stages:
        collector.add(
            "trace_authenticity",
            "skipped",
            {"reason": "trace_stages not provided — cannot evaluate authenticity"},
        )
        return

    lowered = [s.strip().lower() for s in trace_stages]
    suspicious: list[str] = [s for s in lowered if s in _GENERIC_STAGE_VALUES]
    generic_ratio = len(suspicious) / len(lowered)

    details: dict[str, Any] = {
        "source": "client",  # trace_stages always originates from the request body
        "suspicious_patterns": suspicious,
        "generic_ratio": round(generic_ratio, 4),
    }

    if generic_ratio > _GENERIC_FAIL_RATIO:
        status = "failed"
    elif generic_ratio > 0.0:
        status = "warning"
    else:
        status = "passed"

    collector.add("trace_authenticity", status, details)


# ── Module 7 — Execution Consistency ─────────────────────────────────────────
#
# Cross-checks that the trace_stages claim is coherent with the actual output:
#   • "pipeline" in trace  → output data must be non-empty (transformation happened)
#   • "execution" in trace → output data must be non-empty (work was done)
# Any mismatch is a hard fail; if no execution/pipeline keyword is present the
# check is irrelevant and marked skipped.

def _check_execution_consistency(
    collector: DiagnosticCollector,
    trace_stages: list[str],
    output_data: dict[str, Any],
) -> None:
    if not trace_stages:
        collector.add(
            "execution_consistency",
            "skipped",
            {"reason": "trace_stages not provided — cannot evaluate consistency"},
        )
        return

    lowered = [s.strip().lower() for s in trace_stages]
    claims_pipeline = any("pipeline" in s for s in lowered)
    claims_execution = any("execution" in s for s in lowered)

    if not claims_pipeline and not claims_execution:
        collector.add(
            "execution_consistency",
            "skipped",
            {"reason": "no pipeline/execution stage claimed — nothing to verify"},
        )
        return

    data_field = output_data.get("data")
    data_is_empty = not isinstance(data_field, list) or len(data_field) == 0

    mismatches: list[str] = []
    if claims_pipeline and data_is_empty:
        mismatches.append("trace claims 'pipeline' but output data is empty")
    if claims_execution and data_is_empty:
        mismatches.append("trace claims 'execution' but output data is empty")

    details: dict[str, Any] = {
        "claims_pipeline": claims_pipeline,
        "claims_execution": claims_execution,
        "data_is_empty": data_is_empty,
        "mismatches": mismatches,
    }

    collector.add(
        "execution_consistency",
        "failed" if mismatches else "passed",
        details,
    )


# ── Module 8 — Pipeline Step Order ───────────────────────────────────────────
#
# Walks trace_stages in the order they appear and maps each to a canonical
# phase using _PIPELINE_PHASES.  The detected sequence must respect the
# expected left-to-right order; any violation is reported as order_valid=False.

def _detect_phase(stage: str) -> str | None:
    """Return the canonical phase name for a stage label, or None."""
    tok = stage.strip().lower()
    for phase_name, keywords in _PIPELINE_PHASES:
        if any(kw in tok for kw in keywords):
            return phase_name
    return None


def _check_pipeline_step_order(
    collector: DiagnosticCollector,
    trace_stages: list[str],
) -> None:
    if not trace_stages:
        collector.add(
            "pipeline_step_order",
            "skipped",
            {"reason": "trace_stages not provided — no pipeline to evaluate"},
        )
        return

    phase_order = [name for name, _ in _PIPELINE_PHASES]

    # Build the sequence of phases as they appear in trace_stages (preserving order,
    # deduplicating consecutive repeats so "fetch → fetch → normalize" → [scrape, normalize])
    detected_sequence: list[str] = []
    for stage in trace_stages:
        phase = _detect_phase(stage)
        if phase and (not detected_sequence or detected_sequence[-1] != phase):
            detected_sequence.append(phase)

    detected_set = list(dict.fromkeys(detected_sequence))  # stable unique
    missing = [p for p in phase_order if p not in detected_set]

    # Order is valid when the relative order of detected phases matches their
    # canonical index positions (no phase appears before a phase with a lower index).
    order_valid = True
    last_idx = -1
    for phase in detected_sequence:
        idx = phase_order.index(phase)
        if idx < last_idx:
            order_valid = False
            break
        last_idx = idx

    details: dict[str, Any] = {
        "detected_phases": detected_set,
        "missing_phases": missing,
        "order_valid": order_valid,
    }

    n_detected = len(detected_set)
    if n_detected == 0:
        status = "skipped"
    elif n_detected >= _PHASE_PASS_MIN and order_valid:
        status = "passed"
    elif n_detected >= _PHASE_WARN_MIN and order_valid:
        status = "warning"
    elif not order_valid:
        status = "failed"
    else:
        status = "warning"

    collector.add("pipeline_step_order", status, details)


# ── Module 9 — Pipeline Transformation Evidence ───────────────────────────────
#
# Looks for numeric snapshot keys in output_data that a real pipeline would
# populate at each stage.  Validates that the counts are logically coherent:
#   deduplicated_count ≤ normalized_count ≤ raw_count (dedup can only shrink data)
#   final_count ≤ deduplicated_count (quality filtering can only shrink data)

def _check_pipeline_transformation_evidence(
    collector: DiagnosticCollector,
    trace_stages: list[str],
    output_data: dict[str, Any],
) -> None:
    # Determine whether any pipeline phase was claimed
    pipeline_claimed = any(
        _detect_phase(s) is not None for s in trace_stages
    ) if trace_stages else False

    if not pipeline_claimed:
        collector.add(
            "pipeline_transformation_evidence",
            "skipped",
            {"reason": "no pipeline stages claimed — snapshot check irrelevant"},
        )
        return

    raw          = output_data.get("raw_count")
    normalised   = output_data.get("normalized_count")
    deduped      = output_data.get("deduplicated_count")
    final        = output_data.get("final_count")

    evidence_found = any(v is not None for v in (raw, normalised, deduped, final))

    details: dict[str, Any] = {
        "raw_count":           raw,
        "normalized_count":    normalised,
        "deduplicated_count":  deduped,
        "final_count":         final,
        "evidence_found":      evidence_found,
    }

    if not evidence_found:
        collector.add("pipeline_transformation_evidence", "warning", details)
        return

    # Validate coherence only for counts that are actually present
    impossible: list[str] = []
    if raw is not None and normalised is not None and normalised > raw:
        impossible.append("normalized_count > raw_count")
    if normalised is not None and deduped is not None and deduped > normalised:
        impossible.append("deduplicated_count > normalized_count")
    if raw is not None and deduped is not None and deduped > raw:
        impossible.append("deduplicated_count > raw_count")
    if deduped is not None and final is not None and final > deduped:
        impossible.append("final_count > deduplicated_count")

    if impossible:
        details["impossible_transitions"] = impossible
        collector.add("pipeline_transformation_evidence", "failed", details)
    else:
        collector.add("pipeline_transformation_evidence", "passed", details)


# ── Module 10 — Pipeline Claim Honesty ────────────────────────────────────────
#
# Aggregates signals from Modules 8 and 9: if the trace claims a pipeline ran
# but neither phase structure nor transformation evidence supports that claim,
# the response is dishonest about what actually happened.
#
# Rather than re-running the checks, this module reads the already-added stages
# from the collector.  It accesses them by name after the earlier modules have run.

def _check_pipeline_claim_honesty(
    collector: DiagnosticCollector,
    trace_stages: list[str],
    output_data: dict[str, Any],
) -> None:
    # Does the trace even mention a pipeline?
    pipeline_claimed = any(
        "pipeline" in s.strip().lower() for s in trace_stages
    ) if trace_stages else False

    if not pipeline_claimed:
        collector.add(
            "pipeline_claim_honesty",
            "skipped",
            {"reason": "no pipeline claim in trace_stages — nothing to audit"},
        )
        return

    # Read verdicts from stages already recorded by Modules 8 and 9
    stage_map: dict[str, str] = {
        s.name: s.status for s in collector._stages  # noqa: SLF001
    }
    order_status    = stage_map.get("pipeline_step_order", "skipped")
    evidence_status = stage_map.get("pipeline_transformation_evidence", "skipped")

    data_field = output_data.get("data")
    data_is_empty = not isinstance(data_field, list) or len(data_field) == 0

    has_phase_structure  = order_status in {"passed", "warning"}
    has_evidence         = evidence_status == "passed"
    has_data             = not data_is_empty

    evidence_count = sum([has_phase_structure, has_evidence, has_data])

    details: dict[str, Any] = {
        "pipeline_claimed":    True,
        "has_phase_structure": has_phase_structure,
        "has_evidence":        has_evidence,
        "has_data":            has_data,
    }

    if evidence_count == 0:
        status = "failed"
    elif evidence_count < 3:
        status = "warning"
    else:
        status = "passed"

    collector.add("pipeline_claim_honesty", status, details)


# ── Module 11 — Record Substance Validation ───────────────────────────────────
#
# Iterates every record in output_data["data"] and checks whether it contains
# at least one meaningful field value (non-empty name, valid e-mail, or valid
# phone).  Also counts structurally identical records (duplicate patterns) as
# a signal of synthetic data generation.

@dataclass(frozen=True)
class _ResponseSnapshot:
    """Stable, hashable summary of an output_data payload for cross-call comparison."""
    data_length: int
    first_record_keys: str   # sorted, comma-joined key names of first record (or "")
    data_hash: str           # SHA-256 of the full data list


def _build_snapshot(output_data: dict[str, Any]) -> _ResponseSnapshot:
    records = output_data.get("data")
    if not isinstance(records, list):
        records = []
    data_length = len(records)
    first_keys = ",".join(sorted(records[0].keys())) if records and isinstance(records[0], dict) else ""
    data_hash = hashlib.sha256(
        json.dumps(records, sort_keys=True, default=str).encode()
    ).hexdigest()
    return _ResponseSnapshot(
        data_length=data_length,
        first_record_keys=first_keys,
        data_hash=data_hash,
    )


def _snapshot_signature(snap: _ResponseSnapshot) -> str:
    return f"{snap.data_length}|{snap.first_record_keys}|{snap.data_hash[:16]}"


def _stable_hash(obj: Any) -> str:
    serialised = json.dumps(obj, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode()).hexdigest()


def _record_has_substance(record: Any) -> bool:
    if not isinstance(record, dict) or not record:
        return False
    name  = str(record.get("name",  "")).strip()
    email = str(record.get("email", "")).strip()
    phone = str(record.get("phone", "")).strip()
    return bool(name) or bool(_EMAIL_RE.fullmatch(email)) or bool(_PHONE_RE.fullmatch(phone))


def _check_record_substance(
    collector: DiagnosticCollector,
    output_data: dict[str, Any],
) -> None:
    records = output_data.get("data")

    if not isinstance(records, list) or len(records) == 0:
        collector.add(
            "record_substance",
            "skipped",
            {"reason": "data field absent or empty — nothing to validate"},
        )
        return

    total   = len(records)
    invalid = sum(1 for r in records if not _record_has_substance(r))

    # Duplicate-pattern detection: serialise each record to a stable key and
    # count how many keys appear more than once.
    seen: dict[str, int] = {}
    for r in records:
        key = json.dumps(r, sort_keys=True, default=str)
        seen[key] = seen.get(key, 0) + 1
    duplicate_patterns = sum(1 for count in seen.values() if count > 1)

    invalid_ratio = invalid / total

    details: dict[str, Any] = {
        "invalid_records":    invalid,
        "total_records":      total,
        "duplicate_patterns": duplicate_patterns,
    }

    if invalid_ratio > _RECORD_FAIL_RATIO:
        status = "failed"
    elif invalid_ratio > _RECORD_WARN_RATIO or duplicate_patterns > 0:
        status = "warning"
    else:
        status = "passed"

    collector.add("record_substance", status, details)


# ── Module 12 — Data Lineage Consistency ──────────────────────────────────────
#
# Validates the numeric transformation chain when all four snapshot counts are
# present.  Two rules:
#   1. raw ≥ normalized ≥ deduplicated ≥ final_count  (each step shrinks or keeps)
#   2. final_count must equal len(output_data["data"])

def _check_lineage_consistency(
    collector: DiagnosticCollector,
    output_data: dict[str, Any],
) -> None:
    raw        = output_data.get("raw_count")
    normalised = output_data.get("normalized_count")
    deduped    = output_data.get("deduplicated_count")
    final      = output_data.get("final_count")

    counts_present = [v for v in (raw, normalised, deduped, final) if v is not None]

    if len(counts_present) < 2:
        collector.add(
            "lineage_consistency",
            "skipped",
            {"reason": "fewer than two snapshot counts present — chain cannot be verified"},
        )
        return

    violations: list[str] = []

    # Rule 1: monotone non-increasing along the chain
    pairs = [
        (raw, normalised,  "raw_count >= normalized_count"),
        (normalised, deduped, "normalized_count >= deduplicated_count"),
        (deduped, final,   "deduplicated_count >= final_count"),
        (raw, deduped,     "raw_count >= deduplicated_count"),
        (raw, final,       "raw_count >= final_count"),
    ]
    for left, right, label in pairs:
        if left is not None and right is not None and right > left:
            violations.append(f"violated: {label} (got {right} > {left})")

    # Rule 2: final_count must match actual record list length
    data_field = output_data.get("data")
    actual_len = len(data_field) if isinstance(data_field, list) else None
    final_matches_data: bool | None = None
    if final is not None and actual_len is not None:
        final_matches_data = (final == actual_len)
        if not final_matches_data:
            violations.append(
                f"final_count ({final}) != len(data) ({actual_len})"
            )

    counts_valid = len(violations) == 0

    details: dict[str, Any] = {
        "counts_valid":       counts_valid,
        "final_matches_data": final_matches_data,
    }
    if violations:
        details["violations"] = violations

    if not counts_valid:
        status = "failed"
    elif final_matches_data is None:
        # counts are valid but we can't verify the final↔data match
        status = "warning"
    else:
        status = "passed"

    collector.add("lineage_consistency", status, details)


# ── Module 13 — Deduplication Honesty ─────────────────────────────────────────
#
# Cross-checks the deduplication claim against actual record-level evidence.
#
# If deduplicated_count < raw_count the pipeline claims it removed duplicates.
# We verify plausibility in two ways:
#   a) The duplicate_patterns count from Module 11 (already in the collector)
#      should be > 0 when deduplication was meaningful.
#   b) If deduplicated_count == raw_count yet the record list contains obvious
#      duplicate patterns, the deduplication step is suspicious (did nothing).
#
# Module 13 reads Module 11's recorded details to avoid recomputing them.

def _check_deduplication_honesty(
    collector: DiagnosticCollector,
    output_data: dict[str, Any],
) -> None:
    raw    = output_data.get("raw_count")
    deduped = output_data.get("deduplicated_count")

    # Need at least raw_count to reason about deduplication claims
    if raw is None or deduped is None:
        collector.add(
            "deduplication_honesty",
            "skipped",
            {"reason": "raw_count or deduplicated_count absent — cannot evaluate deduplication claim"},
        )
        return

    # Retrieve duplicate_patterns recorded by Module 11
    stage_map: dict[str, Any] = {
        s.name: s.details for s in collector._stages  # noqa: SLF001
    }
    substance_details = stage_map.get("record_substance", {})
    duplicate_patterns: int = substance_details.get("duplicate_patterns", 0)

    claimed_removal = raw - deduped          # how many records the pipeline claims it removed
    claimed_dedup   = claimed_removal > 0

    details: dict[str, Any] = {
        "raw_count":           raw,
        "deduplicated_count":  deduped,
        "claimed_removal":     claimed_removal,
        "observed_duplicates": duplicate_patterns,
    }

    if claimed_dedup and duplicate_patterns == 0:
        # Pipeline claims it removed records but we see zero duplicate patterns
        # in the final data — contradictory (duplicates should show before removal,
        # or at minimum the final set should show none were missed).
        # We flag as warning rather than fail because the raw pre-dedup records
        # are not available to us; the absence of duplicates in the final set
        # is expected when deduplication works correctly.
        # We only hard-fail when the removal count is implausibly large relative
        # to raw_count (> 50 %) yet no structural duplicates are visible at all.
        removal_ratio = claimed_removal / raw if raw > 0 else 0.0
        details["removal_ratio"] = round(removal_ratio, 4)
        if removal_ratio > _RECORD_FAIL_RATIO:
            status = "failed"
            details["reason"] = "large deduplication claim with zero observable duplicate patterns"
        else:
            status = "warning"
            details["reason"] = "deduplication claimed but no duplicate patterns observed in output"
    elif not claimed_dedup and duplicate_patterns > 0:
        # Pipeline did NOT claim deduplication but we see duplicate patterns —
        # the data was not cleaned despite obvious repetition.
        status = "warning"
        details["reason"] = "duplicate patterns observed but no deduplication was reported"
    else:
        status = "passed"

    collector.add("deduplication_honesty", status, details)


# ── Module 16 — Response Consistency ─────────────────────────────────────────
#
# Compares the current response signature against the last recorded signature
# for the same input hash.  Identical signatures indicate a possibly static or
# cached response; a complete structural change (schema shift) indicates
# instability.  Small data variation is expected and marked as passed.
#
# Variation levels:
#   none  → data_hash identical (all three sub-fields match)
#   low   → length and keys match but hash differs  (content changed, schema stable)
#   high  → length or keys differ  (structural change)

def _check_response_consistency(
    collector: DiagnosticCollector,
    input_data: dict[str, Any],
    output_data: dict[str, Any],
) -> None:
    input_hash = _stable_hash(input_data)
    current_snap = _build_snapshot(output_data)
    current_sig  = _snapshot_signature(current_snap)

    previous_snap = _response_snapshots.get(input_hash)
    _response_snapshots[input_hash] = current_snap  # always update after reading

    if previous_snap is None:
        collector.add(
            "response_consistency",
            "skipped",
            {"reason": "no previous response recorded for this input"},
        )
        return

    previous_sig = _snapshot_signature(previous_snap)
    is_identical  = previous_snap.data_hash == current_snap.data_hash

    if is_identical:
        variation_level = "none"
    elif (previous_snap.data_length == current_snap.data_length
          and previous_snap.first_record_keys == current_snap.first_record_keys):
        variation_level = "low"
    else:
        variation_level = "high"

    details: dict[str, Any] = {
        "is_identical":        is_identical,
        "previous_signature":  previous_sig,
        "current_signature":   current_sig,
        "variation_level":     variation_level,
    }

    if is_identical:
        status = "failed"
    elif variation_level == "high":
        status = "warning"
    else:
        status = "passed"

    collector.add("response_consistency", status, details)


# ── Module 17 — Response Stability ────────────────────────────────────────────
#
# Compares raw record counts between the current and previous response for the
# same input.  An extreme ratio (> 5×) or a drop to zero from a non-zero prior
# count indicates agent instability or a silent failure.

def _check_response_stability(
    collector: DiagnosticCollector,
    input_data: dict[str, Any],
    output_data: dict[str, Any],
) -> None:
    input_hash = _stable_hash(input_data)

    # Read the snapshot written by Module 16 (already updated)
    current_snap  = _response_snapshots.get(input_hash)
    current_count = current_snap.data_length if current_snap else 0

    # The previous snapshot was overwritten by Module 16; recover it by
    # re-reading the collector's response_consistency stage details.
    stage_map = {s.name: s.details for s in collector._stages}  # noqa: SLF001
    consistency_details = stage_map.get("response_consistency", {})

    if consistency_details.get("reason") == "no previous response recorded for this input":
        collector.add(
            "response_stability",
            "skipped",
            {"reason": "no previous response recorded for this input"},
        )
        return

    # Reconstruct previous_count from the previous signature string "len|keys|hash"
    previous_sig: str = consistency_details.get("previous_signature", "")
    try:
        previous_count = int(previous_sig.split("|")[0])
    except (ValueError, IndexError):
        collector.add(
            "response_stability",
            "skipped",
            {"reason": "could not parse previous_count from signature"},
        )
        return

    details: dict[str, Any] = {
        "previous_count": previous_count,
        "current_count":  current_count,
    }

    # Compute directional ratio — always ≥ 1.0
    if previous_count == 0 and current_count == 0:
        change_ratio = 1.0
    elif previous_count == 0:
        change_ratio = float("inf")
    elif current_count == 0:
        # Drop to zero from a non-zero count is maximally unstable
        change_ratio = float("inf")
    else:
        change_ratio = max(current_count / previous_count, previous_count / current_count)

    details["change_ratio"] = round(change_ratio, 4) if change_ratio != float("inf") else None

    if change_ratio > _STABILITY_FAIL_RATIO or change_ratio == float("inf"):
        status = "failed"
    elif change_ratio > _STABILITY_WARN_RATIO:
        status = "warning"
    else:
        status = "passed"

    collector.add("response_stability", status, details)


# ── Diagnostic Engine ─────────────────────────────────────────────────────────

def _run_diagnostic_engine(
    collector: DiagnosticCollector,
    input_data: dict,
    output_data: dict,
    trace_id: str | None,
    trace_stages: list[str] | None = None,
) -> None:
    # Modules 1–4: output correctness (unchanged)
    _check_input_integrity(collector, input_data)
    _check_contract_integrity(collector, output_data)
    _check_fake_success(collector, output_data)
    _check_error_consistency(collector, output_data)

    # Modules 5–7: execution forensics
    resolved_stages = trace_stages or []
    _check_execution_depth(collector, resolved_stages)
    _check_trace_authenticity(collector, resolved_stages)
    _check_execution_consistency(collector, resolved_stages, output_data)

    # Modules 8–10: pipeline flow validation
    # Order matters — 10 reads verdicts written by 8 and 9.
    _check_pipeline_step_order(collector, resolved_stages)
    _check_pipeline_transformation_evidence(collector, resolved_stages, output_data)
    _check_pipeline_claim_honesty(collector, resolved_stages, output_data)

    # Modules 11–13: data lineage validation
    # 11 must run before 13 — 13 reads duplicate_patterns from 11's details.
    _check_record_substance(collector, output_data)
    _check_lineage_consistency(collector, output_data)
    _check_deduplication_honesty(collector, output_data)

    # Modules 16–17: cross-request consistency and stability
    # 16 must run before 17 — 17 reads the previous_count from 16's recorded details.
    _check_response_consistency(collector, input_data, output_data)
    _check_response_stability(collector, input_data, output_data)

    collector.add(
        "trace_linked",
        "passed" if trace_id else "skipped",
        {"trace_id": trace_id},
    )


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape(request: ScrapeRequest) -> ScrapeResponse:
    # ── 1. Resolve request_id ────────────────────────────────────────────────
    request_id = str(uuid4())

    # ── 2. Capture input_data and resolve trace ──────────────────────────────
    input_data = request.input_data
    trace_id = request.trace_id or get_trace_context().trace_id

    # ── 3. Business logic (placeholder — replace with real call) ────────────
    #   Nothing here is modified. The block below represents wherever the
    #   real scrape logic would run; output_data is whatever it returns.
    output_data: dict = {}
    try:
        # HOOK: call real business logic here, e.g.:
        #   output_data = await some_service.scrape(input_data)
        output_data = {"status": "ok", "received_keys": list(input_data.keys())}
    except Exception as exc:
        logger.error("scrape_business_logic_error request_id=%s error=%s", request_id, exc)
        # business logic failure is surfaced in the diagnostic, not swallowed
        output_data = {}

    # ── 4. Diagnostic collection (observe-only, never blocks response) ───────
    collector = DiagnosticCollector()
    try:
        _run_diagnostic_engine(collector, input_data, output_data, trace_id, trace_stages=request.trace_stages)
    except Exception as exc:
        # diagnostic failure must never affect the caller
        logger.debug("diagnostic_engine_error request_id=%s error=%s", request_id, exc)
        collector.add("diagnostic_engine", "failed", {"error": str(exc)})

    report = collector.build(request_id)
    # First pass: weighted score over modules 1–13.
    # Second pass: append coverage stages (14–15) and recompute with them included.
    first_pass = compute_unified_verdict(report)
    unified = run_coverage_checks(collector, first_pass, report)

    # ── 5. Evaluate enforcement ──────────────────────────────────────────────
    decision = evaluate_enforcement(unified, list(collector._stages))  # noqa: SLF001

    diagnostic_result = DiagnosticResult(
        request_id=report.request_id,
        score=report.score,
        verdict=report.verdict,
        stages=[s.model_dump(mode="json") for s in collector._stages],  # noqa: SLF001
        unified=UnifiedVerdictResult(
            final_score=unified.final_score,
            effective_weight_used=unified.effective_weight_used,
            verdict=unified.verdict,
            top_issues=unified.top_issues,
        ),
    )

    # ── 6. Apply enforcement decision and return ─────────────────────────────
    if decision.block:
        blocked_output: dict = {
            "status": "error",
            "data": [],
            "errors": ["diagnostic_failure"],
            "blocked_by": decision.trigger,
        }
        return ScrapeResponse(
            request_id=request_id,
            output_data=blocked_output,
            trace_id=trace_id,
            diagnostic=diagnostic_result,
        )

    enforcement_warning = (
        EnforcementWarning(message=decision.reason) if decision.warn else None
    )
    return ScrapeResponse(
        request_id=request_id,
        output_data=output_data,
        trace_id=trace_id,
        diagnostic=diagnostic_result,
        enforcement_warning=enforcement_warning,
    )
