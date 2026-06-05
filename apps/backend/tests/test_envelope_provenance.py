from __future__ import annotations

from app.observability.envelope import enrich_event_payload


def test_enrich_event_payload_adds_provenance():
    enriched = enrich_event_payload(
        {
            "event_type": "AGENT_STEP_STARTED",
            "timestamp": "2026-01-01T00:00:00Z",
            "trace_id": "trace-xyz",
            "source": "swarm-runner",
            "payload": {"step_name": "fetch"},
            "context": {"trace_id": "trace-xyz"},
        }
    )
    assert "provenance" in enriched
    provenance = enriched["provenance"]
    assert provenance["trace_id"] == "trace-xyz"
    assert provenance["source_type"] == "runtime"
    assert "sequence_no" in provenance
