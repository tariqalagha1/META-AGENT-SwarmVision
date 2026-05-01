import unittest

from app.realtime.runtime_stream import register_runtime_event_emitter
from app.schemas.swarm import SwarmRunRequest, SwarmStep
from app.services.swarm_runner import SwarmRunner


class SwarmRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.emitted: list[dict] = []

        async def _capture(payload: dict) -> None:
            self.emitted.append(payload)

        register_runtime_event_emitter(_capture)
        self.runner = SwarmRunner()

    async def test_swarm_run_generates_trace_id(self):
        result = await self.runner.run(SwarmRunRequest(task="collect leads"))
        self.assertTrue(result.trace_id)
        self.assertIsInstance(result.trace_id, str)

    async def test_default_steps_execute_in_order(self):
        result = await self.runner.run(SwarmRunRequest(task="collect leads"))
        ordered = [(step.agent_id, step.step_name) for step in result.steps]
        self.assertEqual(
            ordered,
            [
                ("fetch_agent", "fetch"),
                ("normalize_agent", "normalize"),
                ("quality_agent", "quality"),
            ],
        )
        self.assertEqual(result.status, "completed")

    async def test_failed_step_stops_execution(self):
        result = await self.runner.run(
            SwarmRunRequest(
                task="broken flow",
                steps=[
                    SwarmStep(
                        agent_id="normalize_agent",
                        step_name="normalize-first",
                        input_key="raw_items",
                    ),
                    SwarmStep(
                        agent_id="quality_agent",
                        step_name="quality-after-failure",
                        input_key="normalized_items",
                    ),
                ],
            )
        )
        self.assertEqual(result.status, "failed")
        self.assertEqual(len(result.steps), 1)
        self.assertEqual(result.steps[0].agent_id, "normalize_agent")
        self.assertEqual(result.steps[0].status, "failed")

    async def test_emitted_events_include_trace_id(self):
        result = await self.runner.run(SwarmRunRequest(task="collect leads"))
        self.assertGreater(len(self.emitted), 0)
        for event in self.emitted:
            self.assertEqual(event.get("trace_id"), result.trace_id)

    async def test_response_final_output_exists(self):
        result = await self.runner.run(SwarmRunRequest(task="collect leads"))
        self.assertIsInstance(result.final_output, dict)
        self.assertIn("final_items", result.final_output)
        self.assertIn("quality", result.final_output)

    async def test_planner_decision_event_emitted(self):
        await self.runner.run(SwarmRunRequest(task="collect leads"))
        event_types = [event.get("event_type") for event in self.emitted]
        self.assertIn("PLANNER_DECISION", event_types)

    async def test_failed_step_retries_once(self):
        result = await self.runner.run(
            SwarmRunRequest(
                task="retry failure",
                steps=[
                    SwarmStep(
                        agent_id="unknown_agent",
                        step_name="always-fail",
                    )
                ],
            )
        )
        self.assertEqual(result.status, "failed")
        retry_events = [event for event in self.emitted if event.get("event_type") == "AGENT_STEP_RETRY"]
        self.assertEqual(len(retry_events), 1)

    async def test_low_quality_triggers_fetch_retry_path(self):
        result = await self.runner.run(SwarmRunRequest(task="low-quality leads"))
        step_names = [step.step_name for step in result.steps]
        self.assertIn("fetch-retry", step_names)
        self.assertIn("quality-retry", step_names)


if __name__ == "__main__":
    unittest.main()
