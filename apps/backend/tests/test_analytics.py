import unittest
from datetime import datetime

from app.analytics.service import (
    build_bottlenecks_response,
    build_failures_response,
    build_latency_response,
    build_summary_response,
)


class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.from_timestamp = datetime.fromisoformat("2026-04-10T12:00:00")
        self.to_timestamp = datetime.fromisoformat("2026-04-10T12:10:00")
        self.events = [
            {
                "id": "spawn-alpha",
                "type": "AGENT_SPAWN",
                "timestamp": "2026-04-10T12:00:00Z",
                "source": "system",
                "payload": {"agent_id": "agent-alpha", "agent_name": "Alpha"},
            },
            {
                "id": "start-alpha",
                "type": "TASK_START",
                "timestamp": "2026-04-10T12:01:00Z",
                "source": "agent",
                "payload": {"agent_id": "agent-alpha", "task_id": "task-1"},
            },
            {
                "id": "handoff-alpha-beta",
                "type": "TASK_HANDOFF",
                "timestamp": "2026-04-10T12:02:00Z",
                "source": "agent",
                "payload": {
                    "source_agent_id": "agent-alpha",
                    "target_agent_id": "agent-beta",
                    "task_id": "task-1",
                },
            },
            {
                "id": "fail-beta",
                "type": "TASK_FAIL",
                "timestamp": "2026-04-10T12:08:30Z",
                "source": "agent",
                "payload": {
                    "agent_id": "agent-beta",
                    "task_id": "task-1",
                    "error": "downstream timeout",
                },
            },
            {
                "id": "start-alpha-2",
                "type": "TASK_START",
                "timestamp": "2026-04-10T12:03:00Z",
                "source": "agent",
                "payload": {"agent_id": "agent-alpha", "task_id": "task-2"},
            },
            {
                "id": "success-alpha-2",
                "type": "TASK_SUCCESS",
                "timestamp": "2026-04-10T12:04:30Z",
                "source": "agent",
                "payload": {"agent_id": "agent-alpha", "task_id": "task-2"},
            },
            {
                "id": "fail-beta-2",
                "type": "TASK_FAIL",
                "timestamp": "2026-04-10T12:09:00Z",
                "source": "agent",
                "payload": {
                    "agent_id": "agent-beta",
                    "task_id": "task-3",
                    "error": "queue overload",
                },
            },
        ]

    def test_summary_metrics_capture_success_failures_and_peak_concurrency(self):
        summary = build_summary_response(self.events, self.from_timestamp, self.to_timestamp)

        self.assertEqual(summary["metrics"]["total_events"], 7)
        self.assertEqual(summary["metrics"]["failed_tasks"], 2)
        self.assertEqual(summary["metrics"]["successful_tasks"], 1)
        self.assertEqual(summary["metrics"]["peak_concurrent_agents"], 2)
        self.assertGreater(summary["metrics"]["average_handoff_latency_ms"], 0)
        self.assertGreater(summary["metrics"]["average_task_completion_time_ms"], 0)

    def test_failures_response_identifies_upstream_chain_and_latency_spike(self):
        failures = build_failures_response(self.events, self.from_timestamp, self.to_timestamp)

        self.assertEqual(failures["total_failures"], 2)
        incident = failures["incidents"][0]
        self.assertEqual(incident["suspected_source_node"], "agent-alpha")
        self.assertIn("agent-beta", incident["upstream_chain"])
        self.assertTrue(incident["latency_spike_correlation"])

    def test_latency_response_buckets_events_and_latencies(self):
        latency = build_latency_response(self.events, self.from_timestamp, self.to_timestamp)

        event_buckets = {item["bucket"].isoformat(): item["value"] for item in latency["events_per_minute"]}
        self.assertEqual(event_buckets["2026-04-10T12:02:00"], 1.0)

        latency_bucket = next(
            item
            for item in latency["latency_over_time"]
            if item["bucket"].isoformat() == "2026-04-10T12:08:00"
        )
        self.assertGreater(latency_bucket["average_handoff_latency_ms"], 0)

    def test_bottlenecks_marks_failed_agent_as_red_candidate(self):
        bottlenecks = build_bottlenecks_response(
            self.events, self.from_timestamp, self.to_timestamp
        )

        beta = next(
            agent for agent in bottlenecks["agents"] if agent["agent_id"] == "agent-beta"
        )
        self.assertEqual(beta["severity"], "bottleneck")
        self.assertIn("high_failure_nodes", beta["categories"])
        self.assertTrue(bottlenecks["suspected_root_causes"])


if __name__ == "__main__":
    unittest.main()
