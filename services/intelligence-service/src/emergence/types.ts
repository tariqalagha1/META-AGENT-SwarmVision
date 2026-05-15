// ─── Phase 7: Collective Swarm Cognition + Evolutionary Operations ─────────────

// ── Emergent Behavior ─────────────────────────────────────────────────────────

export type CollaborationArchetype =
  | "pipeline"          // strict linear handoffs
  | "mesh"              // all-to-all coordination
  | "hub_spoke"         // central coordinator + periphery
  | "consensus"         // quorum before proceeding
  | "competitive"       // agents race on same tasks
  | "emergent_hybrid";  // system-derived mixed pattern

export type OperationalCulturePattern =
  | "high_reliability"  // low variance, strong governance
  | "agile_recovery"    // fast to fail, fast to recover
  | "brittle_efficient" // fast but fragile
  | "conservative"      // slow, safe, deliberate
  | "chaotic"           // unpredictable behavior
  | "adaptive";         // evolves under load

export interface EmergentBehaviorReport {
  swarm_id: string;
  analyzed_at_ms: number;
  window_ms: number;

  collaboration_archetype: CollaborationArchetype;
  archetype_confidence: number;          // 0..1

  synchronization_quality: number;       // 0..1 — how in-phase agents are
  coordination_entropy: number;          // 0..1 — disorder in event timing
  emergent_retry_pattern: EmergentRetryPattern;
  anomaly_propagation: AnomalyPropagationSignature;
  operational_culture: OperationalCulturePattern;
  culture_confidence: number;

  collaboration_graph: CollaborationEdge[];
  signals: string[];
}

export interface EmergentRetryPattern {
  kind: "isolated" | "synchronized" | "cascading" | "storm" | "absent";
  participating_agents: string[];
  avg_retry_lag_ms: number;             // typical ms between retry bursts
  propagation_coefficient: number;      // 0..1 — how much one retry triggers others
}

export interface AnomalyPropagationSignature {
  kind: "contained" | "linear_spread" | "fan_out" | "epidemic" | "isolated";
  origin_agent: string | null;
  affected_zones: string[];
  propagation_speed_ms: number;         // ms per hop
  blast_radius: number;                 // fraction of agents affected 0..1
}

export interface CollaborationEdge {
  from_agent: string;
  to_agent: string;
  handoff_count: number;
  avg_latency_ms: number;
  reliability: number;                  // 0..1 success rate
}

// ── Swarm Coherence ───────────────────────────────────────────────────────────

export interface SwarmCoherenceReport {
  swarm_id: string;
  computed_at_ms: number;

  harmony: number;                      // 0..1 — overall coherence composite
  collective_stress: number;            // 0..1 — systemic strain
  coordination_entropy: number;         // 0..1 — timing disorder
  synchronization_quality: number;      // 0..1 — phase alignment
  operational_cohesion: number;         // 0..1 — shared purpose alignment
  systemic_resilience: number;          // 0..1 — ability to absorb shocks

  coherence_label: "cohesive" | "stressed" | "fragmented" | "critical";
  dominant_stressor: string | null;
  recommendations: string[];
}

// ── Collective Memory ─────────────────────────────────────────────────────────

export interface CollectiveMemoryNode {
  node_id: string;
  swarm_id: string;
  session_id: string;
  kind: "pattern" | "incident" | "success" | "governance_action" | "topology";
  summary: string;
  health_at_event: number;
  event_types: string[];
  context_tags: string[];
  weight: number;                       // accumulated reinforcement
  created_at_ms: number;
  last_reinforced_ms: number;
}

export interface CollectiveMemoryEdge {
  from_node_id: string;
  to_node_id: string;
  relation: "caused" | "resolved" | "preceded" | "correlated" | "generalized_to";
  strength: number;                     // 0..1
}

export interface CollectiveMemoryGraph {
  nodes: CollectiveMemoryNode[];
  edges: CollectiveMemoryEdge[];
  cross_swarm_transfers: CrossSwarmTransfer[];
  total_sessions: number;
  knowledge_density: number;           // nodes / session
}

export interface CrossSwarmTransfer {
  from_swarm: string;
  to_swarm: string;
  transferred_pattern: string;
  expected_gain: number;
  applied_at_ms: number;
}

// ── Evolutionary Orchestration ────────────────────────────────────────────────

export type MutationKind =
  | "adjust_retry_policy"
  | "reorder_pipeline"
  | "merge_agents"
  | "split_agent"
  | "shift_governance_threshold"
  | "change_priority_weights"
  | "introduce_buffer_agent";

export interface OrchestrationGenome {
  generation: number;
  genome_id: string;
  parent_id: string | null;
  mutation_applied: MutationKind | null;
  mutation_params: Record<string, number | string>;
  fitness_score: number;               // overall health under this genome
  evaluated_at_ms: number;
}

export interface EvolutionResult {
  swarm_id: string;
  generations: OrchestrationGenome[];
  best_genome: OrchestrationGenome;
  worst_genome: OrchestrationGenome;
  fitness_trend: number[];             // fitness per generation
  converged: boolean;
  convergence_generation: number | null;
  dominant_mutations: MutationKind[];  // mutations present in top 20% genomes
  evolution_insights: string[];
}

// ── Ecosystem Governance ──────────────────────────────────────────────────────

export interface SwarmEcosystemState {
  swarm_id: string;
  health: number;
  load: number;                        // 0..1 — current throughput pressure
  anomaly_rate: number;
  specialization: SwarmSpecialization;
  is_overloaded: boolean;
  is_degraded: boolean;
}

export type SwarmSpecialization =
  | "ingest"
  | "transform"
  | "validate"
  | "output"
  | "coordination"
  | "generalist";

export interface EcosystemGovernanceDecision {
  decided_at_ms: number;
  actions: EcosystemAction[];
  propagation_risk: number;            // 0..1 — risk of cross-swarm cascade
  ecosystem_health: number;            // composite health
  load_balance_score: number;          // 0..1 — how evenly distributed
  federation_stability: number;        // 0..1
}

export interface EcosystemAction {
  kind: "rebalance_load" | "isolate_swarm" | "migrate_agents" | "throttle_swarm" | "federate_swarms" | "emergency_shutdown";
  source_swarm: string;
  target_swarm: string | null;
  rationale: string;
  urgency: "low" | "medium" | "high" | "critical";
  confidence: number;
}

// ── Evolutionary Digital Twin ─────────────────────────────────────────────────

export interface EvolutionaryBranch {
  branch_id: string;
  generation: number;
  parent_branch_id: string | null;
  strategy_label: string;
  genome: OrchestrationGenome;
  simulated_health_trajectory: number[];
  simulated_fitness: number;
  selected: boolean;
  pruned_reason: string | null;
}

export interface EvolutionaryTwinResult {
  swarm_id: string;
  horizon_ms: number;
  branches_explored: number;
  surviving_branches: EvolutionaryBranch[];
  recommended_branch: EvolutionaryBranch;
  long_horizon_forecast: LongHorizonForecast;
}

export interface LongHorizonForecast {
  swarm_id: string;
  forecast_windows: ForecastWindow[];
  expected_failure_ms: number | null;   // null if no failure expected
  intervention_opportunities: InterventionOpportunity[];
  governance_evolution_plan: string[];
}

export interface ForecastWindow {
  offset_ms: number;
  predicted_health: number;
  confidence: number;
  dominant_risk: string | null;
}

export interface InterventionOpportunity {
  offset_ms: number;
  kind: string;
  expected_gain: number;
  urgency: "low" | "medium" | "high";
  description: string;
}

// ── Long-Horizon Strategic Advisor ────────────────────────────────────────────

export interface StrategicEvolutionPlan {
  swarm_id: string;
  generated_at_ms: number;
  horizon_label: "short" | "medium" | "long";
  topology_redesign: TopologyRecommendation | null;
  specialization_strategy: SpecializationStrategy | null;
  governance_evolution: GovernanceEvolutionPlan;
  collective_learning_objectives: string[];
  risk_outlook: RiskOutlook;
  priority_actions: StrategicAction[];
}

export interface TopologyRecommendation {
  current_archetype: CollaborationArchetype;
  recommended_archetype: CollaborationArchetype;
  rationale: string;
  expected_health_gain: number;
  migration_complexity: "low" | "medium" | "high";
}

export interface SpecializationStrategy {
  current_pattern: "generalist" | "mixed" | "specialized";
  recommended_specializations: Array<{ agent_id: string; specialization: SwarmSpecialization }>;
  rationale: string;
  expected_efficiency_gain: number;
}

export interface GovernanceEvolutionPlan {
  current_governance_fitness: number;
  target_fitness: number;
  evolution_steps: string[];
  expected_generations: number;
}

export interface RiskOutlook {
  short_term_risk: "low" | "medium" | "high" | "critical";
  medium_term_risk: "low" | "medium" | "high" | "critical";
  dominant_threat: string;
  mitigation_priority: string;
}

export interface StrategicAction {
  priority: "critical" | "high" | "medium" | "low";
  category: "topology" | "governance" | "specialization" | "capacity" | "resilience";
  headline: string;
  rationale: string;
  expected_gain: number;
  time_horizon_ms: number;
}

// ── Collective Consciousness Signals ──────────────────────────────────────────

export interface CollectiveConsciousnessSignal {
  swarm_id: string;
  computed_at_ms: number;
  global_swarm_confidence: number;     // 0..1
  organizational_tension: number;      // 0..1
  collective_stability: number;        // 0..1
  orchestration_harmony: number;       // 0..1
  evolutionary_readiness: number;      // 0..1 — how ready for next evolution
  emergence_index: number;             // 0..1 — how far from baseline behavior
  consciousness_label: "dormant" | "aware" | "active" | "adaptive" | "evolving";
}
