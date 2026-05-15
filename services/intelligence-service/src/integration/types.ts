// ─── Phase 9: Reality Integration + Human–Civilization Coevolution ───────────

// ── Human-AI Governance ───────────────────────────────────────────────────────

export type HumanRole =
  | "executive"          // final authority on strategic decisions
  | "operator"           // day-to-day governance oversight
  | "auditor"            // read-only compliance reviewer
  | "strategic_advisor"  // non-binding strategic input
  | "emergency_officer"; // exclusive authority during crisis

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "vetoed"
  | "escalated"
  | "expired"
  | "auto_approved";   // bypassed within human-defined safety threshold

export interface HumanOperator {
  operator_id: string;
  name: string;
  role: HumanRole;
  trust_score: number;     // 0..1 — system's confidence in operator judgment
  active_since_ms: number;
  total_decisions: number;
  approval_rate: number;   // fraction of proposed actions approved
  veto_rate: number;
}

export interface GovernanceApprovalRequest {
  request_id: string;
  swarm_id: string;
  action_kind: string;
  proposed_by: "system" | string;   // "system" or operator_id
  rationale: string;
  risk_level: "low" | "medium" | "high" | "critical";
  requires_human: boolean;
  expires_at_ms: number;
  created_at_ms: number;
  status: ApprovalStatus;
  reviewed_by: string | null;       // operator_id
  review_note: string | null;
  review_ms: number | null;
}

export interface OperatorConsensus {
  request_id: string;
  required_approvals: number;
  received_approvals: string[];     // operator_ids who approved
  received_vetoes: string[];
  consensus_reached: boolean;
  consensus_kind: "approved" | "vetoed" | "pending" | "split";
  resolved_at_ms: number | null;
}

export interface HumanInterventionRecord {
  intervention_id: string;
  operator_id: string;
  swarm_id: string;
  kind: "override" | "veto" | "approval" | "escalation" | "emergency_halt";
  target_action: string;
  reason: string;
  outcome_health_delta: number | null;  // measured post-intervention
  occurred_at_ms: number;
}

// ── Explainability Engine ─────────────────────────────────────────────────────

export type ExplanationKind =
  | "intervention"
  | "governance_change"
  | "orchestration_evolution"
  | "simulation_preference"
  | "institution_formation"
  | "philosophy_shift"
  | "structural_change";

export interface CausalStep {
  step: number;
  observation: string;       // what was observed
  inference: string;         // what was concluded
  confidence: number;        // 0..1
  evidence: string[];        // data points supporting this
}

export interface CausalGraph {
  root_cause: string;
  causal_chain: CausalStep[];
  final_effect: string;
  total_confidence: number;
}

export interface GovernanceLineageEntry {
  entry_id: string;
  swarm_id: string;
  timestamp_ms: number;
  kind: ExplanationKind;
  summary: string;
  causal_graph: CausalGraph;
  human_readable: string;    // one-paragraph plain-English explanation
  decision_maker: "system" | string;
  reversible: boolean;
}

export interface StrategicRationaleTimeline {
  swarm_id: string;
  entries: GovernanceLineageEntry[];
  dominant_theme: string;
  turning_points: string[];  // decisions that changed trajectory
}

export interface ExplainabilityReport {
  swarm_id: string;
  generated_at_ms: number;
  recent_decisions: GovernanceLineageEntry[];
  causal_summary: string;
  governance_lineage_depth: number;
  audit_readiness: number;   // 0..1 — how complete the audit trail is
  unexplained_actions: string[];
}

// ── Safety + Ethics Constraint Engine ────────────────────────────────────────

export type SafetyConstraintKind =
  | "hard_limit"          // never violate, regardless of context
  | "soft_guardrail"      // default boundary, can be overridden by human
  | "escalation_trigger"  // must escalate to human before proceeding
  | "irreversibility_gate" // gate on actions that cannot be undone
  | "ethical_boundary";   // philosophically defined constraint

export interface SafetyConstraint {
  constraint_id: string;
  kind: SafetyConstraintKind;
  name: string;
  description: string;
  applies_to: string[];    // action kinds this constrains
  threshold: number | null; // numeric threshold if applicable
  enforced_by: "system" | "operator_id";
  active: boolean;
  created_at_ms: number;
}

export interface SafetyViolation {
  violation_id: string;
  constraint_id: string;
  swarm_id: string;
  attempted_action: string;
  violation_severity: "warning" | "blocked" | "emergency_halt";
  detected_at_ms: number;
  resolved: boolean;
  resolution: string | null;
}

export interface SafetyEnforcementResult {
  swarm_id: string;
  evaluated_at_ms: number;
  proposed_action: string;
  allowed: boolean;
  blocking_constraints: SafetyConstraint[];
  violations_recorded: SafetyViolation[];
  escalation_required: boolean;
  escalation_reason: string | null;
  safe_alternative: string | null;
}

// ── Human Trust Modeling ──────────────────────────────────────────────────────

export interface TrustDimension {
  name: string;
  score: number;           // 0..1
  trend: "rising" | "stable" | "declining";
  evidence: string[];
}

export interface OperatorTrustProfile {
  operator_id: string;
  overall_trust: number;
  dimensions: TrustDimension[];
  calibration_score: number;   // 0..1 — how well operator predictions match outcomes
  strategic_alignment: number; // 0..1 — agreement with system recommendations
  intervention_quality: number; // 0..1 — did human interventions improve outcomes?
  last_updated_ms: number;
}

export interface TrustReport {
  swarm_id: string;
  generated_at_ms: number;
  operators: OperatorTrustProfile[];
  ecosystem_trust_level: number;   // 0..1 — aggregate
  trust_trend: "growing" | "stable" | "eroding";
  legitimacy_score: number;        // 0..1 — institutional legitimacy
  trust_gaps: string[];
  recommendations: string[];
}

// ── Mixed Human/Swarm Organizations ──────────────────────────────────────────

export type MemberKind = "human" | "swarm_agent" | "hybrid_system";

export interface OrgMember {
  member_id: string;
  name: string;
  kind: MemberKind;
  role: string;
  authority_weight: number;  // 0..1 — voting weight in decisions
  active: boolean;
}

export interface MixedOrganization {
  org_id: string;
  name: string;
  kind: "executive_council" | "operations_team" | "governance_board" | "crisis_committee" | "strategic_assembly";
  members: OrgMember[];
  human_fraction: number;   // 0..1
  decision_model: "human_veto" | "consensus" | "weighted_vote" | "ai_advised_human_decided";
  charter: string[];
  formed_at_ms: number;
  decisions_made: number;
  health_score: number;
}

// ── Enterprise Digital Twin ───────────────────────────────────────────────────

export interface EnterpriseTeam {
  team_id: string;
  name: string;
  kind: "engineering" | "operations" | "strategy" | "compliance" | "ai_systems";
  member_count: number;
  workload: number;          // 0..1
  health: number;            // 0..1
  ai_augmentation: number;   // 0..1 — fraction of work AI-assisted
}

export interface InfrastructureNode {
  node_id: string;
  kind: "kubernetes_cluster" | "ci_pipeline" | "observability_stack" | "security_monitor" | "ai_workload";
  name: string;
  health: number;
  load: number;
  criticality: "low" | "medium" | "high" | "critical";
  dependencies: string[];    // node_ids this depends on
}

export interface RiskPropagationPath {
  origin_node: string;
  affected_nodes: string[];
  propagation_probability: number;
  estimated_impact: number;  // 0..1
  blast_radius_ms: number;   // how fast it spreads
}

export interface EnterpriseTwinState {
  twin_id: string;
  org_name: string;
  simulated_at_ms: number;
  teams: EnterpriseTeam[];
  infrastructure: InfrastructureNode[];
  risk_propagation_paths: RiskPropagationPath[];
  overall_resilience: number;
  strategic_initiatives: string[];
  ai_governance_coverage: number;  // 0..1 — fraction of AI systems under governance
}

// ── Constitutional Memory ─────────────────────────────────────────────────────

export interface PolicyRecord {
  policy_id: string;
  swarm_id: string;
  title: string;
  body: string;
  kind: "rule" | "amendment" | "precedent" | "override" | "veto_record";
  enacted_by: string;        // operator_id or "system"
  enacted_at_ms: number;
  supersedes_id: string | null;
  active: boolean;
  impact_score: number;      // 0..1 — measured governance impact
}

export interface ConstitutionalAmendment {
  amendment_id: string;
  swarm_id: string;
  proposed_by: string;
  rationale: string;
  old_rule: string;
  new_rule: string;
  approved_by: string[];
  enacted_at_ms: number;
  health_impact: number | null;
}

export interface GovernanceDisputeRecord {
  dispute_id: string;
  swarm_id: string;
  kind: "human_override" | "policy_conflict" | "authority_boundary" | "ethical_objection";
  parties: string[];
  summary: string;
  resolution: string | null;
  resolved_at_ms: number | null;
  precedent_set: boolean;
}

export interface ConstitutionalMemoryState {
  swarm_id: string;
  total_policies: number;
  active_policies: PolicyRecord[];
  amendments: ConstitutionalAmendment[];
  disputes: GovernanceDisputeRecord[];
  precedent_count: number;
  constitutional_stability: number;  // 0..1
  doctrine_age_ms: number;
}

// ── Strategic Command Center ──────────────────────────────────────────────────

export interface LiveIntervention {
  intervention_id: string;
  operator_id: string;
  swarm_id: string;
  kind: "halt" | "accelerate" | "redirect" | "isolate" | "merge" | "override_philosophy";
  parameters: Record<string, string | number | boolean>;
  issued_at_ms: number;
  status: "pending" | "executing" | "complete" | "failed";
  result_summary: string | null;
}

export interface CommandCenterState {
  swarm_ids: string[];
  active_interventions: LiveIntervention[];
  pending_approvals: GovernanceApprovalRequest[];
  recent_decisions: GovernanceLineageEntry[];
  safety_status: "green" | "yellow" | "red" | "black";
  human_oversight_coverage: number;  // 0..1
  escalation_queue: string[];
}
