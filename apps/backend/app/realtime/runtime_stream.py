from __future__ import annotations

from typing import Awaitable, Callable

RuntimeEventEmitter = Callable[[dict], Awaitable[None]]

_runtime_event_emitter: RuntimeEventEmitter | None = None


def register_runtime_event_emitter(emitter: RuntimeEventEmitter) -> None:
    global _runtime_event_emitter
    _runtime_event_emitter = emitter


async def emit_runtime_event(payload: dict) -> None:
    if _runtime_event_emitter is None:
        return
    await _runtime_event_emitter(payload)

