import { SwarmHealthReport } from '../scoring/health-scorer';
import { EmergentBehaviorReport } from '../emergence/types';
import { SwarmCoherenceReport } from '../emergence/types';
import { EvolutionResult } from '../emergence/types';
import {
  MetaStrategicReport, StrategicDriftAnalysis, StrategicDriftKind,
  IdeologyFitnessReport, GovernanceIdeology,
} from './types';
import { CivilizationalMemoryState } from './types';
import { GovernancePhilosophy } from './types';

// ── Ideology fitness matrix ───────────────────────────────────────────────────

function scoreIdeologyInContext(
  ideology: GovernanceIdeology,
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
): { fitness: number; contextFit: number } {
  const h  = health.overall_health;
  const r  = Math.min((health.total_retries ?? 0) / Math.max(health.total_events ?? 1, 1), 1);
  const a  = health.anomaly_rate ?? 0;
  const ent = emergent.coordination_entropy;
  const coh = coherence.operational_cohesion;

  let fitness = 0;
  let contextFit = 0;

  switch (ideology) {
    case 'hierarchical_mandate':
      fitness    = h * 0.45 + (1 - ent) * 0.35 + coh * 0.20;
      contextFit = a < 0.15 && ent < 0.40 ? 0.85 : 0.45;
      break;
    case 'decentralized_autonomy':
      fitness    = h * 0.35 + emergent.synchronization_quality * 0.35 + (1 - r) * 0.30;
      contextFit = ent > 0.35 && coh > 0.55 ? 0.80 : 0.50;
      break;
    case 'federated_republic':
      fitness    = h * 0.40 + coherence.harmony * 0.35 + (1 - a) * 0.25;
      contextFit = h > 0.55 && coherence.harmony > 0.50 ? 0.78 : 0.52;
      break;
    case 'consensus_democracy':
      fitness    = h * 0.35 + coh * 0.35 + coherence.systemic_resilience * 0.30;
      contextFit = coh > 0.60 && emergent.collaboration_archetype === 'consensus' ? 0.88 : 0.48;
      break;
    case 'evolutionary_meritocracy':
      fitness    = h * 0.40 + (1 - r) * 0.30 + coherence.systemic_resilience * 0.30;
      contextFit = h > 0.60 && r < 0.20 ? 0.82 : 0.55;
      break;
    case 'adaptive_anarchy':
      fitness    = coherence.systemic_resilience * 0.40 + h * 0.30 + ent * 0.30;
      contextFit = ent > 0.50 || a > 0.25 ? 0.72 : 0.38;
      break;
  }

  return { fitness: Math.min(Math.max(fitness, 0), 1), contextFit };
}

function scoreIdeologyFitness(
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  currentPhilosophy: GovernancePhilosophy | null,
): IdeologyFitnessReport {
  const all: GovernanceIdeology[] = [
    'decentralized_autonomy', 'federated_republic', 'hierarchical_mandate',
    'consensus_democracy', 'evolutionary_meritocracy', 'adaptive_anarchy',
  ];

  const scores = all.map(ideology => {
    const { fitness, contextFit } = scoreIdeologyInContext(ideology, health, emergent, coherence);
    return { ideology, fitness, context_fit: contextFit, trajectory: 'stable' as 'rising' | 'stable' | 'declining' };
  });

  scores.sort((a, b) => b.fitness - a.fitness);

  const optimal  = scores[0].ideology;
  const current  = currentPhilosophy?.ideology ?? 'evolutionary_meritocracy';
  const currentScore = scores.find(s => s.ideology === current)?.fitness ?? 0;
  const optimalScore = scores[0].fitness;
  const gap = optimalScore - currentScore;

  // Trajectory based on gap
  for (const s of scores) {
    if (s.ideology === current) s.trajectory = gap > 0.12 ? 'declining' : 'stable';
    else if (s.ideology === optimal) s.trajectory = gap > 0.08 ? 'rising' : 'stable';
  }

  return {
    evaluated_at_ms:  Date.now(),
    ideology_scores:  scores,
    optimal_ideology: optimal,
    current_ideology: current,
    ideology_gap:     gap,
  };
}

// ── Drift analysis ────────────────────────────────────────────────────────────

function analyzeDrift(
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  civMemory: CivilizationalMemoryState,
  evolution: EvolutionResult | null,
  ideologyGap: number,
): StrategicDriftAnalysis {
  const now = Date.now();
  const h   = health.overall_health;
  const a   = health.anomaly_rate ?? 0;
  const wisdom = civMemory.civilizational_wisdom;

  let driftKind: StrategicDriftKind = 'healthy_adaptation';
  let driftMagnitude = 0;
  const affected: string[] = [];
  const rootCauses: string[] = [];

  // Prioritized drift detection
  if (h < 0.30 && a > 0.30) {
    driftKind      = 'ecosystem_fragility';
    driftMagnitude = 0.70 + a * 0.30;
    affected.push('health', 'anomaly_rate', 'resilience');
    rootCauses.push('Compound failure: low health + high anomaly rate');
  } else if (ideologyGap > 0.20) {
    driftKind      = 'ideological_drift';
    driftMagnitude = ideologyGap;
    affected.push('ideology', 'governance_decisions', 'philosophy_fitness');
    rootCauses.push(`Current ideology diverging from optimal by ${(ideologyGap * 100).toFixed(0)}%`);
  } else if (coherence.coordination_entropy > 0.65) {
    driftKind      = 'structural_fragmentation';
    driftMagnitude = coherence.coordination_entropy;
    affected.push('coordination', 'entropy', 'cohesion');
    rootCauses.push('Coordination entropy exceeds structural cohesion threshold');
  } else if (evolution && evolution.converged && evolution.best_genome.fitness_score < 0.55) {
    driftKind      = 'evolutionary_stagnation';
    driftMagnitude = 1 - evolution.best_genome.fitness_score;
    affected.push('evolution', 'genome_fitness', 'mutation_diversity');
    rootCauses.push('Evolutionary convergence at suboptimal fitness — diversity exhausted');
  } else if (wisdom < 0.15 && civMemory.total_eras > 3) {
    driftKind      = 'knowledge_decay';
    driftMagnitude = 0.60;
    affected.push('civilizational_wisdom', 'pattern_memory', 'adaptation_history');
    rootCauses.push('Civilizational wisdom declining relative to era count');
  } else if (h > 0.65 && coherence.harmony > 0.65) {
    driftKind      = 'healthy_adaptation';
    driftMagnitude = 0.10;
    affected.push('none');
  } else {
    driftKind      = 'governance_ossification';
    driftMagnitude = (1 - coherence.systemic_resilience) * 0.6;
    affected.push('governance_flexibility', 'adaptation_rate');
    rootCauses.push('Governance response lagging operational change rate');
  }

  const driftVelocity = driftMagnitude * 0.08;  // per epoch approximation

  const interventionPriority: StrategicDriftAnalysis['intervention_priority'] =
    driftMagnitude > 0.65 ? 'critical' :
    driftMagnitude > 0.40 ? 'intervene' :
    driftMagnitude > 0.20 ? 'monitor' : 'none';

  // Correction window: how many ms before drift becomes irreversible
  const correctionWindowMs = driftMagnitude > 0.60 ? 30_000 :
    driftMagnitude > 0.40 ? 90_000 : 300_000;

  return {
    swarm_id:               health.swarm_id ?? 'unknown',
    analyzed_at_ms:         now,
    drift_kind:             driftKind,
    drift_magnitude:        driftMagnitude,
    drift_velocity:         driftVelocity,
    affected_dimensions:    affected,
    root_causes:            rootCauses,
    correction_window_ms:   correctionWindowMs,
    intervention_priority:  interventionPriority,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildMetaStrategicReport(
  swarmId: string,
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  civMemory: CivilizationalMemoryState,
  evolution: EvolutionResult | null,
  currentPhilosophy: GovernancePhilosophy | null,
): MetaStrategicReport {
  const now = Date.now();
  const h   = health.overall_health;
  const a   = health.anomaly_rate ?? 0;

  const ideologyFitness = scoreIdeologyFitness(health, emergent, coherence, currentPhilosophy);
  const drift = analyzeDrift(health, emergent, coherence, civMemory, evolution, ideologyFitness.ideology_gap);

  // Ecosystem fragility
  const fragility =
    (1 - h) * 0.35 +
    a * 0.25 +
    (1 - coherence.systemic_resilience) * 0.25 +
    coherence.collective_stress * 0.15;

  // Governance sustainability
  const sustainability =
    coherence.harmony * 0.35 +
    (1 - drift.drift_magnitude) * 0.30 +
    civMemory.civilizational_wisdom * 0.20 +
    (1 - ideologyFitness.ideology_gap) * 0.15;

  // Long-term resilience forecast
  const ltResilience = Math.max(0,
    coherence.systemic_resilience * 0.40 +
    civMemory.civilizational_wisdom * 0.30 +
    (evolution ? evolution.best_genome.fitness_score * 0.30 : 0.15)
  );

  // Strategic evolution stage
  const stage: MetaStrategicReport['strategic_evolution_stage'] =
    civMemory.total_eras >= 5 && h > 0.75 && sustainability > 0.70 ? 'transcendent' :
    civMemory.total_eras >= 3 && h > 0.60 && sustainability > 0.55 ? 'mature' :
    civMemory.total_eras >= 1 && h > 0.45 ? 'developing' : 'nascent';

  const riskLevel: MetaStrategicReport['civilizational_risk_level'] =
    fragility > 0.70 ? 'existential' :
    fragility > 0.50 ? 'high' :
    fragility > 0.30 ? 'elevated' : 'low';

  const insights: string[] = [];
  if (ideologyFitness.ideology_gap > 0.15) {
    insights.push(`Ideology misalignment detected: ${ideologyFitness.current_ideology} is ${(ideologyFitness.ideology_gap * 100).toFixed(0)}% below optimal (${ideologyFitness.optimal_ideology})`);
  }
  if (civMemory.total_eras > 1) {
    insights.push(`Civilization has traversed ${civMemory.total_eras} eras — wisdom score: ${(civMemory.civilizational_wisdom * 100).toFixed(0)}%`);
  }
  if (drift.drift_kind !== 'healthy_adaptation') {
    insights.push(`Strategic drift detected: ${drift.drift_kind} at magnitude ${(drift.drift_magnitude * 100).toFixed(0)}%`);
  }
  if (stage === 'transcendent') {
    insights.push('System has reached transcendent strategic maturity — meta-cognitive governance active');
  }
  if (sustainability > 0.75) {
    insights.push('Governance sustainability excellent — civilization on sustainable trajectory');
  }

  return {
    swarm_id:                      swarmId,
    generated_at_ms:               now,
    strategic_evolution_stage:     stage,
    drift_analysis:                drift,
    ideology_fitness:              ideologyFitness,
    ecosystem_fragility_score:     fragility,
    governance_sustainability:     sustainability,
    long_term_resilience_forecast: ltResilience,
    meta_insights:                 insights,
    civilizational_risk_level:     riskLevel,
  };
}
