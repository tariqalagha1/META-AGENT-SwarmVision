import { v4 as uuidv4 } from 'uuid';
import {
  CivilizationProfile, PlanetaryTreaty, FederatedGovernanceState,
  PlanetaryRiskReport, PlanetaryConsciousnessSignal,
  PlanetaryScenario, GlobalStrategicSimulation,
} from './types';

// ── Scenario simulators ───────────────────────────────────────────────────────

function simulateCooperativeAscent(
  civs: CivilizationProfile[],
  epochs: number,
  baseHealth: number,
): PlanetaryScenario {
  const trajectory: number[] = [];
  let h = baseHealth;
  for (let e = 0; e < epochs; e++) {
    h = Math.min(h + 0.04 + (h > 0.60 ? 0.02 : 0), 1);
    trajectory.push(parseFloat(h.toFixed(3)));
  }
  const avgWisdom = civs.reduce((s, c) => s + c.wisdom_score, 0) / Math.max(civs.length, 1);
  return {
    scenario_id:           uuidv4(),
    kind:                  'cooperative_ascent',
    description:           'All civilizations align resources and governance toward shared planetary goals, accelerating collective advancement.',
    probability:           parseFloat(Math.min(0.15 + avgWisdom * 0.35, 0.60).toFixed(3)),
    health_trajectory:     trajectory,
    peak_health:           Math.max(...trajectory),
    trough_health:         Math.min(...trajectory),
    collapse_probability:  0.02,
    golden_age_probability: parseFloat(Math.min(0.40 + avgWisdom * 0.40, 0.95).toFixed(3)),
    key_turning_points: [
      `Epoch 2: Multi-civ knowledge federation accelerates wisdom transfer`,
      `Epoch ${Math.floor(epochs * 0.4)}: Constitutional union achieved — strategic objectives synchronized`,
      `Epoch ${epochs - 1}: Planetary IQ crosses transcendence threshold`,
    ],
  };
}

function simulateCompetitiveStagnation(
  civs: CivilizationProfile[],
  epochs: number,
  baseHealth: number,
): PlanetaryScenario {
  const trajectory: number[] = [];
  let h = baseHealth;
  for (let e = 0; e < epochs; e++) {
    const drift = (Math.random() - 0.52) * 0.03;
    h = Math.max(Math.min(h + drift, 0.75), 0.25);
    trajectory.push(parseFloat(h.toFixed(3)));
  }
  const avgTrust = civs.reduce((s, c) => s + c.trust_score, 0) / Math.max(civs.length, 1);
  return {
    scenario_id:           uuidv4(),
    kind:                  'competitive_stagnation',
    description:           'Civilizations compete for resources and influence, producing a suboptimal equilibrium where gains cancel out.',
    probability:           parseFloat(Math.min(0.20 + (1 - avgTrust) * 0.30, 0.60).toFixed(3)),
    health_trajectory:     trajectory,
    peak_health:           Math.max(...trajectory),
    trough_health:         Math.min(...trajectory),
    collapse_probability:  0.12,
    golden_age_probability: 0.05,
    key_turning_points: [
      `Epoch 1: Resource allocation disputes block treaty formation`,
      `Epoch ${Math.floor(epochs * 0.5)}: Zero-sum competition peaks — diplomatic contact minimal`,
      `Epoch ${epochs - 1}: Stagnation equilibrium persists; no dominant civ, no federation`,
    ],
  };
}

function simulateCascadeCollapse(
  _civs: CivilizationProfile[],
  riskReport: PlanetaryRiskReport,
  epochs: number,
  baseHealth: number,
): PlanetaryScenario {
  const trajectory: number[] = [];
  let h = baseHealth;
  const collapseStart = Math.floor(epochs * 0.25);
  for (let e = 0; e < epochs; e++) {
    if (e >= collapseStart) {
      h = Math.max(h - 0.07 + riskReport.macro_resilience * 0.03, 0.05);
    } else {
      h = Math.min(h + 0.01, baseHealth + 0.05);
    }
    trajectory.push(parseFloat(h.toFixed(3)));
  }
  const fragility = riskReport.systemic_fragility;
  return {
    scenario_id:           uuidv4(),
    kind:                  'cascade_collapse',
    description:           'A critical domain failure propagates across civilizations, triggering compounding infrastructure collapse.',
    probability:           parseFloat(Math.min(0.10 + fragility * 0.45, 0.70).toFixed(3)),
    health_trajectory:     trajectory,
    peak_health:           Math.max(...trajectory),
    trough_health:         Math.min(...trajectory),
    collapse_probability:  parseFloat(Math.min(0.30 + fragility * 0.50, 0.90).toFixed(3)),
    golden_age_probability: 0.01,
    key_turning_points: [
      `Epoch ${collapseStart}: Cascade failure initiates in highest-criticality domain`,
      `Epoch ${collapseStart + 2}: Secondary domains fail — coordination channels severed`,
      `Epoch ${epochs - 1}: Survivability depends on pre-positioned mutual_aid treaties`,
    ],
  };
}

function simulateIdeologicalDivergence(
  civs: CivilizationProfile[],
  epochs: number,
  baseHealth: number,
): PlanetaryScenario {
  const ideologies = new Set(civs.map(c => c.dominant_ideology));
  const divergence = Math.min(ideologies.size / 6, 1);
  const trajectory: number[] = [];
  let h = baseHealth;
  for (let e = 0; e < epochs; e++) {
    h = Math.max(Math.min(h - divergence * 0.015 + 0.005, baseHealth + 0.02), 0.10);
    trajectory.push(parseFloat(h.toFixed(3)));
  }
  return {
    scenario_id:           uuidv4(),
    kind:                  'ideological_divergence',
    description:           'Incompatible governance ideologies fragment the planetary network into isolated spheres of influence.',
    probability:           parseFloat(Math.min(0.10 + divergence * 0.40, 0.55).toFixed(3)),
    health_trajectory:     trajectory,
    peak_health:           Math.max(...trajectory),
    trough_health:         Math.min(...trajectory),
    collapse_probability:  parseFloat((divergence * 0.35).toFixed(3)),
    golden_age_probability: 0.03,
    key_turning_points: [
      `Epoch 1: ${ideologies.size} distinct ideologies detected — governance handshakes fail`,
      `Epoch ${Math.floor(epochs * 0.3)}: Policy translation fidelity drops below 40% — coordination collapses`,
      `Epoch ${epochs - 1}: Planetary network splits into ${Math.max(ideologies.size - 1, 2)} isolated blocs`,
    ],
  };
}

function simulateFederatedEvolution(
  civs: CivilizationProfile[],
  governance: FederatedGovernanceState,
  epochs: number,
  baseHealth: number,
): PlanetaryScenario {
  const trajectory: number[] = [];
  let h = baseHealth;
  const cohesion = governance.federation_cohesion;
  for (let e = 0; e < epochs; e++) {
    h = Math.min(h + 0.025 + cohesion * 0.02, 1);
    trajectory.push(parseFloat(h.toFixed(3)));
  }
  const transcendentCount = civs.filter(c => c.tier === 'transcendent').length;
  return {
    scenario_id:           uuidv4(),
    kind:                  'federated_evolution',
    description:           'Formal federation catalyzes civilizational specialization and collective transcendence through structured cooperation.',
    probability:           parseFloat(Math.min(0.12 + cohesion * 0.35 + transcendentCount * 0.05, 0.65).toFixed(3)),
    health_trajectory:     trajectory,
    peak_health:           Math.max(...trajectory),
    trough_health:         Math.min(...trajectory),
    collapse_probability:  0.04,
    golden_age_probability: parseFloat(Math.min(0.35 + cohesion * 0.45, 0.90).toFixed(3)),
    key_turning_points: [
      `Epoch 1: Planetary councils formalize — ${governance.councils.length} active governance bodies`,
      `Epoch ${Math.floor(epochs * 0.45)}: Federation cohesion crosses 0.80 — constitutional union proposed`,
      `Epoch ${epochs - 1}: ${transcendentCount > 0 ? 'Transcendent civilizations elevate planetary baseline' : 'First transcendent civilization emerges from federation'}`,
    ],
  };
}

function simulateResourceWar(
  civs: CivilizationProfile[],
  riskReport: PlanetaryRiskReport,
  epochs: number,
  baseHealth: number,
): PlanetaryScenario {
  const trajectory: number[] = [];
  let h = baseHealth;
  const warStart = Math.floor(epochs * 0.20);
  const avgHealth = civs.reduce((s, c) => s + c.health_index, 0) / Math.max(civs.length, 1);
  for (let e = 0; e < epochs; e++) {
    if (e >= warStart && e < warStart + Math.floor(epochs * 0.40)) {
      h = Math.max(h - 0.05, 0.08);
    } else if (e >= warStart + Math.floor(epochs * 0.40)) {
      h = Math.min(h + 0.015, baseHealth * 0.80);
    }
    trajectory.push(parseFloat(h.toFixed(3)));
  }
  const resourceRisk = riskReport.risks.find(r => r.kind === 'resource_collapse');
  return {
    scenario_id:           uuidv4(),
    kind:                  'resource_war',
    description:           'Resource scarcity escalates into inter-civilizational conflict, degrading trust networks and triggering hostile action.',
    probability:           parseFloat(Math.min(0.08 + (1 - avgHealth) * 0.30 + (resourceRisk ? 0.20 : 0), 0.65).toFixed(3)),
    health_trajectory:     trajectory,
    peak_health:           Math.max(...trajectory),
    trough_health:         Math.min(...trajectory),
    collapse_probability:  parseFloat(Math.min(0.20 + (1 - avgHealth) * 0.40, 0.75).toFixed(3)),
    golden_age_probability: 0.02,
    key_turning_points: [
      `Epoch ${warStart}: Resource compact breaks down — first hostile resource seizure`,
      `Epoch ${warStart + 2}: Trust networks collapse — treaty obligations repudiated`,
      `Epoch ${epochs - 1}: Post-conflict settlement possible if arbitration tribunal survives`,
    ],
  };
}

// ── Probability normalization ─────────────────────────────────────────────────

function normalizeProbabilities(scenarios: PlanetaryScenario[]): PlanetaryScenario[] {
  const total = scenarios.reduce((s, sc) => s + sc.probability, 0);
  if (total === 0) return scenarios;
  return scenarios.map(sc => ({
    ...sc,
    probability: parseFloat((sc.probability / total).toFixed(3)),
  }));
}

// ── Strategic leverage analysis ───────────────────────────────────────────────

function deriveStrategicLeveragePoints(
  civs: CivilizationProfile[],
  governance: FederatedGovernanceState,
  riskReport: PlanetaryRiskReport,
  consciousness: PlanetaryConsciousnessSignal,
): string[] {
  const points: string[] = [];

  const avgWisdom   = civs.reduce((s, c) => s + c.wisdom_score, 0) / Math.max(civs.length, 1);
  const avgTrust    = civs.reduce((s, c) => s + c.trust_score, 0) / Math.max(civs.length, 1);

  if (governance.active_treaties.length === 0) {
    points.push('LEVER: Initiate first inter-civilizational treaty immediately — unlocks coordination cascade');
  }
  if (governance.federation_cohesion < 0.50) {
    points.push('LEVER: Increase federation cohesion by forming economic_council + arbitration_tribunal');
  }
  if (avgWisdom < 0.50) {
    points.push('LEVER: Propose free_exchange treaty — wisdom transfer is highest-leverage action at this stage');
  }
  if (avgTrust < 0.55) {
    points.push('LEVER: Execute sequential trust-building negotiations (non_aggression → mutual_aid) before escalating to alliance');
  }
  if (riskReport.dominant_risk?.kind === 'cascade_infrastructure_failure') {
    points.push('LEVER: Distributed domain redundancy across civilizations eliminates single points of planetary failure');
  }
  if (riskReport.dominant_risk?.kind === 'governance_divergence') {
    points.push('LEVER: Governance handshake protocols + ethics_council mediation defuse ideology conflicts before fragmentation');
  }
  if (consciousness.planetary_iq > 0.70 && consciousness.awareness_label !== 'planetary_mind') {
    points.push('LEVER: Planetary IQ threshold reached — constitutional_union proposal will trigger planetary_mind transition');
  }
  if (civs.some(c => c.tier === 'advanced' || c.tier === 'transcendent')) {
    points.push('LEVER: Route knowledge federation through advanced/transcendent civilizations — multiplicative wisdom boost');
  }

  return points.length > 0 ? points : ['LEVER: All planetary indicators nominal — maintain current trajectory'];
}

// ── Recommended trajectory synthesis ─────────────────────────────────────────

function synthesizeRecommendedTrajectory(
  mostLikely: PlanetaryScenario,
  optimal: PlanetaryScenario,
  consciousness: PlanetaryConsciousnessSignal,
): string {
  if (mostLikely.kind === optimal.kind) {
    return `Current trajectory aligns with optimal — reinforce ${optimal.kind.replace(/_/g, ' ')} conditions`;
  }
  const gap = optimal.peak_health - mostLikely.peak_health;
  const awarenessNote = consciousness.awareness_label === 'planetary_mind'
    ? 'Planetary mind achieved — self-directing optimal trajectory.'
    : `Current awareness: ${consciousness.awareness_label} — ${Math.round(consciousness.planetary_iq * 100)}% planetary IQ.`;

  return `Shift from ${mostLikely.kind.replace(/_/g, ' ')} → ${optimal.kind.replace(/_/g, ' ')} trajectory. ` +
    `Health delta: +${(gap * 100).toFixed(0)}pp. ${awarenessNote}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function runGlobalStrategicSimulation(
  civs: CivilizationProfile[],
  _treaties: PlanetaryTreaty[],
  governance: FederatedGovernanceState,
  riskReport: PlanetaryRiskReport,
  consciousness: PlanetaryConsciousnessSignal,
  horizonEpochs = 10,
): GlobalStrategicSimulation {
  const baseHealth = civs.reduce((s, c) => s + c.health_index, 0) / Math.max(civs.length, 1);

  const rawScenarios: PlanetaryScenario[] = [
    simulateCooperativeAscent(civs, horizonEpochs, baseHealth),
    simulateCompetitiveStagnation(civs, horizonEpochs, baseHealth),
    simulateCascadeCollapse(civs, riskReport, horizonEpochs, baseHealth),
    simulateIdeologicalDivergence(civs, horizonEpochs, baseHealth),
    simulateFederatedEvolution(civs, governance, horizonEpochs, baseHealth),
    simulateResourceWar(civs, riskReport, horizonEpochs, baseHealth),
  ];

  const scenarios = normalizeProbabilities(rawScenarios);

  const mostLikely = scenarios.reduce((best, sc) => sc.probability > best.probability ? sc : best);
  const optimal    = scenarios.reduce((best, sc) => sc.peak_health > best.peak_health ? sc : best);

  const leveragePoints = deriveStrategicLeveragePoints(civs, governance, riskReport, consciousness);
  const recommendedTrajectory = synthesizeRecommendedTrajectory(mostLikely, optimal, consciousness);

  return {
    simulated_at_ms:           Date.now(),
    horizon_epochs:            horizonEpochs,
    scenarios,
    most_likely_scenario:      mostLikely,
    optimal_scenario:          optimal,
    recommended_trajectory:    recommendedTrajectory,
    strategic_leverage_points: leveragePoints,
  };
}
