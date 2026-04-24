"""Trace context propagation utilities."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Mapping
from uuid import uuid4


@dataclass
class TraceContext:
    trace_id: str
    session_id: str
    step_id: str
    parent_step: str | None
    last_event_id: str | None = None
    step_index: int = -1


_trace_context: ContextVar[TraceContext | None] = ContextVar("trace_context", default=None)


def _new_id() -> str:
    return str(uuid4())


def initialize_trace_context(
    headers: Mapping[str, str] | None = None,
    session_hint: str | None = None,
) -> TraceContext:
    """Initialize or refresh trace context from inbound metadata."""

    headers = headers or {}
    existing = _trace_context.get()
    trace_id = headers.get("x-trace-id") or (existing.trace_id if existing else _new_id())
    session_id = headers.get("x-session-id") or session_hint or (
        existing.session_id if existing else _new_id()
    )
    parent_step = headers.get("x-parent-step") or (existing.step_id if existing else None)
    step_id = headers.get("x-step-id") or _new_id()

    ctx = TraceContext(
        trace_id=trace_id,
        session_id=session_id,
        step_id=step_id,
        parent_step=parent_step,
        last_event_id=existing.last_event_id if existing else None,
        step_index=int(headers.get("x-step-index", existing.step_index if existing else -1)),
    )
    _trace_context.set(ctx)
    return ctx


def get_trace_context() -> TraceContext:
    """Return the current context, generating one if absent."""

    context = _trace_context.get()
    if context is None:
        context = initialize_trace_context()
    return context


def begin_operation_step(step_name: str) -> TraceContext:
    """Advance to a new step while preserving lineage."""

    current = get_trace_context()
    next_ctx = TraceContext(
        trace_id=current.trace_id,
        session_id=current.session_id,
        step_id=_new_id(),
        parent_step=current.step_id,
        last_event_id=current.last_event_id,
        step_index=current.step_index,
    )
    _trace_context.set(next_ctx)
    return next_ctx


def register_event_in_trace(event_id: str) -> None:
    """Update context with the most recent event id for NEXT relationships."""

    current = get_trace_context()
    current.last_event_id = event_id
    current.step_index += 1
    _trace_context.set(current)
