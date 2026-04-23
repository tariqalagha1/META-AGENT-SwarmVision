from __future__ import annotations

from collections import OrderedDict
from datetime import datetime
import hashlib
import json

from app.schemas.insight import MetaInsight


class DedupCache:
    def __init__(self, max_entries: int = 20_000):
        self.max_entries = max_entries
        self._keys: OrderedDict[str, datetime] = OrderedDict()

    def seen(self, dedup_key: str) -> bool:
        if dedup_key in self._keys:
            self._keys.move_to_end(dedup_key)
            self._keys[dedup_key] = datetime.utcnow()
            return True
        self._keys[dedup_key] = datetime.utcnow()
        self._trim()
        return False

    def _trim(self) -> None:
        while len(self._keys) > self.max_entries:
            self._keys.popitem(last=False)


def compute_dedup_key(insight: MetaInsight) -> str:
    payload = {
        'category': insight.category,
        'trace_id': insight.trace_id,
        'agent_id': insight.agent_id,
        'event_ids': sorted(insight.evidence.event_ids),
        'decision_ids': sorted(insight.evidence.decision_ids),
        'anomaly_ids': sorted(insight.evidence.anomaly_ids),
        'window_bucket': insight.metadata.window_start.replace(second=0, microsecond=0).isoformat(),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]
