from __future__ import annotations

from typing import Awaitable, Callable

DiagnosticEmitter = Callable[[dict], Awaitable[None]]

_diagnostic_emitter: DiagnosticEmitter | None = None


def register_diagnostic_emitter(emitter: DiagnosticEmitter) -> None:
    global _diagnostic_emitter
    _diagnostic_emitter = emitter


async def emit_diagnostic_result(payload: dict) -> None:
    if _diagnostic_emitter is None:
        return
    await _diagnostic_emitter(payload)

