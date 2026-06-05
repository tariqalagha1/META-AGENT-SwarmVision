from __future__ import annotations

import importlib
import os

import jwt
from fastapi.testclient import TestClient


def _build_token(secret: str, role: str, tenant_id: str = "tenant-a") -> str:
    payload = {
        "sub": "test-user",
        "role": role,
        "tenant_id": tenant_id,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _client_with_auth_enforced():
    os.environ["AUTH_DISABLED"] = "false"
    os.environ["JWT_SECRET"] = "unit-test-secret-32-bytes-minimum-key"
    import app.main as app_main

    importlib.reload(app_main)
    return TestClient(app_main.app)


def test_protected_route_requires_bearer_token():
    with _client_with_auth_enforced() as client:
        response = client.get("/analytics/summary")
        assert response.status_code == 401


def test_tenant_escape_is_blocked():
    with _client_with_auth_enforced() as client:
        token = _build_token("unit-test-secret-32-bytes-minimum-key", "Manager", tenant_id="tenant-a")
        response = client.get(
            "/analytics/summary",
            params={"tenant_id": "tenant-b"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_trace_requires_matching_tenant_scope():
    with _client_with_auth_enforced() as client:
        token = _build_token("unit-test-secret-32-bytes-minimum-key", "Manager", tenant_id="tenant-a")
        response = client.get(
            "/trace/trace-123",
            params={"tenant_id": "tenant-b"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_trace_requires_explicit_tenant_scope_for_tenant_tokens():
    with _client_with_auth_enforced() as client:
        token = _build_token("unit-test-secret-32-bytes-minimum-key", "Manager", tenant_id="tenant-a")
        response = client.get(
            "/trace/trace-123",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_read_only_cannot_broadcast_events():
    with _client_with_auth_enforced() as client:
        token = _build_token("unit-test-secret-32-bytes-minimum-key", "ReadOnly", tenant_id="tenant-a")
        response = client.post(
            "/events/broadcast",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "event_type": "TASK_START",
                "source": "security-test",
                "payload": {"agent_id": "agent-1", "task_id": "task-1"},
                "context": {"tenant_id": "tenant-a", "app_id": "app-x"},
            },
        )
        assert response.status_code == 403


