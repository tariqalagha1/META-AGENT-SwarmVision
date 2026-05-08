// ── Raw backend event shape ───────────────────────────────────────────────────

export type BackendChannel = "events" | "metrics" | "alerts" | "agents";

export interface BackendEvent {
  event_id?: string;
  id?: string;
  event_type: string;
  type?: string;
  timestamp: string;
  agent_id?: string;
  trace_id?: string;
  parent_event_id?: string;
  source?: string;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  // metrics / agent snapshots carry their data under payload
  [key: string]: unknown;
}

// ── Translated UE5 message ─────────────────────────────────────────────────────
//
// UE5 Pixel Streaming data channel messages are plain JSON strings.
// BP_SwarmEventRouter in UE5 parses the `ue5_type` field and fans out
// to the correct Blueprint event dispatcher.

export type Ue5EventType =
  | "SWARM_STARTED"
  | "SWARM_COMPLETED"
  | "SWARM_FAILED"
  | "SWARM_RESULT"
  | "PLANNER_DECISION"
  | "AGENT_STEP_STARTED"
  | "AGENT_STEP_COMPLETED"
  | "AGENT_STEP_FAILED"
  | "AGENT_STEP_RETRY"
  | "RETRY"
  | "METRICS_SNAPSHOT"
  | "AGENT_STATE_SNAPSHOT"
  | "META_INSIGHT"
  | "ANOMALY"
  | "DECISION"
  | "PIPELINE_UPDATE"
  | "TASK_HANDOFF"
  | "TASK_SUCCESS"
  | "TASK_FAIL"
  | "AGENT_SPAWN"
  | "UNKNOWN";

export interface Ue5Message {
  /** Discriminator field — BP_SwarmEventRouter switches on this */
  ue5_type: Ue5EventType;
  /** ISO-8601 timestamp from the original backend event */
  timestamp: string;
  /** Which backend channel this arrived on */
  channel: BackendChannel;
  /** trace_id for correlated event chains */
  trace_id: string | null;
  /** agent_id (fetch_agent | normalize_agent | quality_agent) */
  agent_id: string | null;
  /** parent event for chain linking */
  parent_event_id: string | null;
  /** Flattened payload fields — UE5 Blueprints read named fields directly */
  data: Record<string, unknown>;
}
