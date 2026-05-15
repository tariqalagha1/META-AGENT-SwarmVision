import { SwarmHealthReport } from "../types";
import { EmergentBehaviorReport, SwarmCoherenceReport, CollectiveConsciousnessSignal } from "./types";

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeConsciousnessSignal(
  swarmId: string,
  report: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  evolutionGeneration: number,
): CollectiveConsciousnessSignal {
  const globalConfidence  = computeGlobalConfidence(report, coherence);
  const orgTension        = computeOrganizationalTension(report, coherence);
  const collectiveStab    = computeCollectiveStability(coherence, report);
  const orchHarmony       = computeOrchestrationHarmony(emergent, coherence);
  const evoReadiness      = computeEvolutionaryReadiness(evolutionGeneration, report, coherence);
  const emergenceIndex    = computeEmergenceIndex(emergent, coherence, report);

  const label = deriveLabel(globalConfidence, orgTension, evoReadiness, emergenceIndex);

  return {
    swarm_id:                swarmId,
    computed_at_ms:          Date.now(),
    global_swarm_confidence: round2(globalConfidence),
    organizational_tension:  round2(orgTension),
    collective_stability:    round2(collectiveStab),
    orchestration_harmony:   round2(orchHarmony),
    evolutionary_readiness:  round2(evoReadiness),
    emergence_index:         round2(emergenceIndex),
    consciousness_label:     label,
  };
}

// ─── Dimensions ───────────────────────────────────────────────────────────────

function computeGlobalConfidence(
  report: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
): number {
  return clamp01(
    report.overall_health        * 0.35 +
    report.orchestration_efficiency * 0.25 +
    coherence.harmony            * 0.25 +
    coherence.systemic_resilience * 0.15,
  );
}

function computeOrganizationalTension(
  report: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
): number {
  return clamp01(
    coherence.collective_stress * 0.40 +
    (1 - report.retry_pressure) * 0.30 +
    (1 - report.anomaly_severity) * 0.20 +
    coherence.coordination_entropy * 0.10,
  );
}

function computeCollectiveStability(
  coherence: SwarmCoherenceReport,
  report: SwarmHealthReport,
): number {
  return clamp01(
    coherence.harmony               * 0.30 +
    coherence.systemic_resilience   * 0.30 +
    coherence.synchronization_quality * 0.20 +
    report.throughput_stability     * 0.20,
  );
}

function computeOrchestrationHarmony(
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
): number {
  const archetypeBonus: Partial<Record<string, number>> = {
    mesh:       0.85,
    hub_spoke:  0.75,
    pipeline:   0.70,
    consensus:  0.65,
    competitive: 0.50,
    emergent_hybrid: 0.60,
  };
  const archetypeScore = archetypeBonus[emergent.collaboration_archetype] ?? 0.60;
  return clamp01(
    archetypeScore * 0.40 +
    emergent.synchronization_quality * 0.35 +
    coherence.operational_cohesion * 0.25,
  );
}

function computeEvolutionaryReadiness(
  generation: number,
  report: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
): number {
  // High readiness: stable health + significant generation depth
  const genBonus = Math.min(generation * 0.05, 0.40);
  const healthBonus = report.overall_health > 0.65 ? 0.30 : 0.10;
  const stabilityBonus = coherence.coherence_label === "cohesive" ? 0.30 : 0.10;
  return clamp01(genBonus + healthBonus + stabilityBonus);
}

function computeEmergenceIndex(
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  report: SwarmHealthReport,
): number {
  // Emergence = deviation from baseline/predictable behavior
  const cultureBonus: Partial<Record<string, number>> = {
    adaptive:         0.70,
    agile_recovery:   0.60,
    high_reliability: 0.40,
    brittle_efficient: 0.45,
    conservative:     0.20,
    chaotic:          0.30,
  };
  const cultureScore = cultureBonus[emergent.operational_culture] ?? 0.40;
  const syncVariance = 1 - emergent.synchronization_quality;  // more variance = more emergence
  return clamp01(
    cultureScore * 0.40 +
    syncVariance * 0.30 +
    emergent.coordination_entropy * 0.30,
  );
}

// ─── Label ────────────────────────────────────────────────────────────────────

function deriveLabel(
  confidence: number,
  tension: number,
  evoReadiness: number,
  emergenceIndex: number,
): CollectiveConsciousnessSignal["consciousness_label"] {
  if (evoReadiness > 0.65 && emergenceIndex > 0.55) return "evolving";
  if (emergenceIndex > 0.55 && confidence > 0.60)   return "adaptive";
  if (confidence > 0.55 && tension < 0.35)           return "active";
  if (confidence > 0.40)                             return "aware";
  return "dormant";
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
