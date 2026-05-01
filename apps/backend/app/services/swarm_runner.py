from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.agents.swarm_agents import execute_agent
from app.realtime.runtime_stream import emit_runtime_event
from app.schemas.swarm import AgentExecutionResult, SwarmRunRequest, SwarmRunResponse, SwarmStep


DEFAULT_SWARM_STEPS: list[SwarmStep] = [
    SwarmStep(agent_id="fetch_agent", step_name="fetch", output_key="raw_items"),
    SwarmStep(
        agent_id="normalize_agent",
        step_name="normalize",
        input_key="raw_items",
        output_key="normalized_items",
    ),
    SwarmStep(
        agent_id="quality_agent",
        step_name="quality",
        input_key="normalized_items",
        output_key="final_items",
    ),
]
RAW_ITEM_SKIP_THRESHOLD = 2
QUALITY_RETRY_THRESHOLD = 60.0
MAX_STEP_RETRIES = 1


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _base_event(
    *,
    event_type: str,
    trace_id: str,
    parent_event_id: str | None = None,
    agent_id: str | None = None,
    step_name: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event_id = str(uuid4())
    timestamp = _now().isoformat()
    return {
        "event_id": event_id,
        "id": event_id,
        "event_type": event_type,
        "type": event_type,
        "timestamp": timestamp,
        "trace_id": trace_id,
        "parent_event_id": parent_event_id,
        "agent_id": agent_id,
        "source": "swarm-runner",
        "payload": {
            "step_name": step_name,
            **(payload or {}),
        },
        "context": {
            "trace_id": trace_id,
            "parent_event_id": parent_event_id,
        },
    }


class SwarmRunner:
    def _plan_steps(self, request: SwarmRunRequest) -> tuple[list[SwarmStep], list[str]]:
        decisions: list[str] = []
        if request.steps:
            decisions.append("custom_steps_provided")
            return list(request.steps), decisions

        steps = list(DEFAULT_SWARM_STEPS)
        task_lower = request.task.strip().lower()

        if "skip-normalize" in task_lower or "skip normalize" in task_lower:
            steps = [step for step in steps if step.agent_id != "normalize_agent"]
            decisions.append("planner_removed_normalize_by_task_hint")

        if "quality-only" in task_lower or "quality only" in task_lower:
            steps = [
                SwarmStep(agent_id="fetch_agent", step_name="fetch", output_key="raw_items"),
                SwarmStep(
                    agent_id="quality_agent",
                    step_name="quality",
                    input_key="normalized_items",
                    output_key="final_items",
                ),
            ]
            decisions.append("planner_reordered_to_quality_only_path")

        return steps, decisions

    async def run(self, request: SwarmRunRequest) -> SwarmRunResponse:
        trace_id = request.trace_id or str(uuid4())
        steps, planner_decisions = self._plan_steps(request)
        results: list[AgentExecutionResult] = []
        shared_context: dict[str, Any] = {"task": request.task}
        previous_event_id: str | None = None
        quality_retry_applied = False

        started_evt = _base_event(
            event_type="SWARM_STARTED",
            trace_id=trace_id,
            payload={"task": request.task, "step_count": len(steps)},
        )
        await emit_runtime_event(started_evt)
        previous_event_id = started_evt["event_id"]

        planner_evt = _base_event(
            event_type="PLANNER_DECISION",
            trace_id=trace_id,
            parent_event_id=previous_event_id,
            payload={
                "decisions": planner_decisions,
                "planned_steps": [step.model_dump(mode="json") for step in steps],
            },
        )
        await emit_runtime_event(planner_evt)
        previous_event_id = planner_evt["event_id"]

        step_queue = list(steps)
        while step_queue:
            step = step_queue.pop(0)
            if step.agent_id == "normalize_agent":
                raw_items = shared_context.get("raw_items")
                if isinstance(raw_items, list) and len(raw_items) < RAW_ITEM_SKIP_THRESHOLD:
                    shared_context["normalized_items"] = raw_items
                    skip_evt = _base_event(
                        event_type="PLANNER_DECISION",
                        trace_id=trace_id,
                        parent_event_id=previous_event_id,
                        agent_id=step.agent_id,
                        step_name=step.step_name,
                        payload={
                            "decision": "skip_step",
                            "reason": "raw_items_below_threshold",
                            "threshold": RAW_ITEM_SKIP_THRESHOLD,
                            "raw_items_count": len(raw_items),
                        },
                    )
                    await emit_runtime_event(skip_evt)
                    previous_event_id = skip_evt["event_id"]
                    continue

            step_input: dict[str, Any]
            if step.input_key:
                step_input = {step.input_key: shared_context.get(step.input_key)}
            else:
                step_input = {"task": request.task, **shared_context}

            step_started_at = _now()
            step_started_evt = _base_event(
                event_type="AGENT_STEP_STARTED",
                trace_id=trace_id,
                parent_event_id=previous_event_id,
                agent_id=step.agent_id,
                step_name=step.step_name,
                payload={"input": step_input},
            )
            await emit_runtime_event(step_started_evt)
            previous_event_id = step_started_evt["event_id"]

            attempt = 0
            while True:
                try:
                    output = execute_agent(step.agent_id, step_input, request.task)
                    if step.output_key and step.output_key in output:
                        shared_context[step.output_key] = output[step.output_key]
                    shared_context.update(output)
                    completed_at = _now()
                    result = AgentExecutionResult(
                        agent_id=step.agent_id,
                        step_name=step.step_name,
                        status="completed",
                        input=step_input,
                        output=output,
                        error=None,
                        started_at=step_started_at,
                        completed_at=completed_at,
                    )
                    results.append(result)

                    completed_evt = _base_event(
                        event_type="AGENT_STEP_COMPLETED",
                        trace_id=trace_id,
                        parent_event_id=previous_event_id,
                        agent_id=step.agent_id,
                        step_name=step.step_name,
                        payload={"output": output, "attempt": attempt + 1},
                    )
                    await emit_runtime_event(completed_evt)
                    previous_event_id = completed_evt["event_id"]

                    if (
                        step.agent_id == "quality_agent"
                        and not quality_retry_applied
                        and isinstance(output.get("quality"), dict)
                        and float(output["quality"].get("score", 0)) < QUALITY_RETRY_THRESHOLD
                    ):
                        quality_retry_applied = True
                        adaptive_plan = [
                            SwarmStep(
                                agent_id="fetch_agent",
                                step_name="fetch-retry",
                                output_key="raw_items",
                            ),
                            SwarmStep(
                                agent_id="normalize_agent",
                                step_name="normalize-retry",
                                input_key="raw_items",
                                output_key="normalized_items",
                            ),
                            SwarmStep(
                                agent_id="quality_agent",
                                step_name="quality-retry",
                                input_key="normalized_items",
                                output_key="final_items",
                            ),
                        ]
                        step_queue = adaptive_plan + step_queue
                        planner_adapt_evt = _base_event(
                            event_type="PLANNER_DECISION",
                            trace_id=trace_id,
                            parent_event_id=previous_event_id,
                            payload={
                                "decision": "insert_retry_path",
                                "reason": "quality_below_threshold",
                                "quality_score": output["quality"].get("score"),
                                "threshold": QUALITY_RETRY_THRESHOLD,
                            },
                        )
                        await emit_runtime_event(planner_adapt_evt)
                        previous_event_id = planner_adapt_evt["event_id"]
                    break
                except Exception as exc:
                    attempt += 1
                    if attempt <= MAX_STEP_RETRIES:
                        retry_evt = _base_event(
                            event_type="AGENT_STEP_RETRY",
                            trace_id=trace_id,
                            parent_event_id=previous_event_id,
                            agent_id=step.agent_id,
                            step_name=step.step_name,
                            payload={"error": str(exc), "attempt": attempt},
                        )
                        await emit_runtime_event(retry_evt)
                        previous_event_id = retry_evt["event_id"]

                        generic_retry_evt = _base_event(
                            event_type="RETRY",
                            trace_id=trace_id,
                            parent_event_id=previous_event_id,
                            agent_id=step.agent_id,
                            step_name=step.step_name,
                            payload={"attempt": attempt},
                        )
                        await emit_runtime_event(generic_retry_evt)
                        previous_event_id = generic_retry_evt["event_id"]
                        continue

                    completed_at = _now()
                    result = AgentExecutionResult(
                        agent_id=step.agent_id,
                        step_name=step.step_name,
                        status="failed",
                        input=step_input,
                        output=None,
                        error=str(exc),
                        started_at=step_started_at,
                        completed_at=completed_at,
                    )
                    results.append(result)

                    failed_evt = _base_event(
                        event_type="AGENT_STEP_FAILED",
                        trace_id=trace_id,
                        parent_event_id=previous_event_id,
                        agent_id=step.agent_id,
                        step_name=step.step_name,
                        payload={"error": str(exc)},
                    )
                    await emit_runtime_event(failed_evt)
                    previous_event_id = failed_evt["event_id"]

                    swarm_failed_evt = _base_event(
                        event_type="SWARM_FAILED",
                        trace_id=trace_id,
                        parent_event_id=previous_event_id,
                        payload={"failed_agent_id": step.agent_id, "failed_step": step.step_name},
                    )
                    await emit_runtime_event(swarm_failed_evt)
                    previous_event_id = swarm_failed_evt["event_id"]

                    swarm_result_evt = _base_event(
                        event_type="SWARM_RESULT",
                        trace_id=trace_id,
                        parent_event_id=previous_event_id,
                        payload={
                            "trace_id": trace_id,
                            "status": "failed",
                            "completed_steps": len(
                                [r for r in results if r.status == "completed"]
                            ),
                            "failed_steps": len([r for r in results if r.status == "failed"]),
                            "degraded": quality_retry_applied,
                            "output": shared_context,
                            "quality": shared_context.get("quality"),
                            "timestamp": _now().isoformat(),
                        },
                    )
                    await emit_runtime_event(swarm_result_evt)

                    return SwarmRunResponse(
                        trace_id=trace_id,
                        status="failed",
                        steps=results,
                        final_output=shared_context,
                    )

        swarm_completed_evt = _base_event(
            event_type="SWARM_COMPLETED",
            trace_id=trace_id,
            parent_event_id=previous_event_id,
            payload={"step_count": len(results)},
        )
        await emit_runtime_event(swarm_completed_evt)
        previous_event_id = swarm_completed_evt["event_id"]

        swarm_result_evt = _base_event(
            event_type="SWARM_RESULT",
            trace_id=trace_id,
            parent_event_id=previous_event_id,
            payload={
                "trace_id": trace_id,
                "status": "completed",
                "completed_steps": len([r for r in results if r.status == "completed"]),
                "failed_steps": len([r for r in results if r.status == "failed"]),
                "degraded": quality_retry_applied,
                "output": shared_context,
                "quality": shared_context.get("quality"),
                "timestamp": _now().isoformat(),
            },
        )
        await emit_runtime_event(swarm_result_evt)

        return SwarmRunResponse(
            trace_id=trace_id,
            status="completed",
            steps=results,
            final_output=shared_context,
        )
