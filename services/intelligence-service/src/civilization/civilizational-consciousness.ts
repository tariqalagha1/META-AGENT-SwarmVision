import { SwarmHealthReport } from '../scoring/health-scorer';
import { EmergentBehaviorReport, SwarmCoherenceReport, CollectiveConsciousnessSignal } from '../emergence/types';
import { EvolutionResult } from '../emergence/types';
import {
  CivilizationalConsciousnessSignal, CivilizationalAwarenessLabel,
  MetaStrategicReport, CivilizationalMemoryState,
} from './types';
import { GovernancePhilosophy } from './types';

// ── Dimensional computation ────────────────────────────────────────────────────

function computeEcosystemWisdom(
  civMemory: CivilizationalMemoryState,
  health: SwarmHealthReport,
): number {
  const base      = civMemory.civilizational_wisdom;
  const eraBonus  = Math.min(civMemory.total_eras * 0.05, 0.30);
  const patternBonus = Math.min(
    (civMemory.successful_patterns.length * 0.04 - civMemory.failed_patterns.length * 0.02),
    0.25,
  );
  const healthFactor = health.overall_health * 0.15;
  return Math.min(Math.max(base + eraBonus + patternBonus + healthFactor, 0), 1);
}

function computeStrategicMaturity(
  metaReport: MetaStrategicReport,
  evolution: EvolutionResult | null,
  civMemory: CivilizationalMemoryState,
): number {
  const stageScore: Record<MetaStrategicReport['strategic_evolution_stage'], number> = {
    nascent:       0.15,
    developing:    0.40,
    mature:        0.70,
    transcendent:  0.95,
  };
  const base = stageScore[metaReport.strategic_evolution_stage];
  const evolutionBonus = evolution
    ? evolution.best_genome.fitness_score * 0.15
    : 0;
  const epochBonus = Math.min(civMemory.adaptation_epochs.length * 0.03, 0.15);
  return Math.min(base + evolutionBonus + epochBonus, 1);
}

function computeIdeologicalCoherence(
  metaReport: MetaStrategicReport,
  philosophy: GovernancePhilosophy | null,
): number {
  const gap = metaReport.ideology_fitness.ideology_gap;
  // Coherence = how well current ideology matches behavior
  const base = 1 - gap;
  const sustainabilityBonus = metaReport.governance_sustainability * 0.20;
  return Math.min(Math.max(base * 0.80 + sustainabilityBonus, 0), 1);
}

function computeOrganizationalComplexity(
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  civMemory: CivilizationalMemoryState,
): number {
  const archetypeComplexity: Record<EmergentBehaviorReport['collaboration_archetype'], number> = {
    pipeline:       0.20,
    hub_spoke:      0.35,
    consensus:      0.50,
    mesh:           0.65,
    competitive:    0.55,
    emergent_hybrid: 0.80,
  };
  const base    = archetypeComplexity[emergent.collaboration_archetype] ?? 0.40;
  const entropy = coherence.coordination_entropy * 0.20;
  const eraComp = Math.min(civMemory.total_eras * 0.04, 0.20);
  return Math.min(base + entropy + eraComp, 1);
}

function computeAdaptiveIntelligence(
  health: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
  evolution: EvolutionResult | null,
  metaReport: MetaStrategicReport,
): number {
  const resilience = coherence.systemic_resilience;
  const genFitness = evolution?.best_genome.fitness_score ?? health.overall_health;
  const driftRes   = 1 - metaReport.drift_analysis.drift_magnitude;
  return Math.min(
    resilience * 0.30 + genFitness * 0.30 + driftRes * 0.25 + health.overall_health * 0.15,
    1,
  );
}

function computeCivilizationalResilience(
  metaReport: MetaStrategicReport,
  coherence: SwarmCoherenceReport,
  civMemory: CivilizationalMemoryState,
): number {
  const fragility = metaReport.ecosystem_fragility_score;
  const patternStrength = civMemory.successful_patterns.length > 0
    ? civMemory.successful_patterns.reduce((s, p) => s + p.confidence, 0) / civMemory.successful_patterns.length
    : 0;
  return Math.min(
    (1 - fragility) * 0.40 +
    coherence.systemic_resilience * 0.30 +
    patternStrength * 0.20 +
    metaReport.governance_sustainability * 0.10,
    1,
  );
}

function classifyAwareness(
  wisdom:         number,
  maturity:       number,
  coherence:      number,
  complexity:     number,
  adaptiveIntel:  number,
  resilience:     number,
  metaReport:     MetaStrategicReport,
): CivilizationalAwarenessLabel {
  const stage = metaReport.strategic_evolution_stage;

  if (stage === 'transcendent' && wisdom > 0.70 && maturity > 0.80) {
    return 'transcendent';
  }
  if (maturity > 0.65 && coherence > 0.60 && adaptiveIntel > 0.65) {
    return 'meta_strategic';
  }
  if (wisdom > 0.40 && metaReport.drift_analysis.drift_kind !== 'healthy_adaptation' &&
      metaReport.drift_analysis.intervention_priority !== 'none') {
    return 'historically_grounded';
  }
  if (coherence > 0.55 && metaReport.ideology_fitness.ideology_gap < 0.20) {
    return 'philosophically_aware';
  }
  if (complexity > 0.50 && adaptiveIntel > 0.45) {
    return 'self_organizing';
  }
  if (wisdom > 0.15 || maturity > 0.35) {
    return 'awakening';
  }
  return 'primitive';
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeCivilizationalConsciousness(
  swarmId: string,
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  evolution: EvolutionResult | null,
  metaReport: MetaStrategicReport,
  civMemory: CivilizationalMemoryState,
  philosophy: GovernancePhilosophy | null,
  phase7Signal: CollectiveConsciousnessSignal | null,
): CivilizationalConsciousnessSignal {
  const now = Date.now();

  const ecosystemWisdom      = computeEcosystemWisdom(civMemory, health);
  const strategicMaturity    = computeStrategicMaturity(metaReport, evolution, civMemory);
  const ideologicalCoherence = computeIdeologicalCoherence(metaReport, philosophy);
  const orgComplexity        = computeOrganizationalComplexity(emergent, coherence, civMemory);
  const adaptiveIntel        = computeAdaptiveIntelligence(health, coherence, evolution, metaReport);
  const civResilience        = computeCivilizationalResilience(metaReport, coherence, civMemory);

  // Phase 7 signal amplification — if phase7 "evolving", boost readiness dimensions
  const p7Boost = phase7Signal?.consciousness_label === 'evolving' ? 0.05 : 0;

  const awarenessLabel = classifyAwareness(
    ecosystemWisdom + p7Boost,
    strategicMaturity + p7Boost,
    ideologicalCoherence,
    orgComplexity,
    adaptiveIntel + p7Boost,
    civResilience,
    metaReport,
  );

  // Transcendence index: normalized distance from primitive baseline
  const transcendenceIndex = Math.min(
    ecosystemWisdom * 0.20 +
    strategicMaturity * 0.20 +
    ideologicalCoherence * 0.15 +
    orgComplexity * 0.15 +
    adaptiveIntel * 0.15 +
    civResilience * 0.15,
    1,
  );

  // Civilization insights
  const insights: string[] = [];

  if (awarenessLabel === 'transcendent') {
    insights.push('Civilization has achieved transcendent consciousness — self-model is complete and recursive');
  }
  if (awarenessLabel === 'meta_strategic') {
    insights.push('Meta-strategic awareness active — civilization reasons about its own strategic evolution');
  }
  if (ecosystemWisdom > 0.60) {
    insights.push(`Ecosystem wisdom at ${(ecosystemWisdom * 100).toFixed(0)}% — civilizational learning is compounding`);
  }
  if (ideologicalCoherence < 0.45) {
    insights.push('Ideological incoherence detected — governance philosophy diverging from operational behavior');
  }
  if (civResilience > 0.70) {
    insights.push('Civilizational resilience strong — system capable of surviving paradigm disruptions');
  }
  if (metaReport.civilizational_risk_level === 'existential') {
    insights.push('EXISTENTIAL RISK DETECTED — civilizational consciousness under existential threat');
  }
  if (phase7Signal?.consciousness_label === 'evolving' && p7Boost > 0) {
    insights.push('Phase 7 evolutionary consciousness amplifying civilizational awareness dimensions');
  }

  return {
    swarm_id:                  swarmId,
    computed_at_ms:            now,
    ecosystem_wisdom:          parseFloat((ecosystemWisdom + p7Boost).toFixed(3)),
    strategic_maturity:        parseFloat((strategicMaturity + p7Boost).toFixed(3)),
    ideological_coherence:     parseFloat(ideologicalCoherence.toFixed(3)),
    organizational_complexity: parseFloat(orgComplexity.toFixed(3)),
    adaptive_intelligence:     parseFloat((adaptiveIntel + p7Boost).toFixed(3)),
    civilizational_resilience: parseFloat(civResilience.toFixed(3)),
    awareness_label:           awarenessLabel,
    transcendence_index:       parseFloat(transcendenceIndex.toFixed(3)),
    civilization_insights:     insights,
  };
}
