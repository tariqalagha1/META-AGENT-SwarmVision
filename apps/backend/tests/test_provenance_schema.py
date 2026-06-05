from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.ledger.schema import LedgerEventEnvelope


def test_ledger_event_envelope_validates_required_fields():
    payload = {
        "event_id": "evt-1",
        "trace_id": "trace-1",
        "event_type": "SWARM_STARTED",
        "timestamp": "2026-01-01T00:00:00Z",
        "source": "swarm-runner",
        "payload": {},
        "context": {},
        "provenance": {
            "event_id": "evt-1",
            "trace_id": "trace-1",
            "sequence_no": 1,
            "source_type": "runtime",
            "source_component": "swarm_runner",
            "trust_level": "verified",
            "persistence_status": "live_unpersisted",
            "timestamp": "2026-01-01T00:00:00Z",
        },
    }
    envelope = LedgerEventEnvelope.model_validate(payload)
    assert envelope.provenance.sequence_no == 1
    assert envelope.provenance.source_type.value == "runtime"


def test_ledger_event_envelope_rejects_invalid_source_type():
    payload = {
        "event_id": "evt-1",
        "trace_id": "trace-1",
        "event_type": "SWARM_STARTED",
        "timestamp": "2026-01-01T00:00:00Z",
        "source": "swarm-runner",
        "payload": {},
        "context": {},
        "provenance": {
            "event_id": "evt-1",
            "trace_id": "trace-1",
            "sequence_no": 1,
            "source_type": "invalid",
            "source_component": "swarm_runner",
            "trust_level": "verified",
            "persistence_status": "live_unpersisted",
            "timestamp": "2026-01-01T00:00:00Z",
        },
    }
    with pytest.raises(ValidationError):
        LedgerEventEnvelope.model_validate(payload)
