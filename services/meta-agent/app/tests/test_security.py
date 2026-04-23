from __future__ import annotations

from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app


class _FakeStore:
    def connect(self): pass
    def close(self): pass
    def prune_retention(self, **_): pass
    def upsert_insight(self, insight): return True
    def get_recent(self, limit=50): return []


def _context_payload() -> dict:
    now = datetime.utcnow()
    return {
        'schema_version': '1.0',
        'trace_id': 'trace-sec',
        'events': [
            {
                'event_id': 'evt-sec-1',
                'event_type': 'TASK_SUCCESS',
                'timestamp': now.isoformat(),
                'trace_id': 'trace-sec',
                'agent_id': 'agent-a',
                'payload': {},
            }
        ],
        'decisions': [],
        'anomalies': [],
        'metrics': {
            'timestamp': now.isoformat(),
            'agents': [],
            'traces': [],
        },
        'agent_states': [],
        'timestamp': now.isoformat(),
        'window_start': (now - timedelta(minutes=5)).isoformat(),
        'window_end': now.isoformat(),
        'truncation_applied': False,
        'trigger': 'manual',
    }


def test_missing_token_returns_401_when_auth_required(monkeypatch):
    from app import main as m
    m.store = _FakeStore()
    m.settings.META_REQUIRE_AUTH_IN_PROD = True
    m.settings.META_SHARED_SECRET = 'secret-abc'
    client = TestClient(app)

    resp = client.post('/analyze', json=_context_payload())
    assert resp.status_code == 401


def test_wrong_token_returns_401(monkeypatch):
    from app import main as m
    m.store = _FakeStore()
    m.settings.META_REQUIRE_AUTH_IN_PROD = True
    m.settings.META_SHARED_SECRET = 'secret-abc'
    client = TestClient(app)

    resp = client.post('/analyze', json=_context_payload(), headers={'X-Meta-Token': 'wrong'})
    assert resp.status_code == 401


def test_correct_token_returns_200(monkeypatch):
    from app import main as m
    m.store = _FakeStore()
    m.settings.META_REQUIRE_AUTH_IN_PROD = True
    m.settings.META_SHARED_SECRET = 'secret-abc'
    client = TestClient(app)

    resp = client.post('/analyze', json=_context_payload(), headers={'X-Meta-Token': 'secret-abc'})
    assert resp.status_code == 200


def test_no_auth_required_passes_without_token(monkeypatch):
    from app import main as m
    m.store = _FakeStore()
    m.settings.META_REQUIRE_AUTH_IN_PROD = False
    client = TestClient(app)

    resp = client.post('/analyze', json=_context_payload())
    assert resp.status_code == 200


def test_debug_route_hidden_in_production(monkeypatch):
    from app import main as m
    m.store = _FakeStore()
    m.settings.META_DEBUG = False
    client = TestClient(app)

    resp = client.get('/insights/recent')
    assert resp.status_code == 404
