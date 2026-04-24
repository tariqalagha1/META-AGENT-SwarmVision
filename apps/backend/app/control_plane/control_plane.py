"""Passive control-plane stub for future meta-agent policy injection."""

from __future__ import annotations

from typing import Any


class ControlPlane:
    """No-op evaluator that preserves current behavior."""

    def evaluate(self, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "action": "ALLOW",
            "modifications": None,
        }
