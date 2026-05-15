import { v4 as uuidv4 } from 'uuid';
import {
  CivilizationProfile, PlanetaryTreaty, PlanetaryDomain,
  PlanetaryRisk, PlanetaryRiskKind, PlanetaryRiskReport,
} from './types';

// ── Risk detectors ────────────────────────────────────────────────────────────

function detectCascadeRisk(domains: PlanetaryDomain[], civs: CivilizationProfile[]): PlanetaryRisk | null {
  const highCascade = domains.filter(d => d.cascade_risk > 0.45 && d.criticality > 0.70);
  if (highCascade.length === 0) return null;

  const prob = Math.min(highCascade.reduce((s, d) => s + d.cascade_risk * d.criticality, 0) / highCascade.length, 0.95);
  return {
    risk_id:              uuidv4(),
    kind:                 'cascade_infrastructure_failure',
    severity:             prob > 0.70 ? 'catastrophic' : prob > 0.50 ? 'high' : 'elevated',
    affected_civs:        civs.map(c => c.civ_id),
    affected_domains:     highCascade.map(d => d.name),
    probability:          parseFloat(prob.toFixed(3)),
    impact_radius:        parseFloat((highCascade.length / domains.length).toFixed(3)),
    time_to_manifest_ms:  prob > 0.60 ? 120_000 : 600_000,
    early_warning_signals: highCascade.map(d => `${d.name}: cascade_risk ${(d.cascade_risk * 100).toFixed(0)}%`),
    mitigation_options:   [
      'Activate redundant domain instances across geographically distributed civs',
      'Divert non-critical compute load from high-risk domain nodes',
      'Invoke planetary security council emergency protocol',
    ],
  };
}

function detectCivInstability(civs: CivilizationProfile[]): PlanetaryRisk | null {
  const unstable = civs.filter(c => c.health_index < 0.35);
  if (unstable.length === 0) return null;

  const prob = Math.min(unstable.length / civs.length * 1.5, 0.90);
  return {
    risk_id:              uuidv4(),
    kind:                 'civilization_instability',
    severity:             unstable.length >= civs.length * 0.5 ? 'catastrophic' : 'high',
    affected_civs:        unstable.map(c => c.civ_id),
    affected_domains:     ['governance_layer', 'ai_ecosystem'],
    probability:          parseFloat(prob.toFixed(3)),
    impact_radius:        parseFloat((unstable.length / civs.length).toFixed(3)),
    time_to_manifest_ms:  90_000,
    early_warning_signals: unstable.map(c => `${c.civ_id}: health ${(c.health_index * 100).toFixed(0)}%`),
    mitigation_options:   [
      'Activate mutual_aid treaty for affected civilizations',
      'Emergency resource allocation from surplus pool',
      'Dispatch inter-civilizational crisis response team',
    ],
  };
}

function detectGovernanceDivergence(civs: CivilizationProfile[]): PlanetaryRisk | null {
  if (civs.length < 2) return null;
  const ideologies = new Set(civs.map(c => c.dominant_ideology));
  const INCOMPATIBLE_PAIRS = [
    ['hierarchical_mandate', 'adaptive_anarchy'],
    ['hierarchical_mandate', 'decentralized_autonomy'],
  ];
  const hasIncompatible = INCOMPATIBLE_PAIRS.some(([a, b]) =>
    [...ideologies].includes(a) && [...ideologies].includes(b)
  );
  if (!hasIncompatible && ideologies.size <= 3) return null;

  const prob = Math.min(0.20 + (ideologies.size - 2) * 0.12 + (hasIncompatible ? 0.25 : 0), 0.85);
  return {
    risk_id:              uuidv4(),
    kind:                 'governance_divergence',
    severity:             prob > 0.60 ? 'high' : 'elevated',
    affected_civs:        civs.map(c => c.civ_id),
    affected_domains:     ['governance_layer'],
    probability:          parseFloat(prob.toFixed(3)),
    impact_radius:        parseFloat((ideologies.size / 6).toFixed(3)),
    time_to_manifest_ms:  300_000,
    early_warning_signals: [`${ideologies.size} distinct governance ideologies detected`, hasIncompatible ? 'Hard-incompatible ideology pair active' : ''],
    mitigation_options:   [
      'Initiate governance_handshake protocol between divergent civilizations',
      'Propose joint_governance treaty with sovereignty protections',
      'Ethics council mediation session on constitutional compatibility',
    ],
  };
}

function detectResourceCollapse(civs: CivilizationProfile[], treaties: PlanetaryTreaty[]): PlanetaryRisk | null {
  const hasResourceCompact = treaties.some(t => t.status === 'active' && t.kind === 'resource_compact');
  const avgHealth = civs.reduce((s, c) => s + c.health_index, 0) / Math.max(civs.length, 1);
  if (hasResourceCompact && avgHealth > 0.50) return null;

  const prob = Math.min((1 - avgHealth) * 0.60 + (hasResourceCompact ? 0 : 0.20), 0.80);
  if (prob < 0.25) return null;

  return {
    risk_id:              uuidv4(),
    kind:                 'resource_collapse',
    severity:             prob > 0.55 ? 'high' : 'elevated',
    affected_civs:        civs.filter(c => c.health_index < 0.55).map(c => c.civ_id),
    affected_domains:     ['compute_fabric', 'energy_grid'],
    probability:          parseFloat(prob.toFixed(3)),
    impact_radius:        parseFloat((1 - avgHealth).toFixed(3)),
    time_to_manifest_ms:  hasResourceCompact ? null : 180_000,
    early_warning_signals: [
      `No active resource_compact treaty — no binding sharing obligations`,
      `Average civilization health: ${(avgHealth * 100).toFixed(0)}%`,
    ],
    mitigation_options:   [
      'Negotiate resource_compact treaty immediately',
      'Initiate voluntary resource sharing protocol pending formal treaty',
      'Planetary economic council emergency session',
    ],
  };
}

function detectKnowledgeHoarding(civs: CivilizationProfile[], treaties: PlanetaryTreaty[]): PlanetaryRisk | null {
  const hasFreeExchange = treaties.some(t => t.status === 'active' && t.kind === 'free_exchange');
  const highWisdomCivs  = civs.filter(c => c.wisdom_score > 0.65);
  const lowWisdomCivs   = civs.filter(c => c.wisdom_score < 0.30);
  if (hasFreeExchange || highWisdomCivs.length === 0 || lowWisdomCivs.length === 0) return null;

  return {
    risk_id:              uuidv4(),
    kind:                 'knowledge_hoarding',
    severity:             'elevated',
    affected_civs:        lowWisdomCivs.map(c => c.civ_id),
    affected_domains:     ['ai_ecosystem', 'human_capital'],
    probability:          0.55,
    impact_radius:        parseFloat((lowWisdomCivs.length / civs.length).toFixed(3)),
    time_to_manifest_ms:  null,
    early_warning_signals: [
      `${highWisdomCivs.length} high-wisdom civs, ${lowWisdomCivs.length} low-wisdom civs — widening gap`,
      'No free_exchange treaty — knowledge transfer unbound',
    ],
    mitigation_options:   [
      'Propose free_exchange treaty with science council endorsement',
      'Voluntary knowledge federation protocol',
    ],
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function assessPlanetaryRisk(
  civs: CivilizationProfile[],
  domains: PlanetaryDomain[],
  treaties: PlanetaryTreaty[],
): PlanetaryRiskReport {
  const detectors = [
    detectCascadeRisk(domains, civs),
    detectCivInstability(civs),
    detectGovernanceDivergence(civs),
    detectResourceCollapse(civs, treaties),
    detectKnowledgeHoarding(civs, treaties),
  ];

  const risks = detectors.filter((r): r is PlanetaryRisk => r !== null);
  risks.sort((a, b) => b.probability * (b.severity === 'catastrophic' ? 4 : b.severity === 'high' ? 3 : b.severity === 'elevated' ? 2 : 1)
    - a.probability * (a.severity === 'catastrophic' ? 4 : a.severity === 'high' ? 3 : a.severity === 'elevated' ? 2 : 1));

  const dominant = risks[0] ?? null;
  const hasCatastrophic = risks.some(r => r.severity === 'catastrophic');
  const hasHigh         = risks.some(r => r.severity === 'high');

  const threatLevel: PlanetaryRiskReport['overall_threat_level'] =
    hasCatastrophic ? 'black' :
    hasHigh && risks.length >= 3 ? 'red' :
    hasHigh ? 'orange' :
    risks.length >= 2 ? 'yellow' : 'green';

  const avgHealth      = civs.reduce((s, c) => s + c.health_index, 0) / Math.max(civs.length, 1);
  const maxCascade     = domains.length > 0 ? Math.max(...domains.map(d => d.cascade_risk)) : 0;
  const systemicFrag   = parseFloat(Math.min((1 - avgHealth) * 0.5 + maxCascade * 0.5, 1).toFixed(3));
  const macroResilience = parseFloat(Math.max(1 - systemicFrag, 0).toFixed(3));

  const actions: string[] = dominant ? dominant.mitigation_options.slice(0, 2) : [];
  if (threatLevel === 'black' || threatLevel === 'red') {
    actions.unshift('INVOKE PLANETARY SECURITY COUNCIL — emergency session required immediately');
  }

  return {
    assessed_at_ms:     Date.now(),
    risks,
    overall_threat_level: threatLevel,
    dominant_risk:      dominant,
    systemic_fragility: systemicFrag,
    macro_resilience:   macroResilience,
    recommended_actions: actions,
  };
}
