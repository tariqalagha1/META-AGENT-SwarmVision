from __future__ import annotations

from typing import Any

from app.schemas.swarm import AgentDefinition


AGENT_REGISTRY: dict[str, AgentDefinition] = {
    "fetch_agent": AgentDefinition(
        agent_id="fetch_agent",
        name="Fetch Agent",
        role="collector",
        capabilities=["collect_raw_items"],
        status="active",
    ),
    "normalize_agent": AgentDefinition(
        agent_id="normalize_agent",
        name="Normalize Agent",
        role="transformer",
        capabilities=["normalize_items"],
        status="active",
    ),
    "quality_agent": AgentDefinition(
        agent_id="quality_agent",
        name="Quality Agent",
        role="validator",
        capabilities=["score_quality"],
        status="active",
    ),
}


def run_fetch_agent(task: str) -> dict[str, Any]:
    task_seed = task.strip() or "default-task"
    return {
        "raw_items": [
            {"id": "item-1", "text": f"{task_seed} candidate 1"},
            {"id": "item-2", "text": f"{task_seed} candidate 2"},
            {"id": "item-3", "text": f"{task_seed} candidate 3"},
        ]
    }


def run_normalize_agent(raw_items: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = [
        {
            "id": str(item.get("id", "")),
            "text": str(item.get("text", "")).strip().lower(),
        }
        for item in raw_items
    ]
    return {"normalized_items": normalized}


def run_quality_agent(normalized_items: list[dict[str, Any]], task: str) -> dict[str, Any]:
    total = len(normalized_items)
    completeness = 1.0 if total > 0 else 0.0
    lowered_task = task.strip().lower()
    # Deterministic low-quality trigger for adaptive orchestration testing.
    if "low-quality" in lowered_task or "low quality" in lowered_task:
        completeness = min(completeness, 0.45)
    return {
        "quality": {
            "score": round(completeness * 100, 2),
            "item_count": total,
        },
        "final_items": normalized_items,
    }


def execute_agent(agent_id: str, step_input: dict[str, Any], task: str) -> dict[str, Any]:
    if agent_id == "fetch_agent":
        return run_fetch_agent(task)
    if agent_id == "normalize_agent":
        raw_items = step_input.get("raw_items")
        if not isinstance(raw_items, list):
            raise ValueError("normalize_agent requires raw_items list")
        return run_normalize_agent(raw_items)
    if agent_id == "quality_agent":
        normalized_items = step_input.get("normalized_items")
        if not isinstance(normalized_items, list):
            raise ValueError("quality_agent requires normalized_items list")
        return run_quality_agent(normalized_items, task)
    raise ValueError(f"unknown agent_id '{agent_id}'")
