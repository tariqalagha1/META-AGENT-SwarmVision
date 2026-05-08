import type { BackendChannel, BackendEvent, Ue5EventType, Ue5Message } from "./types";

// Maps every real backend event_type to the UE5 discriminator.
// Unknown types fall through to "UNKNOWN" so BP_SwarmEventRouter
// can log them without crashing.
const EVENT_TYPE_MAP: Record<string, Ue5EventType> = {
  SWARM_STARTED: "SWARM_STARTED",
  SWARM_COMPLETED: "SWARM_COMPLETED",
  SWARM_FAILED: "SWARM_FAILED",
  SWARM_RESULT: "SWARM_RESULT",
  PLANNER_DECISION: "PLANNER_DECISION",
  AGENT_STEP_STARTED: "AGENT_STEP_STARTED",
  AGENT_STEP_COMPLETED: "AGENT_STEP_COMPLETED",
  AGENT_STEP_FAILED: "AGENT_STEP_FAILED",
  AGENT_STEP_RETRY: "AGENT_STEP_RETRY",
  RETRY: "RETRY",
  METRICS_SNAPSHOT: "METRICS_SNAPSHOT",
  AGENT_STATE_SNAPSHOT: "AGENT_STATE_SNAPSHOT",
  META_INSIGHT: "META_INSIGHT",
  ANOMALY: "ANOMALY",
  DECISION: "DECISION",
  PIPELINE_UPDATE: "PIPELINE_UPDATE",
  TASK_HANDOFF: "TASK_HANDOFF",
  TASK_START: "AGENT_STEP_STARTED",
  TASK_SUCCESS: "TASK_SUCCESS",
  TASK_FAIL: "TASK_FAIL",
  AGENT_SPAWN: "AGENT_SPAWN",
  CONNECTION_ESTABLISHED: "UNKNOWN",
  ACKNOWLEDGED: "UNKNOWN",
};

// Extracts a flat data object that UE5 Blueprint can read as named fields.
// Merges top-level event fields and payload so BP nodes have direct access.
function flattenPayload(event: BackendEvent): Record<string, unknown> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const context = (event.context ?? {}) as Record<string, unknown>;

  return {
    event_id: event.event_id ?? event.id ?? null,
    step_name: payload["step_name"] ?? null,
    task: payload["task"] ?? context["task"] ?? null,
    step_count: payload["step_count"] ?? null,
    decisions: payload["decisions"] ?? null,
    planned_steps: payload["planned_steps"] ?? null,
    decision: payload["decision"] ?? null,
    reason: payload["reason"] ?? null,
    input: payload["input"] ?? null,
    output: payload["output"] ?? null,
    attempt: payload["attempt"] ?? null,
    error: payload["error"] ?? null,
    quality_score: (payload["quality"] as Record<string, unknown> | undefined)?.["score"] ?? null,
    quality_threshold: payload["threshold"] ?? null,
    status: payload["status"] ?? null,
    degraded: payload["degraded"] ?? null,
    failed_agent_id: payload["failed_agent_id"] ?? null,
    failed_step: payload["failed_step"] ?? null,
    completed_steps: payload["completed_steps"] ?? null,
    failed_steps: payload["failed_steps"] ?? null,
    raw_items_count: payload["raw_items_count"] ?? null,
    metrics: payload["metrics"] ?? null,
    agents: payload["agents"] ?? null,
    severity: (payload["severity"] as string | undefined) ?? null,
    confidence_score: event["confidence_score"] ?? null,
    decision_flag: event["decision_flag"] ?? null,
    source: event.source ?? null,
    ...payload,
  };
}

export function translate(raw: string, channel: BackendChannel): Ue5Message | null {
  let event: BackendEvent;
  try {
    event = JSON.parse(raw) as BackendEvent;
  } catch {
    return null;
  }

  const rawType = (event.event_type ?? event.type ?? "") as string;
  const ue5Type: Ue5EventType = EVENT_TYPE_MAP[rawType] ?? "UNKNOWN";

  // Skip connection handshake messages — UE5 doesn't need them
  if (ue5Type === "UNKNOWN" && (rawType === "CONNECTION_ESTABLISHED" || rawType === "ACKNOWLEDGED")) {
    return null;
  }

  return {
    ue5_type: ue5Type,
    timestamp: event.timestamp ?? new Date().toISOString(),
    channel,
    trace_id: (event.trace_id as string | undefined) ?? null,
    agent_id: (event.agent_id as string | undefined) ?? null,
    parent_event_id: (event.parent_event_id as string | undefined) ?? null,
    data: flattenPayload(event),
  };
}
