import { v4 as uuidv4 } from 'uuid';
import { SwarmHealthReport } from '../scoring/health-scorer';
import { EmergentBehaviorReport } from '../emergence/types';
import { SwarmCoherenceReport } from '../emergence/types';
import {
  CivilizationBranch, CivilizationTwinResult, GovernanceIdeology,
} from './types';
import { CivilizationalMemoryState } from './types';
import { GovernancePhilosophy } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BRANCHES   = 10;
const PRUNE_THRESHOLD = 0.38;
const ERAS_PER_HORIZON = 12;

// Ideology health drift rates per simulated era
const IDEOLOGY_DRIFT: Record<GovernanceIdeology, number> = {
  federated_republic:       +0.012,
  evolutionary_meritocracy: +0.010,
  consensus_democracy:      +0.008,
  hierarchical_mandate:     +0.006,
  decentralized_autonomy:   +0.004,
  adaptive_anarchy:         -0.003,
};

// Collapse risk multipliers
const IDEOLOGY_COLLAPSE_RISK: Record<GovernanceIdeology, number> = {
  adaptive_anarchy:         0.35,
  hierarchical_mandate:     0.25,
  decentralized_autonomy:   0.20,
  federated_republic:       0.12,
  consensus_democracy:      0.10,
  evolutionary_meritocracy: 0.08,
};

// Golden age probability modifiers
const IDEOLOGY_GOLDEN: Record<GovernanceIdeology, number> = {
  evolutionary_meritocracy: 0.40,
  federated_republic:       0.35,
  consensus_democracy:      0.30,
  hierarchical_mandate:     0.20,
  decentralized_autonomy:   0.18,
  adaptive_anarchy:         0.15,
};

// ── Health trajectory simulation ──────────────────────────────────────────────

function simulateCivilizationTrajectory(
  seedHealth: number,
  ideology: GovernanceIdeology,
  coherenceBase: number,
  wisdomBonus: number,
  eras: number,
): number[] {
  const traj: number[] = [];
  let h = seedHealth;
  const drift = IDEOLOGY_DRIFT[ideology];

  for (let i = 0; i < eras; i++) {
    h += drift;
    h += (coherenceBase - 0.5) * 0.006;
    h += wisdomBonus * 0.004;
    // Bounded noise ± 0.018
    h += (Math.sin(i * 1.618 + ideology.length) * 0.018);
    // Mean-reversion toward 0.60
    h += (0.60 - h) * 0.02;
    h = Math.min(Math.max(h, 0.05), 0.99);
    traj.push(parseFloat(h.toFixed(3)));
  }
  return traj;
}

function computeCollapseProbability(
  traj: number[],
  ideology: GovernanceIdeology,
): number {
  const base = IDEOLOGY_COLLAPSE_RISK[ideology];
  const minH  = Math.min(...traj);
  const lowEraCount = traj.filter(h => h < 0.35).length;
  return Math.min(
    base + (lowEraCount / traj.length) * 0.40 + (1 - minH) * 0.15,
    0.95,
  );
}

function computeGoldenAgeProbability(
  traj: number[],
  ideology: GovernanceIdeology,
): number {
  const base = IDEOLOGY_GOLDEN[ideology];
  const highEraCount = traj.filter(h => h > 0.78).length;
  return Math.min(base + (highEraCount / traj.length) * 0.30, 0.95);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function runCivilizationTwin(
  swarmId: string,
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  civMemory: CivilizationalMemoryState,
  currentPhilosophy: GovernancePhilosophy | null,
  horizonLabel: CivilizationTwinResult['horizon_label'] = 'generation',
): CivilizationTwinResult {
  const now = Date.now();
  const seedH   = health.overall_health;
  const wisdom  = civMemory.civilizational_wisdom;

  const eraCount = horizonLabel === 'decade'     ? 6  :
                   horizonLabel === 'generation' ? 12 : 20;

  const allIdeologies: GovernanceIdeology[] = [
    'federated_republic', 'evolutionary_meritocracy', 'consensus_democracy',
    'hierarchical_mandate', 'decentralized_autonomy', 'adaptive_anarchy',
  ];

  const branches: CivilizationBranch[] = [];

  for (const ideology of allIdeologies) {
    if (branches.length >= MAX_BRANCHES) break;

    const traj = simulateCivilizationTrajectory(
      seedH, ideology, coherence.harmony, wisdom, eraCount,
    );
    const peakH   = Math.max(...traj);
    const troughH = Math.min(...traj);
    const simFitness = traj.reduce((s, h) => s + h, 0) / traj.length;

    branches.push({
      branch_id:            uuidv4(),
      ideology,
      governance_doctrine:  `${ideology}_doctrine_gen${civMemory.total_eras + 1}`,
      simulated_era_count:  eraCount,
      health_trajectory:    traj,
      peak_health:          peakH,
      trough_health:        troughH,
      collapse_probability: computeCollapseProbability(traj, ideology),
      golden_age_probability: computeGoldenAgeProbability(traj, ideology),
      selected:             false,
      pruned_reason:        null,
    });
  }

  // Prune low-fitness branches
  const surviving: CivilizationBranch[] = [];
  for (const b of branches) {
    const avgH = b.health_trajectory.reduce((s, h) => s + h, 0) / b.health_trajectory.length;
    if (avgH < PRUNE_THRESHOLD) {
      b.pruned_reason = `Mean simulated health ${avgH.toFixed(2)} below prune threshold ${PRUNE_THRESHOLD}`;
      surviving.push(b);  // include but marked pruned
    } else {
      b.selected = true;
      surviving.push(b);
    }
  }

  // Rank survivors by composite score: avg health - collapse_prob + golden_prob
  const selected = surviving.filter(b => b.selected);
  selected.sort((a, b) => {
    const scoreA = (a.health_trajectory.reduce((s, h) => s + h, 0) / a.health_trajectory.length)
      - a.collapse_probability * 0.40 + a.golden_age_probability * 0.20;
    const scoreB = (b.health_trajectory.reduce((s, h) => s + h, 0) / b.health_trajectory.length)
      - b.collapse_probability * 0.40 + b.golden_age_probability * 0.20;
    return scoreB - scoreA;
  });

  const optimal = selected[0] ?? surviving[0];

  // Build institutional collapse scenarios
  const collapseScenarios: string[] = [];
  const fragile = surviving.filter(b => b.collapse_probability > 0.50);
  for (const b of fragile) {
    collapseScenarios.push(
      `Under ${b.ideology}: ${(b.collapse_probability * 100).toFixed(0)}% collapse probability — trough health ${b.trough_health.toFixed(2)}`
    );
  }

  // Build ecosystem adaptation forecast
  const adaptationForecast: string[] = [];
  if (optimal.golden_age_probability > 0.35) {
    adaptationForecast.push(`${optimal.ideology} trajectory: golden age probability ${(optimal.golden_age_probability * 100).toFixed(0)}% — conditions favorable`);
  }
  const wisdomGrowth = Math.min(wisdom + eraCount * 0.04, 1);
  adaptationForecast.push(`Civilizational wisdom projected to reach ${(wisdomGrowth * 100).toFixed(0)}% over ${eraCount} simulated eras`);
  if (civMemory.successful_patterns.length > 0) {
    adaptationForecast.push(`${civMemory.successful_patterns.length} confirmed success pattern(s) available for re-activation`);
  }

  // Ideology survival ranking
  const ideologyRanking = surviving
    .filter(b => b.selected)
    .map(b => ({
      ideology:       b.ideology,
      survival_score: 1 - b.collapse_probability,
    }))
    .sort((a, b) => b.survival_score - a.survival_score);

  return {
    swarm_id:                         swarmId,
    simulated_at_ms:                  now,
    horizon_label:                    horizonLabel,
    branches_explored:                branches.length,
    surviving_branches:               surviving,
    optimal_branch:                   optimal,
    institutional_collapse_scenarios: collapseScenarios,
    ecosystem_adaptation_forecast:    adaptationForecast,
    ideology_survival_ranking:        ideologyRanking,
  };
}
