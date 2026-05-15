// ─── Phase 8: Synthetic Civilization + Meta-Strategic Intelligence ───────────

// ── Governance Philosophy ─────────────────────────────────────────────────────

export type GovernanceIdeology =
  | "decentralized_autonomy"    // swarms self-govern; minimal central authority
  | "federated_republic"        // sovereign swarms with treaty layer
  | "hierarchical_mandate"      // strict top-down orchestration
  | "consensus_democracy"       // quorum-based governance decisions
  | "evolutionary_meritocracy"  // governance fitness-selected each generation
  | "adaptive_anarchy";         // no fixed structure; emergent order only

export type OptimizationPhilosophy =
  | "throughput_maximalism"     // maximize task completion at all costs
  | "resilience_first"          // prefer stable low-variance outcomes
  | "efficiency_balanced"       // Pareto-optimal throughput vs. cost
  | "exploration_biased"        // favor novel topologies and mutations
  | "convergence_seeking"       // minimize entropy, enforce order
  | "antifragile_growth";       // stress-induced improvement

export type CoordinationEthic =
  | "cooperative_solidarity"    // agents sacrifice individual efficiency for collective
  | "competitive_selection"     // agents compete; best strategies dominate
  | "reciprocal_exchange"       // tit-for-tat cooperation
  | "hierarchical_compliance"   // deference to authority
  | "emergent_consensus";       // coordination arises without design

export type InterventionPrinciple =
  | "minimal_interference"      // intervene only at collapse threshold
  | "proactive_optimization"    // continuous micro-interventions
  | "reactive_stabilization"    // intervene after failure detected
  | "evolutionary_pressure"     // interventions create selection pressure
  | "constitutional_constraint"; // intervention only within defined rules

export interface GovernancePhilosophy {
  philosophy_id: string;
  name: string;
  ideology: GovernanceIdeology;
  optimization_philosophy: OptimizationPhilosophy;
  coordination_ethic: CoordinationEthic;
  intervention_principle: InterventionPrinciple;
  fitness_score: number;        // 0..1 — measured against observed outcomes
  generation: number;
  parent_id: string | null;
  mutation_applied: string | null;
  created_at_ms: number;
}

export interface PhilosophyEvolutionResult {
  swarm_id: string;
  evolved_at_ms: number;
  candidate_philosophies: GovernancePhilosophy[];
  dominant_philosophy: GovernancePhilosophy;
  retired_philosophy: GovernancePhilosophy | null;
  fitness_delta: number;        // improvement over previous dominant
  ideology_shift: boolean;
  evolution_insights: string[];
}

export interface GovernanceDoctrine {
  doctrine_id: string;
  swarm_id: string;
  philosophy: GovernancePhilosophy;
  resilience_strategy: string;
  intervention_rules: string[];
  priority_weights: Record<string, number>;
  doctrine_age_ms: number;
  doctrine_stability: number;  // 0..1 — how consistent decisions have been
}

// ── Civilizational Memory ─────────────────────────────────────────────────────

export type CivilizationEraKind =
  | "founding"          // initial formation
  | "expansion"         // growth and topology scaling
  | "crisis"            // near-collapse or major disruption
  | "reformation"       // governance overhaul
  | "golden_age"        // peak performance era
  | "decline"           // degradation trend
  | "renaissance"       // recovery and re-emergence
  | "transformation";   // paradigm shift in structure

export interface CivilizationEra {
  era_id: string;
  swarm_id: string;
  kind: CivilizationEraKind;
  label: string;
  started_at_ms: number;
  ended_at_ms: number | null;
  peak_health: number;
  trough_health: number;
  dominant_ideology: GovernanceIdeology;
  key_events: string[];
  lessons: string[];
}

export interface CivilizationPattern {
  pattern_id: string;
  kind: "successful" | "failed" | "transitional";
  description: string;
  conditions: string[];
  outcomes: string[];
  recurrence_count: number;
  last_seen_ms: number;
  confidence: number;
}

export interface CivilizationalMemoryState {
  swarm_id: string;
  total_eras: number;
  current_era: CivilizationEra | null;
  era_history: CivilizationEra[];
  successful_patterns: CivilizationPattern[];
  failed_patterns: CivilizationPattern[];
  adaptation_epochs: AdaptationEpoch[];
  civilizational_wisdom: number;  // 0..1 — accumulated learning score
}

export interface AdaptationEpoch {
  epoch_id: string;
  trigger: string;
  transformation_kind: string;
  pre_health: number;
  post_health: number;
  duration_ms: number;
  strategies_applied: string[];
}

// ── Self-Structuring Organization ─────────────────────────────────────────────

export type InstitutionKind =
  | "oversight_council"       // governance + compliance body
  | "strategic_assembly"      // long-horizon planning
  | "operational_federation"  // resource sharing collective
  | "research_guild"          // autonomous discovery body
  | "crisis_tribunal"         // emergency response authority
  | "evolutionary_board";     // governs mutation and adaptation

export interface SyntheticInstitution {
  institution_id: string;
  kind: InstitutionKind;
  name: string;
  member_swarms: string[];
  charter: string[];           // founding rules
  authority_domains: string[]; // what decisions it controls
  formed_at_ms: number;
  health_score: number;
  active: boolean;
}

export interface OrganizationalStructure {
  structure_id: string;
  swarm_id: string;
  departments: Department[];
  specialization_clusters: SpecializationCluster[];
  active_institutions: SyntheticInstitution[];
  hierarchy_depth: number;
  federation_count: number;
  structure_stability: number;  // 0..1
  formed_at_ms: number;
}

export interface Department {
  dept_id: string;
  name: string;
  specialization: string;
  agent_ids: string[];
  load: number;
  health: number;
}

export interface SpecializationCluster {
  cluster_id: string;
  dominant_function: string;
  agent_ids: string[];
  cohesion: number;  // 0..1 — how well-aligned the cluster is
  efficiency: number;
}

export interface StructuralEvolutionResult {
  swarm_id: string;
  evolved_at_ms: number;
  previous_structure: OrganizationalStructure | null;
  new_structure: OrganizationalStructure;
  changes_applied: string[];
  institutions_formed: SyntheticInstitution[];
  expected_efficiency_gain: number;
  restructure_rationale: string;
}

// ── Meta-Strategic Reasoning ──────────────────────────────────────────────────

export type StrategicDriftKind =
  | "ideological_drift"       // governance ideology shifting away from optimal
  | "structural_fragmentation" // org structure losing cohesion
  | "evolutionary_stagnation" // mutations converging; no improvement
  | "ecosystem_fragility"     // increasing vulnerability to shocks
  | "knowledge_decay"         // civilizational memory degrading
  | "governance_ossification" // governance becoming rigid and unresponsive
  | "healthy_adaptation";     // positive drift — system improving

export interface StrategicDriftAnalysis {
  swarm_id: string;
  analyzed_at_ms: number;
  drift_kind: StrategicDriftKind;
  drift_magnitude: number;     // 0..1 — how severe
  drift_velocity: number;      // rate of change per epoch
  affected_dimensions: string[];
  root_causes: string[];
  correction_window_ms: number;  // estimated time before irreversible
  intervention_priority: "none" | "monitor" | "intervene" | "critical";
}

export interface IdeologyFitnessReport {
  evaluated_at_ms: number;
  ideology_scores: Array<{
    ideology: GovernanceIdeology;
    fitness: number;
    context_fit: number;        // how well it fits current swarm state
    trajectory: "rising" | "stable" | "declining";
  }>;
  optimal_ideology: GovernanceIdeology;
  current_ideology: GovernanceIdeology;
  ideology_gap: number;         // 0..1 — distance from optimal
}

export interface MetaStrategicReport {
  swarm_id: string;
  generated_at_ms: number;
  strategic_evolution_stage: "nascent" | "developing" | "mature" | "transcendent";
  drift_analysis: StrategicDriftAnalysis;
  ideology_fitness: IdeologyFitnessReport;
  ecosystem_fragility_score: number;   // 0..1
  governance_sustainability: number;   // 0..1
  long_term_resilience_forecast: number;
  meta_insights: string[];
  civilizational_risk_level: "low" | "elevated" | "high" | "existential";
}

// ── Civilization-Scale Digital Twin ──────────────────────────────────────────

export interface CivilizationBranch {
  branch_id: string;
  ideology: GovernanceIdeology;
  governance_doctrine: string;
  simulated_era_count: number;
  health_trajectory: number[];  // one per simulated era
  peak_health: number;
  trough_health: number;
  collapse_probability: number;  // 0..1
  golden_age_probability: number;
  selected: boolean;
  pruned_reason: string | null;
}

export interface CivilizationTwinResult {
  swarm_id: string;
  simulated_at_ms: number;
  horizon_label: "decade" | "generation" | "epoch";
  branches_explored: number;
  surviving_branches: CivilizationBranch[];
  optimal_branch: CivilizationBranch;
  institutional_collapse_scenarios: string[];
  ecosystem_adaptation_forecast: string[];
  ideology_survival_ranking: Array<{ ideology: GovernanceIdeology; survival_score: number }>;
}

// ── Autonomous Discovery Engine ───────────────────────────────────────────────

export type DiscoveryKind =
  | "topology_innovation"       // novel agent connection pattern found
  | "governance_mutation"       // new governance rule discovered
  | "coordination_model"        // novel inter-agent coordination discovered
  | "doctrine_invention"        // completely new orchestration doctrine
  | "efficiency_breakthrough"   // unexpected efficiency pattern detected
  | "resilience_strategy";      // new failure-recovery mechanism found

export interface DiscoveredPattern {
  discovery_id: string;
  kind: DiscoveryKind;
  description: string;
  conditions_required: string[];
  expected_gain: number;        // 0..1 fitness improvement estimate
  confidence: number;           // 0..1 — based on evidence strength
  novelty_score: number;        // 0..1 — how different from known patterns
  discovered_at_ms: number;
  experiment_basis: string;     // what data triggered this discovery
}

export interface DiscoveryReport {
  swarm_id: string;
  generated_at_ms: number;
  discoveries: DiscoveredPattern[];
  total_patterns_explored: number;
  novelty_frontier: number;     // 0..1 — how far into unknown territory
  recommended_experiments: string[];
  research_directions: string[];
}

// ── Synthetic Institution Layer ───────────────────────────────────────────────

export interface InstitutionFormationResult {
  formed_at_ms: number;
  new_institutions: SyntheticInstitution[];
  dissolved_institutions: string[];  // institution_ids dissolved
  governance_coverage: number;       // 0..1 — fraction of domains with institutions
  formation_rationale: string[];
}

export interface FederationTreaty {
  treaty_id: string;
  member_swarms: string[];
  treaty_kind: "resource_sharing" | "mutual_defense" | "knowledge_exchange" | "joint_governance";
  terms: string[];
  formed_at_ms: number;
  stability: number;  // 0..1
}

// ── Civilizational Consciousness ──────────────────────────────────────────────

export type CivilizationalAwarenessLabel =
  | "primitive"         // no self-model; reactive only
  | "awakening"         // emerging self-awareness
  | "self_organizing"   // deliberate structural choices
  | "philosophically_aware"  // reasoning about governance philosophy
  | "historically_grounded"  // learning from own civilizational history
  | "meta_strategic"    // reasoning about strategic evolution itself
  | "transcendent";     // full civilizational consciousness

export interface CivilizationalConsciousnessSignal {
  swarm_id: string;
  computed_at_ms: number;
  ecosystem_wisdom: number;         // 0..1 — accumulated adaptive knowledge
  strategic_maturity: number;       // 0..1 — quality of long-horizon reasoning
  ideological_coherence: number;    // 0..1 — philosophy consistent with behavior
  organizational_complexity: number; // 0..1 — structural sophistication
  adaptive_intelligence: number;    // 0..1 — rate of improvement under pressure
  civilizational_resilience: number; // 0..1 — ability to survive ideology stress-tests
  awareness_label: CivilizationalAwarenessLabel;
  transcendence_index: number;      // 0..1 — distance from primitive baseline
  civilization_insights: string[];
}
