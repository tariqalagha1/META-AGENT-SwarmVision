// ─── Core intelligence types ──────────────────────────────────────────────────

export interface SwarmHealthReport {
  swarm_id:                  string;
  computed_at_ms:            number;
  duration_ms:               number;

  // Composite scores — 0.0 (worst) to 1.0 (best)
  overall_health:            number;
  orchestration_efficiency:  number;
  anomaly_severity:          number;   // inverted: 1.0 = no anomalies
  retry_pressure:            number;   // inverted: 1.0 = no retries
  throughput_stability:      number;
  agent_balance:             number;

  // Derived label
  health_label:   'healthy' | 'degraded' | 'critical' | 'failed';
  health_trend:   'improving' | 'stable' | 'degrading' | 'unknown';

  // Constituent data
  agent_scores:   AgentEfficiencyScore[];
  bottlenecks:    Bottleneck[];
  incidents:      DetectedIncident[];

  // Compatibility aggregate fields used by advanced modules.
  total_retries?: number;
  total_events?:  number;
  anomaly_rate?:  number;
}

export interface AgentEfficiencyScore {
  agent_id:           string;
  efficiency:         number;   // 0..1
  event_count:        number;
  retry_count:        number;
  failure_count:      number;
  avg_task_ms:        number | null;
  workload_share:     number;   // fraction of swarm total events
  is_bottleneck:      boolean;
}

// Shared event contract used by advanced analysis/evolution modules.
// Keep this permissive to support heterogeneous event envelopes.
export interface SwarmEvent {
  event_id?:      string;
  id:             string;
  event_type:     string;
  type?:          string;
  agent_id:       string;
  zone_id:        string;
  channel?:       string;
  offset_ms:      number;
  timestamp?:     string | number;
  timestamp_ms?:  number;
  priority:       number;
  data:           Record<string, unknown>;
  payload?:       Record<string, unknown>;
}

// ─── Bottleneck detection ─────────────────────────────────────────────────────

export type BottleneckKind =
  | 'retry_loop'
  | 'queue_buildup'
  | 'slow_agent'
  | 'handoff_delay'
  | 'anomaly_concentration'
  | 'stalled_orchestration';

export interface Bottleneck {
  id:           string;
  kind:         BottleneckKind;
  agent_id:     string | null;
  zone_id:      string | null;
  severity:     number;         // 0..1
  onset_ms:     number;         // offset from swarm start
  description:  string;
  event_ids:    string[];
}

// ─── Predictive incident detection ───────────────────────────────────────────

export type IncidentKind =
  | 'retry_storm'
  | 'swarm_degradation'
  | 'anomaly_cascade'
  | 'throughput_collapse'
  | 'orchestration_instability'
  | 'agent_exhaustion';

export type IncidentRisk = 'low' | 'medium' | 'high' | 'critical';

export interface DetectedIncident {
  id:             string;
  kind:           IncidentKind;
  risk:           IncidentRisk;
  probability:    number;       // 0..1  — model confidence
  onset_ms:       number;
  predicted_escalation_ms: number | null;
  affected_agents: string[];
  onset_agent?:    string | null;
  affected_zones:  string[];
  description:    string;
  signals:        IncidentSignal[];
}

export interface IncidentSignal {
  signal_type: string;
  value:       number;
  threshold:   number;
  triggered_at_ms: number;
}

// ─── Executive summary ────────────────────────────────────────────────────────

export interface ExecutiveSummary {
  swarm_id:      string;
  generated_at_ms: number;
  duration_ms:   number;

  headline:      string;         // one-line: "Swarm completed with 94% efficiency — 1 retry storm, resolved"
  outcome:       'success' | 'partial' | 'failure' | 'ongoing';
  quality_score: number | null;

  highlights:    SummaryHighlight[];
  timeline:      SummaryTimelineEntry[];
  recommendations: string[];
}

export interface SummaryHighlight {
  offset_ms:  number;
  kind:       'success' | 'anomaly' | 'retry' | 'failure' | 'recovery' | 'handoff';
  headline:   string;
  detail:     string;
  agent_id:   string | null;
}

export interface SummaryTimelineEntry {
  offset_ms:  number;
  label:      string;
  phase:      'init' | 'ramp' | 'peak' | 'incident' | 'recovery' | 'wind_down' | 'complete';
}

// ─── Knowledge graph ──────────────────────────────────────────────────────────

export interface KnowledgeGraph {
  swarm_id:  string;
  nodes:     KGNode[];
  edges:     KGEdge[];
  computed_at_ms: number;
}

export interface KGNode {
  id:        string;
  kind:      'agent' | 'zone' | 'task_type' | 'swarm';
  label:     string;
  weight:    number;        // event volume — drives visual size
  state:     string;        // last known state
  is_anomaly: boolean;
}

export interface KGEdge {
  id:        string;
  from:      string;        // node id
  to:        string;        // node id
  kind:      'handoff' | 'retry' | 'dependency' | 'anomaly_propagation' | 'collaboration';
  weight:    number;        // interaction frequency
  label:     string;
}

// ─── Operational memory ───────────────────────────────────────────────────────

export interface SwarmHistoryRecord {
  swarm_id:              string;
  completed_at_ms:       number;
  duration_ms:           number;
  overall_health:        number;
  orchestration_efficiency: number;
  retry_count:           number;
  anomaly_count:         number;
  failure_count:         number;
  quality_score:         number | null;
  bottleneck_kinds:      string[];   // JSON array of BottleneckKind
  incident_kinds:        string[];   // JSON array of IncidentKind
  agent_count:           number;
  event_count:           number;
}

export interface OperationalTrend {
  metric:           string;
  samples:          TrendSample[];
  direction:        'improving' | 'stable' | 'degrading';
  change_pct:       number;    // percentage change last N vs prior N
}

export interface TrendSample {
  swarm_id:    string;
  value:       number;
  timestamp_ms: number;
}

// ─── Cinematic intelligence ───────────────────────────────────────────────────

export type NarrativePhase =
  | 'dormant'
  | 'activation'
  | 'ramp'
  | 'peak_operation'
  | 'incident'
  | 'recovery'
  | 'resolution'
  | 'epilogue';

export interface NarrativeState {
  phase:          NarrativePhase;
  tension:        number;     // 0..1 — drives camera urgency, lighting
  pacing:         'slow' | 'medium' | 'fast' | 'urgent';
  focus_agent:    string | null;
  focus_zone:     string | null;
  story_beat:     string;     // human-readable e.g. "Retry storm building in Transform zone"
  recommended_shots: RecommendedShot[];
}

export interface RecommendedShot {
  shot_label:     string;
  focal_mm:       number;
  aperture:       number;
  target_actor:   string | null;  // agent_id or zone_id
  duration_s:     number;
  priority:       number;         // 0=highest
}

// ─── AI Command Layer ─────────────────────────────────────────────────────────

export type InterventionKind =
  | 'pause_swarm'
  | 'isolate_agent'
  | 'reroute_task'
  | 'reset_agent'
  | 'drain_zone'
  | 'emergency_stop';

export interface InterventionCommand {
  id:           string;
  kind:         InterventionKind;
  target_id:    string;       // swarm_id, agent_id, or zone_id
  issued_at_ms: number;
  issued_by:    string;       // viewer_id
  reason:       string;
  payload:      Record<string, unknown>;
}

export interface InterventionResult {
  command_id:   string;
  accepted:     boolean;
  message:      string;
  executed_at_ms: number;
}
