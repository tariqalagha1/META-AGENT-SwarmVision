import { SwarmHealthReport, SwarmEvent } from "../types";
import { OperationalMemory } from "../memory/operational-memory";
import { EmergentBehaviorReport, SwarmCoherenceReport } from "../emergence/types";
import {
  StrategicEvolutionPlan,
  TopologyRecommendation,
  SpecializationStrategy,
  GovernanceEvolutionPlan,
  RiskOutlook,
  StrategicAction,
  CollaborationArchetype,
  SwarmSpecialization,
} from "../emergence/types";

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildEvolutionPlan(
  swarmId: string,
  report: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  memory: OperationalMemory,
  events: SwarmEvent[],
): StrategicEvolutionPlan {
  const now = Date.now();

  const horizon = pickHorizon(report, coherence);
  const topology = buildTopologyRecommendation(emergent, report);
  const specialization = buildSpecializationStrategy(events, emergent, report);
  const governance = buildGovernanceEvolutionPlan(report, coherence);
  const risk = buildRiskOutlook(report, coherence, emergent);
  const actions = buildPriorityActions(report, emergent, coherence, topology, specialization);
  const learningObjectives = buildLearningObjectives(memory, emergent, coherence);

  return {
    swarm_id:           swarmId,
    generated_at_ms:    now,
    horizon_label:      horizon,
    topology_redesign:  topology,
    specialization_strategy: specialization,
    governance_evolution:    governance,
    collective_learning_objectives: learningObjectives,
    risk_outlook:       risk,
    priority_actions:   actions,
  };
}

// ─── Horizon classification ───────────────────────────────────────────────────

function pickHorizon(
  report: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
): "short" | "medium" | "long" {
  if (report.overall_health < 0.40 || coherence.coherence_label === "critical") return "short";
  if (report.overall_health < 0.65 || coherence.coherence_label === "stressed") return "medium";
  return "long";
}

// ─── Topology recommendation ──────────────────────────────────────────────────

function buildTopologyRecommendation(
  emergent: EmergentBehaviorReport,
  report: SwarmHealthReport,
): TopologyRecommendation | null {
  const current = emergent.collaboration_archetype;
  const health  = report.overall_health;

  const upgrades: Partial<Record<CollaborationArchetype, CollaborationArchetype>> = {
    pipeline:    health < 0.55 ? "hub_spoke" : "mesh",
    hub_spoke:   "mesh",
    competitive: "pipeline",
    emergent_hybrid: "hub_spoke",
    consensus:   "pipeline",
  };

  const target = upgrades[current];
  if (!target || target === current) return null;

  const gain: Partial<Record<CollaborationArchetype, number>> = {
    mesh:      0.12,
    hub_spoke: 0.09,
    pipeline:  0.07,
  };
  const complexity: Partial<Record<CollaborationArchetype, "low" | "medium" | "high">> = {
    mesh:      "high",
    hub_spoke: "medium",
    pipeline:  "low",
  };

  return {
    current_archetype:     current,
    recommended_archetype: target,
    rationale: topologyRationale(current, target, health),
    expected_health_gain:  round2(gain[target] ?? 0.08),
    migration_complexity:  complexity[target] ?? "medium",
  };
}

function topologyRationale(
  current: CollaborationArchetype,
  target: CollaborationArchetype,
  health: number,
): string {
  if (current === "pipeline" && target === "hub_spoke") {
    return "Pipeline bottlenecks degrade under load — hub-spoke allows dynamic task reassignment";
  }
  if (current === "pipeline" && target === "mesh") {
    return "Mesh topology enables parallel task paths, reducing single-point failures";
  }
  if (current === "hub_spoke" && target === "mesh") {
    return "Hub-spoke creates coordinator bottleneck — mesh distributes coordination overhead";
  }
  if (current === "competitive" && target === "pipeline") {
    return "Competitive routing wastes capacity — ordered pipeline improves throughput predictability";
  }
  return `Transitioning from ${current} to ${target} expected to improve coordination efficiency`;
}

// ─── Specialization strategy ──────────────────────────────────────────────────

function buildSpecializationStrategy(
  events: SwarmEvent[],
  emergent: EmergentBehaviorReport,
  report: SwarmHealthReport,
): SpecializationStrategy | null {
  // Only recommend specialization if there are workload imbalances
  if (report.agent_balance > 0.70) return null;

  const agentEvents = groupBy(events, e => e.agent_id);
  const suggestions: SpecializationStrategy["recommended_specializations"] = [];

  for (const [agentId, agentEvs] of Object.entries(agentEvents)) {
    const spec = inferSpecialization(agentId, agentEvs);
    if (spec) suggestions.push({ agent_id: agentId, specialization: spec });
  }

  if (!suggestions.length) return null;

  const currentPattern = suggestions.every(s => s.specialization === suggestions[0].specialization)
    ? "generalist"
    : suggestions.length > 3 ? "specialized" : "mixed";

  return {
    current_pattern: currentPattern,
    recommended_specializations: suggestions.slice(0, 6),
    rationale: `Agent balance at ${Math.round(report.agent_balance * 100)}% — role specialization reduces workload CV`,
    expected_efficiency_gain: round2(Math.max(0.06, (1 - report.agent_balance) * 0.3)),
  };
}

function inferSpecialization(
  agentId: string,
  events: SwarmEvent[],
): SwarmSpecialization | null {
  const id = agentId.toLowerCase();
  if (id.includes("ingest") || id.includes("intake")) return "ingest";
  if (id.includes("transform") || id.includes("process")) return "transform";
  if (id.includes("validat")) return "validate";
  if (id.includes("output") || id.includes("export")) return "output";
  if (id.includes("coordinator") || id.includes("meta")) return "coordination";
  return "generalist";
}

// ─── Governance evolution plan ────────────────────────────────────────────────

function buildGovernanceEvolutionPlan(
  report: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
): GovernanceEvolutionPlan {
  const currentFitness = (report.overall_health + report.orchestration_efficiency) / 2;
  const targetFitness  = Math.min(currentFitness + 0.20, 0.92);

  const steps: string[] = [];

  if (report.retry_pressure < 0.45) {
    steps.push("Step 1: Tighten retry suppression — reduce max retries to 2 with 2× backoff");
  }
  if (report.anomaly_severity < 0.50) {
    steps.push("Step 2: Lower anomaly quarantine threshold from 0.45 to 0.35 for earlier containment");
  }
  if (coherence.coordination_entropy > 0.60) {
    steps.push("Step 3: Introduce coordination scheduling to reduce entropy");
  }
  if (report.agent_balance < 0.55) {
    steps.push("Step 4: Activate workload rebalancing governance rule");
  }
  steps.push("Step 5: Run evolutionary twin to discover next optimal governance genome");

  return {
    current_governance_fitness: round2(currentFitness),
    target_fitness:             round2(targetFitness),
    evolution_steps:            steps,
    expected_generations:       Math.ceil((targetFitness - currentFitness) / 0.04),
  };
}

// ─── Risk outlook ─────────────────────────────────────────────────────────────

function buildRiskOutlook(
  report: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
  emergent: EmergentBehaviorReport,
): RiskOutlook {
  const health  = report.overall_health;
  const stress  = coherence.collective_stress;
  const retryP  = 1 - report.retry_pressure;
  const anomalyP = 1 - report.anomaly_severity;

  const shortTermRiskScore  = (retryP * 0.40) + (anomalyP * 0.35) + (1 - health) * 0.25;
  const mediumTermRiskScore = (stress * 0.40) + (1 - coherence.systemic_resilience) * 0.35 + (1 - health) * 0.25;

  const toRisk = (score: number): RiskOutlook["short_term_risk"] => {
    if (score > 0.70) return "critical";
    if (score > 0.50) return "high";
    if (score > 0.30) return "medium";
    return "low";
  };

  const dominantThreat =
    retryP > 0.55   ? "retry_storm_cascade" :
    anomalyP > 0.50 ? "anomaly_propagation" :
    stress > 0.55   ? "collective_stress_buildup" :
    coherence.coherence_label === "fragmented" ? "coordination_fragmentation" :
    "general_health_drift";

  const mitigationPriority =
    dominantThreat === "retry_storm_cascade"     ? "Suppress retries with exponential backoff immediately" :
    dominantThreat === "anomaly_propagation"      ? "Quarantine anomaly origin zone and throttle propagation" :
    dominantThreat === "collective_stress_buildup" ? "Reduce load and activate governance cooldown" :
    "Apply governance evolution step 1";

  return {
    short_term_risk:    toRisk(shortTermRiskScore),
    medium_term_risk:   toRisk(mediumTermRiskScore),
    dominant_threat:    dominantThreat,
    mitigation_priority: mitigationPriority,
  };
}

// ─── Priority actions ─────────────────────────────────────────────────────────

function buildPriorityActions(
  report: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  topology: TopologyRecommendation | null,
  spec: SpecializationStrategy | null,
): StrategicAction[] {
  const actions: StrategicAction[] = [];

  if (report.retry_pressure < 0.40) {
    actions.push({
      priority: "critical",
      category: "governance",
      headline: "Enforce adaptive retry suppression with 2× exponential backoff + jitter",
      rationale: `Retry pressure at ${Math.round(report.retry_pressure * 100)}% — system is in retry cascade`,
      expected_gain: 0.18,
      time_horizon_ms: 15_000,
    });
  }

  if (report.anomaly_severity < 0.45) {
    actions.push({
      priority: "high",
      category: "resilience",
      headline: "Deploy circuit breaker with predictive quarantine",
      rationale: `Anomaly severity ${Math.round((1 - report.anomaly_severity) * 100)}% — propagation risk growing`,
      expected_gain: 0.14,
      time_horizon_ms: 30_000,
    });
  }

  if (topology) {
    actions.push({
      priority: "high",
      category: "topology",
      headline: `Migrate topology: ${topology.current_archetype} → ${topology.recommended_archetype}`,
      rationale: topology.rationale,
      expected_gain: topology.expected_health_gain,
      time_horizon_ms: 300_000,
    });
  }

  if (spec && spec.expected_efficiency_gain > 0.08) {
    actions.push({
      priority: "medium",
      category: "specialization",
      headline: `Specialize ${spec.recommended_specializations.length} agents by role`,
      rationale: spec.rationale,
      expected_gain: spec.expected_efficiency_gain,
      time_horizon_ms: 180_000,
    });
  }

  if (report.agent_balance < 0.50) {
    actions.push({
      priority: "medium",
      category: "capacity",
      headline: "Add redundant agent to highest-load zone",
      rationale: `Agent balance ${Math.round(report.agent_balance * 100)}% — workload concentration risk`,
      expected_gain: 0.10,
      time_horizon_ms: 60_000,
    });
  }

  if (coherence.systemic_resilience < 0.55) {
    actions.push({
      priority: "medium",
      category: "resilience",
      headline: "Run evolutionary digital twin to discover resilient genome",
      rationale: "Systemic resilience low — evolutionary exploration can surface better configurations",
      expected_gain: 0.12,
      time_horizon_ms: 120_000,
    });
  }

  actions.push({
    priority: "low",
    category: "governance",
    headline: "Schedule governance evolution cycle — apply dominant mutations from last run",
    rationale: "Continuous evolution prevents local fitness maxima",
    expected_gain: 0.06,
    time_horizon_ms: 600_000,
  });

  return actions.slice(0, 6);
}

// ─── Learning objectives ──────────────────────────────────────────────────────

function buildLearningObjectives(
  memory: OperationalMemory,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
): string[] {
  const objectives: string[] = [];

  if (emergent.emergent_retry_pattern.kind === "storm" || emergent.emergent_retry_pattern.kind === "cascading") {
    objectives.push("Learn retry storm propagation patterns to anticipate and block cascades");
  }
  if (emergent.anomaly_propagation.kind === "epidemic" || emergent.anomaly_propagation.kind === "fan_out") {
    objectives.push("Learn anomaly propagation signatures to predict blast radius before it expands");
  }
  if (coherence.coordination_entropy > 0.55) {
    objectives.push("Learn optimal agent sequencing to reduce coordination entropy");
  }
  objectives.push("Accumulate cross-swarm transfer patterns from high-performing configurations");
  objectives.push("Track governance action outcomes to calibrate confidence thresholds");

  return objectives.slice(0, 4);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, T[]> {
  const r: Record<string, T[]> = {};
  for (const x of arr) {
    const k = key(x);
    (r[k] = r[k] ?? []).push(x);
  }
  return r;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
