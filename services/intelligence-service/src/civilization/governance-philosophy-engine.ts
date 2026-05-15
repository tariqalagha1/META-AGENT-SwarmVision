import { v4 as uuidv4 } from 'uuid';
import { SwarmHealthReport } from '../scoring/health-scorer';
import { EmergentBehaviorReport } from '../emergence/types';
import { SwarmCoherenceReport } from '../emergence/types';
import {
  GovernanceIdeology, OptimizationPhilosophy, CoordinationEthic, InterventionPrinciple,
  GovernancePhilosophy, PhilosophyEvolutionResult, GovernanceDoctrine,
} from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const PHILOSOPHY_POPULATION = 5;
const IDEOLOGY_MUTATIONS: GovernanceIdeology[] = [
  'decentralized_autonomy', 'federated_republic', 'hierarchical_mandate',
  'consensus_democracy', 'evolutionary_meritocracy', 'adaptive_anarchy',
];
const OPT_PHILOSOPHIES: OptimizationPhilosophy[] = [
  'throughput_maximalism', 'resilience_first', 'efficiency_balanced',
  'exploration_biased', 'convergence_seeking', 'antifragile_growth',
];
const COORD_ETHICS: CoordinationEthic[] = [
  'cooperative_solidarity', 'competitive_selection', 'reciprocal_exchange',
  'hierarchical_compliance', 'emergent_consensus',
];
const INTERVENTION_PRINCIPLES: InterventionPrinciple[] = [
  'minimal_interference', 'proactive_optimization', 'reactive_stabilization',
  'evolutionary_pressure', 'constitutional_constraint',
];

// ── Fitness scoring ───────────────────────────────────────────────────────────

function scorePhilosophy(
  p: GovernancePhilosophy,
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
): number {
  const h = health.overall_health;
  const retryP  = Math.min((health.total_retries ?? 0) / Math.max(health.total_events ?? 1, 1), 1);
  const anomalyP = health.anomaly_rate ?? 0;

  let score = h * 0.40;

  // Ideology fit
  switch (p.ideology) {
    case 'hierarchical_mandate':
      score += (1 - coherence.coordination_entropy) * 0.20;
      break;
    case 'decentralized_autonomy':
      score += coherence.synchronization_quality * 0.20;
      break;
    case 'evolutionary_meritocracy':
      score += (1 - retryP) * 0.15 + coherence.systemic_resilience * 0.05;
      break;
    case 'consensus_democracy':
      score += coherence.operational_cohesion * 0.20;
      break;
    case 'federated_republic':
      score += coherence.harmony * 0.15 + (1 - anomalyP) * 0.05;
      break;
    case 'adaptive_anarchy':
      score += coherence.systemic_resilience * 0.10 + (1 - coherence.coordination_entropy) * 0.10;
      break;
  }

  // Optimization philosophy fit
  switch (p.optimization_philosophy) {
    case 'resilience_first':
      score += coherence.systemic_resilience * 0.15;
      break;
    case 'throughput_maximalism':
      score += Math.max(0, 1 - retryP - anomalyP) * 0.15;
      break;
    case 'antifragile_growth':
      score += (anomalyP > 0.2 ? coherence.systemic_resilience : 0) * 0.15;
      break;
    case 'efficiency_balanced':
      score += ((1 - retryP) * 0.5 + (1 - anomalyP) * 0.5) * 0.15;
      break;
    case 'exploration_biased':
      score += emergent.coordination_entropy * 0.10 + 0.05;
      break;
    case 'convergence_seeking':
      score += (1 - emergent.coordination_entropy) * 0.15;
      break;
  }

  // Coordination ethic fit
  switch (p.coordination_ethic) {
    case 'cooperative_solidarity':
      score += coherence.operational_cohesion * 0.10;
      break;
    case 'competitive_selection':
      score += emergent.archetype_confidence * 0.08 + 0.02;
      break;
    case 'emergent_consensus':
      score += (emergent.collaboration_archetype === 'consensus' ? 0.12 : 0.04);
      break;
    case 'hierarchical_compliance':
      score += (emergent.collaboration_archetype === 'hub_spoke' ? 0.10 : 0.03);
      break;
    case 'reciprocal_exchange':
      score += coherence.harmony * 0.08;
      break;
  }

  return Math.min(Math.max(score, 0), 1);
}

// ── Mutation ──────────────────────────────────────────────────────────────────

function mutatePhilosophy(
  parent: GovernancePhilosophy,
  generation: number,
): GovernancePhilosophy {
  const mutKind = Math.random();
  let ideology        = parent.ideology;
  let optimization    = parent.optimization_philosophy;
  let coordination    = parent.coordination_ethic;
  let intervention    = parent.intervention_principle;
  let mutationApplied = '';

  if (mutKind < 0.30) {
    ideology = IDEOLOGY_MUTATIONS[Math.floor(Math.random() * IDEOLOGY_MUTATIONS.length)];
    mutationApplied = `ideology→${ideology}`;
  } else if (mutKind < 0.55) {
    optimization = OPT_PHILOSOPHIES[Math.floor(Math.random() * OPT_PHILOSOPHIES.length)];
    mutationApplied = `optimization→${optimization}`;
  } else if (mutKind < 0.75) {
    coordination = COORD_ETHICS[Math.floor(Math.random() * COORD_ETHICS.length)];
    mutationApplied = `coordination→${coordination}`;
  } else {
    intervention = INTERVENTION_PRINCIPLES[Math.floor(Math.random() * INTERVENTION_PRINCIPLES.length)];
    mutationApplied = `intervention→${intervention}`;
  }

  return {
    philosophy_id:          uuidv4(),
    name:                   `${ideology}/${optimization}`,
    ideology,
    optimization_philosophy: optimization,
    coordination_ethic:     coordination,
    intervention_principle: intervention,
    fitness_score:          0,
    generation,
    parent_id:              parent.philosophy_id,
    mutation_applied:       mutationApplied,
    created_at_ms:          Date.now(),
  };
}

function seedPhilosophies(generation: number): GovernancePhilosophy[] {
  const seeds: Array<[GovernanceIdeology, OptimizationPhilosophy, CoordinationEthic, InterventionPrinciple]> = [
    ['federated_republic',       'efficiency_balanced',   'cooperative_solidarity', 'proactive_optimization'],
    ['evolutionary_meritocracy', 'antifragile_growth',    'competitive_selection',  'evolutionary_pressure'],
    ['hierarchical_mandate',     'convergence_seeking',   'hierarchical_compliance','reactive_stabilization'],
    ['decentralized_autonomy',   'exploration_biased',    'emergent_consensus',     'minimal_interference'],
    ['consensus_democracy',      'resilience_first',      'reciprocal_exchange',    'constitutional_constraint'],
  ];

  return seeds.map(([ideology, opt, coord, intervention]) => ({
    philosophy_id:          uuidv4(),
    name:                   `${ideology}/${opt}`,
    ideology,
    optimization_philosophy: opt,
    coordination_ethic:     coord,
    intervention_principle: intervention,
    fitness_score:          0,
    generation,
    parent_id:              null,
    mutation_applied:       null,
    created_at_ms:          Date.now(),
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────

export function evolveGovernancePhilosophy(
  swarmId: string,
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  currentPhilosophy: GovernancePhilosophy | null,
  generation: number,
): PhilosophyEvolutionResult {
  const now = Date.now();

  // Seed or mutate population
  let candidates: GovernancePhilosophy[];
  if (!currentPhilosophy) {
    candidates = seedPhilosophies(generation);
  } else {
    candidates = [currentPhilosophy];
    for (let i = 1; i < PHILOSOPHY_POPULATION; i++) {
      candidates.push(mutatePhilosophy(currentPhilosophy, generation));
    }
  }

  // Score all
  candidates = candidates.map(p => ({
    ...p,
    fitness_score: scorePhilosophy(p, health, emergent, coherence),
  }));

  candidates.sort((a, b) => b.fitness_score - a.fitness_score);

  const dominant   = candidates[0];
  const previous   = currentPhilosophy;
  const fitnessDelta = previous
    ? dominant.fitness_score - previous.fitness_score
    : dominant.fitness_score;

  const ideologyShift = previous ? previous.ideology !== dominant.ideology : false;

  // Generate insights
  const insights: string[] = [];
  if (ideologyShift) {
    insights.push(`Ideology shift: ${previous?.ideology} → ${dominant.ideology} (+${(fitnessDelta * 100).toFixed(1)}% fitness)`);
  }
  if (dominant.optimization_philosophy === 'antifragile_growth' && coherence.collective_stress > 0.4) {
    insights.push('Antifragile growth philosophy activated under collective stress — stress becomes fuel');
  }
  if (dominant.ideology === 'evolutionary_meritocracy') {
    insights.push('Meritocratic selection pressure engaged — governance roles determined by performance');
  }
  if (coherence.harmony > 0.70 && dominant.ideology === 'consensus_democracy') {
    insights.push('High harmony enables consensus democracy — collective decision quality optimal');
  }
  if (fitnessDelta > 0.08) {
    insights.push(`Philosophy evolution yielded significant fitness gain: +${(fitnessDelta * 100).toFixed(1)}%`);
  }

  return {
    swarm_id:            swarmId,
    evolved_at_ms:       now,
    candidate_philosophies: candidates,
    dominant_philosophy: dominant,
    retired_philosophy:  previous && ideologyShift ? previous : null,
    fitness_delta:       fitnessDelta,
    ideology_shift:      ideologyShift,
    evolution_insights:  insights,
  };
}

export function buildGovernanceDoctrine(
  swarmId: string,
  philosophy: GovernancePhilosophy,
  coherence: SwarmCoherenceReport,
  formedAtMs: number,
): GovernanceDoctrine {
  const rules: string[] = [];

  switch (philosophy.ideology) {
    case 'hierarchical_mandate':
      rules.push('Central coordinator has final authority on all routing decisions');
      rules.push('Agents must acknowledge handoff commands within 200ms or escalate');
      break;
    case 'decentralized_autonomy':
      rules.push('Each agent makes local decisions independently');
      rules.push('Coordination is opt-in; no agent may block another');
      break;
    case 'federated_republic':
      rules.push('Swarm alliances require mutual consent from sovereign members');
      rules.push('Inter-swarm disputes resolved by treaty arbitration');
      break;
    case 'consensus_democracy':
      rules.push('Governance decisions require >50% participating agent agreement');
      rules.push('Emergency actions require unanimous consent from active agents');
      break;
    case 'evolutionary_meritocracy':
      rules.push('High-fitness agents earn expanded routing authority each generation');
      rules.push('Under-performing agents are reassigned, not penalized');
      break;
    case 'adaptive_anarchy':
      rules.push('No fixed roles — agents self-select tasks by capacity signal');
      rules.push('Governance emerges from aggregate behavior, not explicit rules');
      break;
  }

  switch (philosophy.intervention_principle) {
    case 'minimal_interference':
      rules.push('Intervention threshold: health < 0.30 only');
      break;
    case 'proactive_optimization':
      rules.push('Continuous micro-interventions at health < 0.65');
      break;
    case 'constitutional_constraint':
      rules.push('All interventions must match pre-defined constitutional cases');
      break;
    case 'evolutionary_pressure':
      rules.push('Interventions create selection pressure — failures are learning signals');
      break;
    case 'reactive_stabilization':
      rules.push('Intervene immediately upon detecting health degradation > 15%');
      break;
  }

  const priorityWeights: Record<string, number> = {
    health:      philosophy.optimization_philosophy === 'resilience_first' ? 0.45 : 0.35,
    throughput:  philosophy.optimization_philosophy === 'throughput_maximalism' ? 0.40 : 0.25,
    entropy:     philosophy.optimization_philosophy === 'convergence_seeking' ? 0.20 : 0.10,
    resilience:  philosophy.optimization_philosophy === 'antifragile_growth' ? 0.30 : 0.15,
    exploration: philosophy.optimization_philosophy === 'exploration_biased' ? 0.25 : 0.10,
    efficiency:  philosophy.optimization_philosophy === 'efficiency_balanced' ? 0.35 : 0.20,
  };

  const resilienceStrategy =
    philosophy.optimization_philosophy === 'antifragile_growth'
      ? 'Absorb failures as evolutionary signal; do not suppress anomalies'
      : philosophy.optimization_philosophy === 'resilience_first'
        ? 'Prioritize system stability over throughput maximization'
        : 'Balance fault tolerance with operational throughput';

  return {
    doctrine_id:         uuidv4(),
    swarm_id:            swarmId,
    philosophy,
    resilience_strategy: resilienceStrategy,
    intervention_rules:  rules,
    priority_weights:    priorityWeights,
    doctrine_age_ms:     Date.now() - formedAtMs,
    doctrine_stability:  coherence.harmony * 0.60 + (1 - coherence.collective_stress) * 0.40,
  };
}
