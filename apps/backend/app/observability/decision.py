"""Structured decision-point instrumentation."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from app.observability.trace import get_trace_context


def decision_point(
    name: str,
    decision_input: dict[str, Any] | None,
    decision_output: dict[str, Any] | None,
    reason: str,
) -> dict[str, Any]:
    """Build a structured decision log payload."""

    return {
        "name": name,
        "input": decision_input or {},
        "output": decision_output or {},
        "reason": reason,
        "timestamp": datetime.utcnow().isoformat(),
    }


def build_decision_event(
    name: str,
    decision_input: dict[str, Any] | None,
    decision_output: dict[str, Any] | None,
    reason: str,
    related_event_id: str | None = None,
) -> dict[str, Any]:
    """Create an event-stream compatible decision event."""

    trace = get_trace_context()
    payload = decision_point(name, decision_input, decision_output, reason)
    return {
        "event_id": str(uuid4()),
        "event_type": "DECISION",
        "timestamp": datetime.utcnow().isoformat(),
        "source": "system",
        "agent_id": "orchestrator-observer",
        "trace_id": trace.trace_id,
        "session_id": trace.session_id,
        "step_id": trace.step_id,
        "parent_step": trace.parent_step,
        "latency_ms": 0,
        "input_ref": None,
        "output_ref": None,
        "confidence_score": None,
        "decision_flag": "INSTRUMENTED",
        "payload": {
            "decision_point": name,
            "input": decision_input or {},
            "output": decision_output or {},
            "reason": reason,
            "related_event_id": related_event_id,
        },
        "context": {
            "trace_id": trace.trace_id,
            "session_id": trace.session_id,
            "step_id": trace.step_id,
            "parent_step": trace.parent_step,
            "related_event_id": related_event_id,
        },
    }


async def log_decision(
    name: str,
    input_data: dict[str, Any],
    output_decision: dict[str, Any],
    reason: str,
    trace_id: str,
    emit_event,
) -> None:
    """Emit a decision event in the standardized format."""

    await emit_event(
        {
            "event_type": "DECISION",
            "decision_point": name,
            "input": input_data,
            "output": output_decision,
            "reason": reason,
            "trace_id": trace_id,
            "source": "system",
            "payload": {
                "decision_point": name,
                "input": input_data,
                "output": output_decision,
                "reason": reason,
            },
            "context": {"trace_id": trace_id},
        }
    )
