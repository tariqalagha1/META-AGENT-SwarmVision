"""Event schema standardization helpers with backward compatibility."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from app.core.settings import get_settings
from app.ledger.schema import PersistenceStatus, SourceType, TrustLevel
from app.ledger.service import ledger_service
from app.observability.trace import get_trace_context


def _coalesce_agent_id(payload: dict[str, Any]) -> str | None:
    return payload.get("agent_id") or payload.get("source_agent_id") or payload.get(
        "target_agent_id"
    )


def enrich_event_payload(event: dict[str, Any]) -> dict[str, Any]:
    """Attach standardized event envelope fields without removing legacy keys."""

    payload = event.get("payload", {}) or {}
    context = event.get("context", {}) or {}
    trace = get_trace_context()

    event_id = str(event.get("event_id") or event.get("id") or uuid4())
    event_type = str(event.get("event_type") or event.get("type") or "PIPELINE_UPDATE")
    timestamp = event.get("timestamp") or datetime.utcnow().isoformat()
    latency_ms = event.get("latency_ms")
    if latency_ms is None:
        latency_ms = payload.get("processing_time_ms", 0)

    step_index = event.get("step_index")
    if step_index is None:
        step_index = trace.step_index + 1

    parent_event_id = event.get("parent_event_id")
    if parent_event_id is None:
        parent_event_id = event.get("previous_event_id") or context.get("previous_event_id") or trace.last_event_id

    enriched = {
        **event,
        "event_id": event_id,
        "id": event_id,
        "event_type": event_type,
        "type": event_type,
        "timestamp": timestamp,
        "agent_id": event.get("agent_id") or _coalesce_agent_id(payload),
        "trace_id": event.get("trace_id") or context.get("trace_id") or trace.trace_id,
        "session_id": event.get("session_id")
        or context.get("session_id")
        or trace.session_id,
        "step_id": event.get("step_id") or context.get("step_id") or trace.step_id,
        "parent_step": event.get("parent_step")
        or context.get("parent_step")
        or trace.parent_step,
        "latency_ms": latency_ms,
        "input_ref": event.get("input_ref") or context.get("input_ref"),
        "output_ref": event.get("output_ref") or context.get("output_ref"),
        "confidence_score": event.get("confidence_score"),
        "decision_flag": event.get("decision_flag"),
        "previous_event_id": event.get("previous_event_id")
        or context.get("previous_event_id")
        or trace.last_event_id,
        "parent_event_id": parent_event_id,
        "step_index": int(step_index),
    }
    enriched["context"] = {
        **context,
        "trace_id": enriched["trace_id"],
        "session_id": enriched["session_id"],
        "step_id": enriched["step_id"],
        "parent_step": enriched["parent_step"],
        "input_ref": enriched.get("input_ref"),
        "output_ref": enriched.get("output_ref"),
        "previous_event_id": enriched.get("previous_event_id"),
        "parent_event_id": enriched.get("parent_event_id"),
        "step_index": enriched.get("step_index"),
    }
    settings = get_settings()
    existing_provenance = enriched.get("provenance")
    if existing_provenance:
        existing_provenance = {
            **existing_provenance,
            "event_id": enriched["event_id"],
            "trace_id": enriched["trace_id"],
            "timestamp": enriched["timestamp"],
        }
        enriched["provenance"] = existing_provenance
        return enriched

    source_name = str(enriched.get("source", "unknown")).lower()
    if source_name in {"viz-mock", "mock", "demo"}:
        source_type = SourceType.mock
        trust_level = TrustLevel.mock
    elif source_name in {"meta-agent"}:
        source_type = SourceType.derived
        trust_level = TrustLevel.derived
    elif source_name in {"system"}:
        source_type = SourceType.derived
        trust_level = TrustLevel.derived
    else:
        source_type = SourceType.runtime
        trust_level = TrustLevel.verified

    if settings.ledger_enabled:
        return ledger_service.enrich_with_provenance(
            enriched,
            trace_id=enriched["trace_id"],
            source_component="observability.enrich_event_payload",
            source_type=source_type,
            trust_level=trust_level,
            persistence_status=PersistenceStatus.live_unpersisted,
        )

    enriched["provenance"] = {
        "event_id": enriched["event_id"],
        "trace_id": enriched["trace_id"],
        "sequence_no": int(enriched.get("step_index", 0)) + 1,
        "source_type": source_type.value,
        "source_component": "observability.enrich_event_payload",
        "trust_level": trust_level.value,
        "persistence_status": PersistenceStatus.live_unpersisted.value,
        "timestamp": enriched["timestamp"],
    }
    return enriched
