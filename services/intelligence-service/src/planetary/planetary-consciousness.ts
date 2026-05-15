import {
  CivilizationProfile, PlanetaryTreaty, PlanetaryCouncil,
  PlanetaryRiskReport, FederatedGovernanceState,
  PlanetaryConsciousnessSignal, PlanetaryAwarenessLabel,
} from './types';
import { scoreCompatibility } from './intercivilizational-protocol';

// ── Dimension computation ─────────────────────────────────────────────────────

function computePlanetaryCoherence(
  civs: CivilizationProfile[],
  treaties: PlanetaryTreaty[],
): number {
  if (civs.length === 0) return 0;
  const avgHealth  = civs.reduce((s, c) => s + c.health_index, 0) / civs.length;
  const activeTreaties = treaties.filter(t => t.status === 'active');
  const treatyDensity  = civs.length > 1
    ? activeTreaties.length / ((civs.length * (civs.length - 1)) / 2)
    : 0;

  // Pairwise compatibility average
  let compatSum = 0, pairs = 0;
  for (let i = 0; i < civs.length; i++) {
    for (let j = i + 1; j < civs.length; j++) {
      compatSum += scoreCompatibility(civs[i], civs[j]).overall;
      pairs++;
    }
  }
  const avgCompat = pairs > 0 ? compatSum / pairs : 0.50;

  return parseFloat(Math.min(
    avgHealth * 0.30 + avgCompat * 0.40 + Math.min(treatyDensity, 1) * 0.30,
    1,
  ).toFixed(3));
}

function computeInterCivHarmony(
  civs: CivilizationProfile[],
  riskReport: PlanetaryRiskReport,
): number {
  const conflictRisks = riskReport.risks.filter(
    r => r.kind === 'ideological_conflict' || r.kind === 'governance_divergence'
  );
  const conflictPenalty = conflictRisks.reduce((s, r) => s + r.probability * 0.30, 0);
  const avgTrust = civs.reduce((s, c) => s + c.trust_score, 0) / Math.max(civs.length, 1);
  return parseFloat(Math.max(avgTrust * 0.70 + (1 - conflictPenalty) * 0.30, 0).toFixed(3));
}

function computeStrategicAlignment(
  civs: CivilizationProfile[],
  governance: FederatedGovernanceState,
): number {
  const cohesion      = governance.federation_cohesion;
  const councilCover  = Math.min(governance.councils.length / 5, 1);
  const resolutionsOK = governance.pending_resolutions.filter(r => r.passed).length;
  const resBonus      = Math.min(resolutionsOK * 0.05, 0.20);
  return parseFloat(Math.min(cohesion * 0.50 + councilCover * 0.30 + resBonus, 1).toFixed(3));
}

function computeMacroResilience(riskReport: PlanetaryRiskReport): number {
  return riskReport.macro_resilience;
}

function computeAdaptiveIntelligence(civs: CivilizationProfile[]): number {
  const avgWisdom = civs.reduce((s, c) => s + c.wisdom_score, 0) / Math.max(civs.length, 1);
  const tiers: Record<string, number> = {
    transcendent: 1.0, advanced: 0.75, established: 0.50, nascent: 0.25,
  };
  const tierAvg = civs.reduce((s, c) => s + (tiers[c.tier] ?? 0.25), 0) / Math.max(civs.length, 1);
  return parseFloat((avgWisdom * 0.60 + tierAvg * 0.40).toFixed(3));
}

function computeCivSync(civs: CivilizationProfile[], treaties: PlanetaryTreaty[]): number {
  if (civs.length < 2) return 0.50;
  const activeTreaties = treaties.filter(t => t.status === 'active');
  const syncPairs = activeTreaties.filter(t =>
    t.kind === 'joint_governance' || t.kind === 'constitutional_union' || t.kind === 'strategic_alliance'
  ).length;
  const maxPairs = (civs.length * (civs.length - 1)) / 2;
  return parseFloat(Math.min(syncPairs / Math.max(maxPairs, 1) + 0.20, 1).toFixed(3));
}

// ── Label classification ──────────────────────────────────────────────────────

function classifyAwareness(
  coherence: number,
  harmony: number,
  alignment: number,
  resilience: number,
  adaptiveIntel: number,
  sync: number,
  governance: FederatedGovernanceState,
): PlanetaryAwarenessLabel {
  const allScores = [coherence, harmony, alignment, resilience, adaptiveIntel, sync];
  const avg = allScores.reduce((s, v) => s + v, 0) / allScores.length;

  const hasConstitutionalUnion = governance.active_treaties.some(t => t.kind === 'constitutional_union');

  if (hasConstitutionalUnion && avg > 0.75 && governance.federation_cohesion > 0.80) {
    return 'planetary_mind';
  }
  if (avg > 0.70 && governance.councils.length >= 4 && alignment > 0.65) {
    return 'unified';
  }
  if (governance.active_treaties.length >= 2 && governance.councils.length >= 2 && avg > 0.55) {
    return 'federated';
  }
  if (governance.active_treaties.length >= 1 && avg > 0.45) {
    return 'coordinated';
  }
  if (coherence > 0.35 || governance.active_treaties.length > 0) {
    return 'emerging_network';
  }
  return 'fragmented';
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computePlanetaryConsciousness(
  civs: CivilizationProfile[],
  treaties: PlanetaryTreaty[],
  governance: FederatedGovernanceState,
  riskReport: PlanetaryRiskReport,
): PlanetaryConsciousnessSignal {
  const coherence   = computePlanetaryCoherence(civs, treaties);
  const harmony     = computeInterCivHarmony(civs, riskReport);
  const alignment   = computeStrategicAlignment(civs, governance);
  const resilience  = computeMacroResilience(riskReport);
  const adaptive    = computeAdaptiveIntelligence(civs);
  const sync        = computeCivSync(civs, treaties);

  const awarenessLabel = classifyAwareness(coherence, harmony, alignment, resilience, adaptive, sync, governance);

  // Planetary IQ: weighted composite
  const planetaryIq = parseFloat(Math.min(
    coherence * 0.20 + harmony * 0.15 + alignment * 0.20 +
    resilience * 0.15 + adaptive * 0.20 + sync * 0.10,
    1,
  ).toFixed(3));

  const signals: string[] = [];
  if (awarenessLabel === 'planetary_mind') {
    signals.push('PLANETARY MIND ACHIEVED — civilization network operating as unified cognitive entity');
  }
  if (awarenessLabel === 'unified' || awarenessLabel === 'planetary_mind') {
    signals.push(`Strategic alignment at ${(alignment * 100).toFixed(0)}% — long-horizon objectives synchronized`);
  }
  if (harmony > 0.75) {
    signals.push('Inter-civilizational harmony excellent — no active conflict vectors detected');
  }
  if (resilience < 0.40) {
    signals.push(`WARNING: Macro-resilience at ${(resilience * 100).toFixed(0)}% — planetary shock absorption insufficient`);
  }
  if (governance.active_treaties.some(t => t.kind === 'constitutional_union')) {
    signals.push('Constitutional union active — deepest inter-civilizational integration achieved');
  }
  if (civs.some(c => c.tier === 'transcendent')) {
    signals.push('Transcendent civilization present — planetary cognitive ceiling elevated');
  }

  return {
    computed_at_ms:               Date.now(),
    planetary_coherence:          coherence,
    inter_civ_harmony:            harmony,
    strategic_alignment:          alignment,
    macro_resilience:             resilience,
    adaptive_intelligence:        adaptive,
    civilization_synchronization: sync,
    awareness_label:              awarenessLabel,
    planetary_iq:                 planetaryIq,
    emergence_signals:            signals,
  };
}
