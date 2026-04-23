from __future__ import annotations

from datetime import datetime, timedelta
import json

from fastapi.testclient import TestClient

from app.main import app


class _FakeStore:
    def __init__(self):
        self.items = []

    def connect(self):
        return None

    def close(self):
        return None

    def prune_retention(self, retention_days: int = 30, max_rows: int = 10_000):
        return None

    def upsert_insight(self, insight):
        self.items.append(insight)
        return True

    def get_recent(self, limit: int = 50):
        return [item.model_dump(mode='json') for item in self.items[:limit]]


def _context_payload() -> dict:
    now = datetime.utcnow()
    return {
        'schema_version': '1.0',
        'trace_id': 'trace-1',
        'events': [
            {
                'event_id': 'evt-1',
                'event_type': 'TASK_SUCCESS',
                'timestamp': now.isoformat(),
                'trace_id': 'trace-1',
                'agent_id': 'agent-a',
                'payload': {},
            }
        ],
        'decisions': [
            {
                'event_id': 'dec-1',
                'timestamp': now.isoformat(),
                'trace_id': 'trace-1',
                'agent_id': 'agent-a',
                'decision_flag': 'FALLBACK',
                'payload': {'decision_point': 'guard'},
            }
        ],
        'anomalies': [],
        'metrics': {
            'timestamp': now.isoformat(),
            'agents': [
                {'agent_id': 'agent-a', 'latency_avg': 10, 'failure_rate': 0.0, 'throughput': 2, 'state': 'ACTIVE'}
            ],
            'traces': [
                {'trace_id': 'trace-1', 'duration_ms': 1000, 'retry_count': 0}
            ],
        },
        'agent_states': [
            {'agent_id': 'agent-a', 'state': 'ACTIVE', 'last_seen': now.isoformat()}
        ],
        'timestamp': now.isoformat(),
        'window_start': (now - timedelta(minutes=5)).isoformat(),
        'window_end': now.isoformat(),
        'truncation_applied': False,
        'trigger': 'manual',
    }


def test_health_and_version_contract(monkeypatch):
    from app import main as main_module

    main_module.store = _FakeStore()
    client = TestClient(app)

    health = client.get('/health')
    assert health.status_code == 200
    assert health.json()['status'] == 'ok'
    assert health.json()['mode'] == 'passive'
    assert health.json()['schema_version'] == '1.0'

    version = client.get('/version')
    assert version.status_code == 200
    assert 'schema_version' in version.json()


def test_analyze_accepts_valid_contract_and_returns_schema(monkeypatch):
    from app import main as main_module

    main_module.store = _FakeStore()
    main_module.settings.META_REQUIRE_AUTH_IN_PROD = False

    client = TestClient(app)
    response = client.post('/analyze', json=_context_payload())
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    if response.json():
      first = response.json()[0]
      assert first['schema_version'] == '1.0'
      assert first['event_type'] == 'META_INSIGHT'
      assert 'dedup_key' in first
      assert 'metadata' in first


def test_invalid_payload_returns_422(monkeypatch):
    from app import main as main_module

    main_module.store = _FakeStore()
    main_module.settings.META_REQUIRE_AUTH_IN_PROD = False
    client = TestClient(app)

    response = client.post('/analyze', json={'trace_id': 'x'})
    assert response.status_code == 422


def test_oversized_payload_returns_413(monkeypatch):
    from app import main as main_module

    main_module.store = _FakeStore()
    main_module.settings.META_REQUIRE_AUTH_IN_PROD = False
    client = TestClient(app)

    payload = _context_payload()
    payload['events'] = [payload['events'][0] for _ in range(6000)]
    body = json.dumps(payload)

    response = client.post(
        '/analyze',
        content=body,
        headers={'content-type': 'application/json', 'content-length': str(700000)},
    )
    assert response.status_code == 413


def test_security_modes(monkeypatch):
    from app import main as main_module

    main_module.store = _FakeStore()
    client = TestClient(app)

    main_module.settings.META_REQUIRE_AUTH_IN_PROD = True
    main_module.settings.META_SHARED_SECRET = 'token-1'

    denied = client.post('/analyze', json=_context_payload())
    assert denied.status_code == 401

    bad = client.post('/analyze', json=_context_payload(), headers={'X-Meta-Token': 'wrong'})
    assert bad.status_code == 401

    ok = client.post('/analyze', json=_context_payload(), headers={'X-Meta-Token': 'token-1'})
    assert ok.status_code == 200

    main_module.settings.META_REQUIRE_AUTH_IN_PROD = False
    no_token = client.post('/analyze', json=_context_payload())
    assert no_token.status_code == 200


def test_debug_route_hidden_when_disabled(monkeypatch):
    from app import main as main_module

    main_module.store = _FakeStore()
    main_module.settings.META_DEBUG = False
    client = TestClient(app)

    response = client.get('/insights/recent')
    assert response.status_code == 404
