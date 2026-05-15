// ─── Phase 10: Inter-Civilizational Networks + Planetary Operations ───────────

// ── Civilization identity ─────────────────────────────────────────────────────

export type CivilizationTier =
  | "nascent"        // newly registered, limited interoperability
  | "established"    // proven governance, treaty-eligible
  | "advanced"       // multi-era history, federation-eligible
  | "transcendent";  // planetary-level influence

export interface CivilizationProfile {
  civ_id: string;
  name: string;
  tier: CivilizationTier;
  dominant_ideology: string;
  health_index: number;       // 0..1 — aggregate operational health
  wisdom_score: number;       // 0..1 — civilizational wisdom
  trust_score: number;        // 0..1 — planetary trust rating
  specialization: string[];   // primary operational domains
  registered_at_ms: number;
  last_seen_ms: number;
}

// ── Inter-Civilizational Protocol ─────────────────────────────────────────────

export type ProtocolKind =
  | "governance_handshake"     // exchange governance schemas
  | "policy_translation"       // translate policy across doctrine boundaries
  | "treaty_negotiation"       // structured negotiation for formal treaty
  | "emergency_coordination"   // crisis-triggered cross-civ response
  | "knowledge_federation"     // share discovered patterns
  | "resource_allocation";     // cross-civ compute/energy/bandwidth

export interface ProtocolMessage {
  msg_id: string;
  from_civ: string;
  to_civ: string | "broadcast";
  kind: ProtocolKind;
  payload: Record<string, unknown>;
  signed_at_ms: number;
  ttl_ms: number;
  acknowledged: boolean;
}

export interface CompatibilityScore {
  civ_a: string;
  civ_b: string;
  governance_compatibility: number;   // 0..1 — ideology alignment
  policy_translatability: number;     // 0..1 — how easily policies map
  treaty_readiness: number;           // 0..1 — readiness to formalize
  operational_synergy: number;        // 0..1 — complementary specializations
  overall: number;
}

export interface InteroperabilityReport {
  evaluated_at_ms: number;
  civilization_pairs: CompatibilityScore[];
  highest_compatibility: CompatibilityScore | null;
  lowest_compatibility: CompatibilityScore | null;
  federation_ready_pairs: string[][];  // pairs above treaty_readiness threshold
  blocking_incompatibilities: string[];
}

// ── Treaty System ─────────────────────────────────────────────────────────────

export type TreatyStatus = "proposed" | "ratified" | "active" | "suspended" | "dissolved";

export type PlanetaryTreatyKind =
  | "non_aggression"          // no hostile actions / resource competition
  | "mutual_aid"              // crisis assistance obligations
  | "free_exchange"           // open knowledge + pattern sharing
  | "joint_governance"        // shared decision authority on planetary matters
  | "strategic_alliance"      // aligned long-horizon objectives
  | "resource_compact"        // binding resource allocation agreement
  | "constitutional_union";   // deepest integration — shared constitution

export interface PlanetaryTreaty {
  treaty_id: string;
  kind: PlanetaryTreatyKind;
  parties: string[];           // civ_ids
  articles: string[];          // binding terms
  ratified_at_ms: number | null;
  expires_at_ms: number | null;
  status: TreatyStatus;
  compliance_scores: Record<string, number>;  // civ_id → 0..1
  health_impact: number | null;
}

export interface NegotiationRound {
  round_id: string;
  treaty_id: string;
  round_number: number;
  proposals: Array<{ civ_id: string; terms: string[] }>;
  counter_proposals: Array<{ civ_id: string; terms: string[] }>;
  outcome: "agreement" | "deadlock" | "partial" | "pending";
  concluded_at_ms: number | null;
}

export interface DiplomaticResolution {
  dispute_id: string;
  parties: string[];
  dispute_kind: "resource_conflict" | "governance_clash" | "policy_violation" | "treaty_breach";
  mediator: string | null;     // civ_id of mediator, or null for auto-arbitration
  resolution_terms: string[];
  compliance_required: Record<string, string[]>;
  resolved_at_ms: number;
  precedent_weight: number;    // 0..1 — how strongly this sets future precedent
}

// ── Federated Governance ──────────────────────────────────────────────────────

export type CouncilKind =
  | "security_council"        // planetary crisis authority
  | "economic_council"        // resource allocation
  | "science_council"         // knowledge federation
  | "ethics_council"          // constitutional oversight
  | "arbitration_tribunal";   // dispute resolution

export interface PlanetaryCouncil {
  council_id: string;
  kind: CouncilKind;
  name: string;
  member_civs: string[];
  voting_weights: Record<string, number>;  // civ_id → 0..1
  quorum_threshold: number;    // fraction of weighted votes needed
  active_resolutions: string[];
  formed_at_ms: number;
  health: number;
}

export interface CouncilResolution {
  resolution_id: string;
  council_id: string;
  title: string;
  body: string;
  proposed_by: string;
  votes_for: string[];         // civ_ids
  votes_against: string[];
  abstentions: string[];
  passed: boolean;
  enacted_at_ms: number | null;
  impact_assessment: string;
}

export interface FederatedGovernanceState {
  evaluated_at_ms: number;
  councils: PlanetaryCouncil[];
  active_treaties: PlanetaryTreaty[];
  pending_resolutions: CouncilResolution[];
  federation_cohesion: number;   // 0..1 — how unified the federation is
  sovereignty_index: number;     // 0..1 — how much local autonomy is preserved
  governance_load: number;       // 0..1 — decision-making burden
}

// ── Planetary Digital Twin ────────────────────────────────────────────────────

export type PlanetaryDomainKind =
  | "compute_fabric"
  | "energy_grid"
  | "communication_network"
  | "ai_ecosystem"
  | "logistics_network"
  | "governance_layer"
  | "human_capital";

export interface PlanetaryDomain {
  domain_id: string;
  kind: PlanetaryDomainKind;
  name: string;
  controlling_civs: string[];
  health: number;
  capacity: number;           // 0..1 — utilization
  criticality: number;        // 0..1 — how many other domains depend on it
  cascade_risk: number;       // 0..1 — failure propagation probability
}

export interface PlanetaryTwinState {
  simulated_at_ms: number;
  civilizations: CivilizationProfile[];
  domains: PlanetaryDomain[];
  active_treaties: PlanetaryTreaty[];
  global_health_index: number;    // 0..1 — population-weighted avg
  systemic_fragility: number;     // 0..1 — cascade failure risk
  coordination_efficiency: number; // 0..1 — how well civs work together
  estimated_failure_domains: string[];
  intervention_priorities: string[];
}

// ── Global Resource Orchestration ─────────────────────────────────────────────

export type ResourceKind =
  | "compute"
  | "energy"
  | "bandwidth"
  | "storage"
  | "ai_capacity"
  | "human_expertise";

export interface ResourcePool {
  pool_id: string;
  kind: ResourceKind;
  owning_civ: string;
  total_capacity: number;
  allocated: number;
  reserved: number;
  available: number;          // total - allocated - reserved
  cost_per_unit: number;
}

export interface ResourceAllocationDecision {
  decided_at_ms: number;
  allocations: Array<{
    from_civ: string;
    to_civ: string;
    resource: ResourceKind;
    amount: number;
    rationale: string;
    priority: "emergency" | "high" | "medium" | "low";
  }>;
  total_rebalanced: number;
  efficiency_gain: number;     // 0..1 — projected improvement
  equity_score: number;        // 0..1 — how fairly distributed
  rejected_requests: string[];
}

// ── Planetary Risk Intelligence ───────────────────────────────────────────────

export type PlanetaryRiskKind =
  | "cascade_infrastructure_failure"
  | "civilization_instability"
  | "governance_divergence"
  | "resource_collapse"
  | "coordination_breakdown"
  | "ideological_conflict"
  | "knowledge_hoarding"
  | "ai_ecosystem_fragmentation";

export interface PlanetaryRisk {
  risk_id: string;
  kind: PlanetaryRiskKind;
  severity: "low" | "elevated" | "high" | "catastrophic";
  affected_civs: string[];
  affected_domains: string[];
  probability: number;         // 0..1
  impact_radius: number;       // 0..1 — fraction of planetary systems affected
  time_to_manifest_ms: number | null;
  early_warning_signals: string[];
  mitigation_options: string[];
}

export interface PlanetaryRiskReport {
  assessed_at_ms: number;
  risks: PlanetaryRisk[];
  overall_threat_level: "green" | "yellow" | "orange" | "red" | "black";
  dominant_risk: PlanetaryRisk | null;
  systemic_fragility: number;
  macro_resilience: number;    // 0..1 — planetary capacity to absorb shocks
  recommended_actions: string[];
}

// ── Planetary Consciousness ───────────────────────────────────────────────────

export type PlanetaryAwarenessLabel =
  | "fragmented"         // civilizations operating independently
  | "emerging_network"   // first inter-civ connections forming
  | "coordinated"        // regular inter-civ coordination
  | "federated"          // formal federation in place
  | "unified"            // high strategic alignment
  | "planetary_mind";    // full cognitive integration

export interface PlanetaryConsciousnessSignal {
  computed_at_ms: number;
  planetary_coherence: number;       // 0..1 — how aligned civ behaviors are
  inter_civ_harmony: number;         // 0..1 — absence of conflict
  strategic_alignment: number;       // 0..1 — shared long-horizon objectives
  macro_resilience: number;          // 0..1 — planetary shock absorption
  adaptive_intelligence: number;     // 0..1 — collective learning rate
  civilization_synchronization: number; // 0..1 — timing alignment
  awareness_label: PlanetaryAwarenessLabel;
  planetary_iq: number;              // 0..1 — aggregate cognitive capability
  emergence_signals: string[];
}

// ── Global Strategic Simulation ───────────────────────────────────────────────

export type PlanetaryScenarioKind =
  | "cooperative_ascent"      // all civs cooperate → golden age
  | "competitive_stagnation"  // civs compete → suboptimal equilibrium
  | "cascade_collapse"        // failure propagates across civs
  | "ideological_divergence"  // governance incompatibility → fragmentation
  | "federated_evolution"     // formal federation → transcendence
  | "resource_war";           // scarcity triggers conflict

export interface PlanetaryScenario {
  scenario_id: string;
  kind: PlanetaryScenarioKind;
  description: string;
  probability: number;         // 0..1
  health_trajectory: number[]; // per simulated epoch
  peak_health: number;
  trough_health: number;
  collapse_probability: number;
  golden_age_probability: number;
  key_turning_points: string[];
}

export interface GlobalStrategicSimulation {
  simulated_at_ms: number;
  horizon_epochs: number;
  scenarios: PlanetaryScenario[];
  most_likely_scenario: PlanetaryScenario;
  optimal_scenario: PlanetaryScenario;
  recommended_trajectory: string;
  strategic_leverage_points: string[];
}
