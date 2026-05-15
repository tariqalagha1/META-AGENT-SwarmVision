// ─── Autonomous Governance Types ─────────────────────────────────────────────

export type GovernanceActionKind =
  | 'suppress_retries'
  | 'throttle_agent'
  | 'redistribute_load'
  | 'isolate_agent'
  | 'quarantine_anomaly'
  | 'cool_swarm'
  | 'stabilize_orchestration'
  | 'reroute_task'
  | 'adjust_retry_policy'
  | 'emergency_stop';

export type GovernanceTrigger =
  | 'retry_pressure_threshold'
  | 'anomaly_cascade_detected'
  | 'throughput_collapse'
  | 'agent_exhaustion'
  | 'swarm_degradation'
  | 'predictive_intervention'
  | 'manual_override';

export interface GovernanceAction {
  id:              string;
  kind:            GovernanceActionKind;
  trigger:         GovernanceTrigger;
  swarm_id:        string;
  target_id:       string;      // agent_id, zone_id, or swarm_id
  confidence:      number;      // 0..1 — model confidence in action benefit
  urgency:         'low' | 'medium' | 'high' | 'critical';
  rationale:       string;
  parameters:      Record<string, unknown>;
  issued_at_ms:    number;
  expires_at_ms:   number | null;
  status:          'pending' | 'applied' | 'rejected' | 'expired' | 'rolled_back';
  outcome_health_delta: number | null;  // measured after application
}

export interface RetryPolicy {
  agent_id:             string;
  max_retries:          number;
  base_backoff_ms:      number;
  backoff_multiplier:   number;
  jitter_ms:            number;
  circuit_breaker_threshold: number;
  cooldown_ms:          number;
  last_updated_ms:      number;
  source:               'default' | 'learned' | 'governed';
}

export interface ThrottlePolicy {
  agent_id:         string;
  max_events_per_s: number;
  burst_allowance:  number;
  active_until_ms:  number;
  reason:           string;
}

export interface GovernanceDecision {
  swarm_id:    string;
  decided_at_ms: number;
  health_at_decision: number;
  actions:     GovernanceAction[];
  suppressed_count: number;   // actions considered but suppressed (confidence < threshold)
}

// ─── Digital Twin Types ───────────────────────────────────────────────────────

export type SimulationMutationKind =
  | 'alter_retry_policy'
  | 'reroute_agent'
  | 'inject_anomaly'
  | 'remove_agent'
  | 'add_capacity'
  | 'change_throughput'
  | 'apply_governance';

export interface SimulationMutation {
  kind:       SimulationMutationKind;
  target_id:  string;
  parameters: Record<string, unknown>;
  applied_at_offset_ms: number;
}

export interface SimulationBranch {
  branch_id:        string;
  swarm_id:         string;
  label:            string;
  created_at_ms:    number;
  mutations:        SimulationMutation[];
  baseline_health:  number;
  predicted_health: number;
  predicted_efficiency: number;
  predicted_retry_reduction: number;
  risk_level:       'low' | 'medium' | 'high';
  recommendation:   string;
}

export interface SimulationResult {
  branch_id:           string;
  events_simulated:    number;
  health_trajectory:   { offset_ms: number; health: number }[];
  bottlenecks_removed: string[];
  incidents_prevented: string[];
  efficiency_gain:     number;   // delta vs baseline (negative = worse)
  summary:             string;
}

// ─── Swarm Temperament Types ──────────────────────────────────────────────────

export interface SwarmTemperament {
  swarm_id:             string;
  computed_at_ms:       number;
  sample_count:         number;    // number of historical runs used

  stability:            number;    // 0..1 — how consistently healthy
  resilience:           number;    // 0..1 — how quickly recovers from incidents
  aggression:           number;    // 0..1 — how hard it pushes retry/throughput
  anomaly_sensitivity:  number;    // 0..1 — how often anomalies appear
  retry_persistence:    number;    // 0..1 — average retry ratio
  recovery_speed:       number;    // 0..1 — ms from incident to recovery (inverted)

  dominant_trait:       string;    // human-readable e.g. "high resilience, moderate aggression"
  risk_profile:         'conservative' | 'moderate' | 'aggressive';
  predicted_failure_risk: number;  // 0..1 — probability next run encounters critical incident
}

// ─── Self-Optimization Types ──────────────────────────────────────────────────

export interface OptimizationLearning {
  swarm_id:         string;
  parameter:        string;          // e.g. "retry_backoff_ms", "queue_batch_size"
  current_value:    number;
  suggested_value:  number;
  expected_improvement: number;      // % health improvement
  confidence:       number;
  based_on_runs:    number;
  last_updated_ms:  number;
}

// ─── Strategic Recommendation Types ──────────────────────────────────────────

export type StrategyCategory =
  | 'retry_policy'
  | 'agent_topology'
  | 'workload_distribution'
  | 'anomaly_mitigation'
  | 'throughput_tuning'
  | 'governance_posture';

export interface StrategicRecommendation {
  id:           string;
  category:     StrategyCategory;
  priority:     'low' | 'medium' | 'high' | 'critical';
  headline:     string;
  detail:       string;
  expected_health_gain: number;
  confidence:   number;
  based_on:     string[];    // swarm_ids or pattern names
  generated_at_ms: number;
}

// ─── Executive Copilot Types ──────────────────────────────────────────────────

export type CopilotQueryIntent =
  | 'health_query'
  | 'anomaly_explanation'
  | 'historical_comparison'
  | 'strategy_request'
  | 'simulation_request'
  | 'trend_query'
  | 'intervention_query';

export interface CopilotQuery {
  query_id:   string;
  text:       string;
  intent:     CopilotQueryIntent;
  swarm_id:   string | null;
  context:    Record<string, unknown>;
}

export interface CopilotResponse {
  query_id:    string;
  answer:      string;         // natural language response
  data:        Record<string, unknown>;  // structured data backing the answer
  confidence:  number;
  follow_ups:  string[];       // suggested next questions
  generated_at_ms: number;
}
