"""Ledger provenance schema models for Sprint 1 foundation."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    runtime = "runtime"
    persisted = "persisted"
    replay = "replay"
    derived = "derived"
    synthetic = "synthetic"
    mock = "mock"


class TrustLevel(str, Enum):
    verified = "verified"
    derived = "derived"
    synthetic = "synthetic"
    mock = "mock"
    unknown = "unknown"


class PersistenceStatus(str, Enum):
    persisted = "persisted"
    live_unpersisted = "live_unpersisted"
    persistence_failed = "persistence_failed"


class ProvenanceFields(BaseModel):
    event_id: str
    trace_id: str
    sequence_no: int = Field(ge=1)
    source_type: SourceType
    source_component: str
    trust_level: TrustLevel
    persistence_status: PersistenceStatus
    timestamp: str


class LedgerEventEnvelope(BaseModel):
    event_id: str
    trace_id: str
    event_type: str
    timestamp: str
    source: str
    payload: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)
    provenance: ProvenanceFields
