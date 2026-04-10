import unittest
from datetime import datetime

from app.core.settings import Settings
from app.neo4j.repository import Neo4jGraphRepository
from app.neo4j.replay import build_topology_snapshot


class FakeTx:
    def __init__(self):
        self.queries = []

    def run(self, query, **params):
        self.queries.append((query, params))


class FakeSession:
    def __init__(self):
        self.tx = FakeTx()
        self.run_calls = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute_write(self, callback, params):
        callback(self.tx, params)

    def run(self, *_args, **_kwargs):
        self.run_calls.append((_args, _kwargs))
        return []


class FakeDriver:
    def __init__(self):
        self.session_instance = FakeSession()

    def verify_connectivity(self):
        return None

    def session(self, **_kwargs):
        return self.session_instance

    def close(self):
        return None


class ReplayTests(unittest.TestCase):
    def test_build_topology_snapshot_reconstructs_handoff_state(self):
        timestamp = datetime.fromisoformat("2026-04-10T12:05:00")
        events = [
          {
              "id": "1",
              "type": "AGENT_SPAWN",
              "timestamp": "2026-04-10T12:00:00",
              "source": "system",
              "payload": {"agent_id": "agent-1", "agent_name": "Alpha"},
          },
          {
              "id": "2",
              "type": "TASK_START",
              "timestamp": "2026-04-10T12:01:00",
              "source": "agent",
              "payload": {"agent_id": "agent-1", "task_id": "task-1"},
          },
          {
              "id": "3",
              "type": "TASK_HANDOFF",
              "timestamp": "2026-04-10T12:02:00",
              "source": "agent",
              "payload": {
                  "source_agent_id": "agent-1",
                  "target_agent_id": "agent-2",
                  "task_id": "task-1",
              },
          },
        ]

        snapshot = build_topology_snapshot(events, timestamp)

        self.assertEqual(snapshot["agents"]["agent-1"]["state"], "active")
        self.assertEqual(snapshot["agents"]["agent-2"]["state"], "working")
        self.assertIn("agent-1->agent-2", snapshot["edges"])
        self.assertEqual(snapshot["edges"]["agent-1->agent-2"]["count"], 1)

    def test_repository_persist_event_emits_event_and_handoff_queries(self):
        settings = Settings(neo4j_enabled=True)
        repository = Neo4jGraphRepository(settings)
        repository.driver = FakeDriver()
        repository.available = True

        persisted = repository.persist_event(
            {
                "id": "event-1",
                "type": "TASK_HANDOFF",
                "timestamp": "2026-04-10T12:02:00",
                "source": "agent",
                "payload": {
                    "source_agent_id": "agent-1",
                    "target_agent_id": "agent-2",
                    "task_id": "task-1",
                },
            }
        )

        queries = repository.driver.session_instance.tx.queries
        self.assertTrue(persisted)
        self.assertEqual(len(queries), 2)
        self.assertIn("MERGE (e:Event", queries[0][0])
        self.assertIn("MERGE (source)-[h:HANDOFF", queries[1][0])

    def test_repository_disabled_mode_fails_gracefully(self):
        settings = Settings(neo4j_enabled=False)
        repository = Neo4jGraphRepository(settings)

        self.assertFalse(repository.connect())
        self.assertFalse(repository.get_status()["available"])
        self.assertIn("disabled", repository.get_status()["last_error"])

    def test_repository_query_uses_tenant_and_app_scope(self):
        settings = Settings(neo4j_enabled=True)
        repository = Neo4jGraphRepository(settings)
        repository.driver = FakeDriver()
        repository.available = True

        repository.get_events_between(
            datetime.fromisoformat("2026-04-10T12:00:00"),
            datetime.fromisoformat("2026-04-10T12:05:00"),
            tenant_id="tenant-a",
            app_id="app-a",
        )

        _args, kwargs = repository.driver.session_instance.run_calls[-1]
        self.assertEqual(kwargs["tenant_id"], "tenant-a")
        self.assertEqual(kwargs["app_id"], "app-a")


if __name__ == "__main__":
    unittest.main()
