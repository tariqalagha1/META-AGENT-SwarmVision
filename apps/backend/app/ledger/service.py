"""Lightweight in-memory ledger service for Sprint 1 provenance sequencing."""

from __future__ import annotations

from collections import defaultdict
from threading import Lock
from typing import Any

from app.ledger.schema import (
    LedgerEventEnvelope,
    PersistenceStatus,
    SourceType,
    TrustLevel,
)


class LedgerService:
    """Assign per-trace sequence numbers and attach provenance metadata."""

    def __init__(self) -> None:
        self._sequence_by_trace: dict[str, int] = defaultdict(int)
        self._lock = Lock()

    def next_sequence(self, trace_id: str) -> int:
        with self._lock:
            self._sequence_by_trace[trace_id] += 1
            return self._sequence_by_trace[trace_id]

    def enrich_with_provenance(
        self,
        event: dict[str, Any],
        *,
        trace_id: str,
        source_component: str,
        source_type: SourceType = SourceType.runtime,
        trust_level: TrustLevel = TrustLevel.verified,
        persistence_status: PersistenceStatus = PersistenceStatus.live_unpersisted,
    ) -> dict[str, Any]:
        sequence_no = self.next_sequence(trace_id)
        provenance = {
            "event_id": str(event.get("event_id") or event.get("id") or ""),
            "trace_id": trace_id,
            "sequence_no": sequence_no,
            "source_type": source_type.value,
            "source_component": source_component,
            "trust_level": trust_level.value,
            "persistence_status": persistence_status.value,
            "timestamp": str(event.get("timestamp") or ""),
        }
        enriched = {**event, "provenance": provenance}
        # Validate shape without enforcing storage authority in Sprint 1.
        LedgerEventEnvelope.model_validate(enriched)
        return enriched


ledger_service = LedgerService()
