from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


class _FakeStore:
    def connect(self): pass
    def close(self): pass
    def prune_retention(self, **_): pass
    def upsert_insight(self, insight): return True
    def get_recent(self, limit=50): return []


def test_health_returns_ok_with_required_fields(monkeypatch):
    from app import main as m
    m.store = _FakeStore()
    client = TestClient(app)

    resp = client.get('/health')

    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'ok'
    assert body['mode'] == 'passive'
    assert body['schema_version'] == '1.0'


def test_version_returns_schema_version(monkeypatch):
    from app import main as m
    m.store = _FakeStore()
    client = TestClient(app)

    resp = client.get('/version')

    assert resp.status_code == 200
    assert 'schema_version' in resp.json()


def test_metrics_endpoint_is_available(monkeypatch):
    from app import main as m
    m.store = _FakeStore()
    client = TestClient(app)

    resp = client.get('/metrics')

    # Endpoint must exist and respond — content depends on prometheus_client availability
    assert resp.status_code == 200
