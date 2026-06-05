from __future__ import annotations

import asyncio

from app.core.security import AuthContext
from app.websocket.manager import WebSocketManager


class DummyWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.messages: list[str] = []
        self.headers = {}

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, message: str) -> None:
        self.messages.append(message)


def test_websocket_broadcast_filters_by_tenant():
    async def run_test() -> tuple[list[str], list[str]]:
        manager = WebSocketManager()
        tenant_a = DummyWebSocket()
        tenant_b = DummyWebSocket()

        await manager.connect(
            tenant_a,
            channel="events",
            auth=AuthContext(subject="user-a", role="User", tenant_id="tenant-a"),
        )
        await manager.connect(
            tenant_b,
            channel="events",
            auth=AuthContext(subject="user-b", role="User", tenant_id="tenant-b"),
        )

        tenant_a.messages.clear()
        tenant_b.messages.clear()

        await manager.broadcast(
            {
                "event_type": "TASK_START",
                "context": {"tenant_id": "tenant-a"},
            },
            channel="events",
            tenant_id="tenant-a",
        )

        return tenant_a.messages, tenant_b.messages

    tenant_a_messages, tenant_b_messages = asyncio.run(run_test())

    assert len(tenant_a_messages) == 1
    assert tenant_b_messages == []
