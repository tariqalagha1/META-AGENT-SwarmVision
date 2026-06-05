from __future__ import annotations

from app.ledger.service import LedgerService


def test_sequence_monotonic_per_trace():
    service = LedgerService()
    assert service.next_sequence("trace-a") == 1
    assert service.next_sequence("trace-a") == 2
    assert service.next_sequence("trace-a") == 3


def test_sequence_independent_across_traces():
    service = LedgerService()
    assert service.next_sequence("trace-a") == 1
    assert service.next_sequence("trace-b") == 1
    assert service.next_sequence("trace-a") == 2
