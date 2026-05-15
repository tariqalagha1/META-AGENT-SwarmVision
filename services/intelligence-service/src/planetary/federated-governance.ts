import { v4 as uuidv4 } from 'uuid';
import {
  CivilizationProfile, PlanetaryCouncil, CouncilKind, CouncilResolution,
  FederatedGovernanceState, PlanetaryTreaty, PlanetaryTreatyKind, TreatyStatus,
  NegotiationRound,
} from './types';

// ── Treaty formation ──────────────────────────────────────────────────────────

const TREATY_ARTICLES: Record<PlanetaryTreatyKind, string[]> = {
  non_aggression: [
    'Parties shall not initiate hostile resource competition',
    'No civilization may restrict another\'s access to shared infrastructure',
    'Disputes escalate to arbitration tribunal before any unilateral action',
  ],
  mutual_aid: [
    'Any party with health < 0.30 triggers mandatory aid from all signatories',
    'Aid packages include compute, bandwidth, and governance expertise',
    'Recipient civilization maintains sovereignty — no occupation of governance',
  ],
  free_exchange: [
    'All discovered patterns shared within 24h of confirmation',
    'No knowledge hoarding — proprietary locks on shared infrastructure are prohibited',
    'Cross-civilization knowledge transfer executed quarterly minimum',
  ],
  joint_governance: [
    'Planetary council decisions binding on all signatories within domain scope',
    'Voting weight proportional to civilization health index',
    'Sovereignty preserved on internal governance — only shared-domain matters federated',
  ],
  strategic_alliance: [
    'Aligned long-horizon strategic objectives reviewed annually',
    'Joint simulation of civilizational futures conducted each generation',
    'Military or hostile AI actions against alliance members treated as acts against all',
  ],
  resource_compact: [
    'Surplus resources (>20% idle capacity) offered to compact pool automatically',
    'Emergency allocation overrides standard pricing — solidarity pricing in effect',
    'Resource hoarding above 150% projected need prohibited',
  ],
  constitutional_union: [
    'Shared constitutional principles supersede local doctrine on planetary matters',
    'Constitutional amendments require 75% weighted vote of union members',
    'Member civilizations adopt interoperability standards as constitutional requirement',
    'Union maintains planetary emergency authority — activates at systemic threat level orange+',
  ],
};

export function proposeTreaty(
  parties: string[],
  kind: PlanetaryTreatyKind,
  initiatingCiv: string,
): PlanetaryTreaty {
  return {
    treaty_id:          uuidv4(),
    kind,
    parties,
    articles:           TREATY_ARTICLES[kind],
    ratified_at_ms:     null,
    expires_at_ms:      kind === 'non_aggression' ? Date.now() + 365 * 24 * 3600_000 : null,
    status:             'proposed',
    compliance_scores:  Object.fromEntries(parties.map(p => [p, 1.0])),
    health_impact:      null,
  };
}

export function ratifyTreaty(treaty: PlanetaryTreaty, ratifyingCivs: string[]): PlanetaryTreaty {
  const allParties = treaty.parties.every(p => ratifyingCivs.includes(p));
  return {
    ...treaty,
    ratified_at_ms: allParties ? Date.now() : null,
    status:         allParties ? 'active' : 'proposed',
  };
}

// ── Negotiation ───────────────────────────────────────────────────────────────

export function runNegotiationRound(
  treatyId: string,
  roundNumber: number,
  parties: CivilizationProfile[],
  treatyKind: PlanetaryTreatyKind,
): NegotiationRound {
  const proposals = parties.map(civ => ({
    civ_id: civ.civ_id,
    terms:  generateProposal(civ, treatyKind),
  }));

  const counterProposals = parties.map(civ => ({
    civ_id: civ.civ_id,
    terms:  generateCounterProposal(civ, treatyKind, roundNumber),
  }));

  // Convergence: check if proposals are close enough
  const avgTrust = parties.reduce((s, c) => s + c.trust_score, 0) / parties.length;
  const outcome: NegotiationRound['outcome'] =
    avgTrust > 0.70 && roundNumber >= 2 ? 'agreement' :
    avgTrust < 0.30 ? 'deadlock' :
    roundNumber >= 3 ? 'partial' : 'pending';

  return {
    round_id:          uuidv4(),
    treaty_id:         treatyId,
    round_number:      roundNumber,
    proposals,
    counter_proposals: counterProposals,
    outcome,
    concluded_at_ms:   outcome !== 'pending' ? Date.now() : null,
  };
}

function generateProposal(civ: CivilizationProfile, kind: PlanetaryTreatyKind): string[] {
  const base = TREATY_ARTICLES[kind].slice(0, 2);
  if (civ.dominant_ideology === 'hierarchical_mandate') {
    return [...base, 'Central coordination authority required for all cross-civ actions'];
  }
  if (civ.dominant_ideology === 'decentralized_autonomy') {
    return [...base, 'All terms are advisory — local implementation at each civilization\'s discretion'];
  }
  return base;
}

function generateCounterProposal(
  civ: CivilizationProfile, kind: PlanetaryTreatyKind, round: number,
): string[] {
  const base = TREATY_ARTICLES[kind];
  // Later rounds converge toward full articles
  return base.slice(0, Math.min(round + 1, base.length));
}

// ── Council management ────────────────────────────────────────────────────────

export function formPlanetaryCouncils(
  civs: CivilizationProfile[],
  existingCouncils: PlanetaryCouncil[],
): PlanetaryCouncil[] {
  const existing = new Set(existingCouncils.map(c => c.kind));
  const formed: PlanetaryCouncil[] = [];
  const now = Date.now();

  const COUNCIL_CONFIGS: Array<{ kind: CouncilKind; name: string; quorum: number; minCivs: number }> = [
    { kind: 'security_council',    name: 'Planetary Security Council',    quorum: 0.60, minCivs: 2 },
    { kind: 'economic_council',    name: 'Planetary Economic Council',    quorum: 0.50, minCivs: 2 },
    { kind: 'science_council',     name: 'Knowledge Federation Council',  quorum: 0.50, minCivs: 2 },
    { kind: 'ethics_council',      name: 'Constitutional Ethics Council', quorum: 0.67, minCivs: 3 },
    { kind: 'arbitration_tribunal',name: 'Inter-Civ Arbitration Tribunal',quorum: 0.75, minCivs: 2 },
  ];

  for (const cfg of COUNCIL_CONFIGS) {
    if (existing.has(cfg.kind) || civs.length < cfg.minCivs) continue;

    const votingWeights: Record<string, number> = {};
    let totalWeight = 0;
    for (const civ of civs) {
      const w = civ.health_index * 0.40 + civ.wisdom_score * 0.35 + civ.trust_score * 0.25;
      votingWeights[civ.civ_id] = w;
      totalWeight += w;
    }
    // Normalize
    for (const k of Object.keys(votingWeights)) {
      votingWeights[k] = parseFloat((votingWeights[k] / totalWeight).toFixed(3));
    }

    formed.push({
      council_id:         uuidv4(),
      kind:               cfg.kind,
      name:               cfg.name,
      member_civs:        civs.map(c => c.civ_id),
      voting_weights:     votingWeights,
      quorum_threshold:   cfg.quorum,
      active_resolutions: [],
      formed_at_ms:       now,
      health:             civs.reduce((s, c) => s + c.health_index, 0) / civs.length,
    });
  }

  return formed;
}

export function proposeResolution(
  council: PlanetaryCouncil,
  title: string,
  body: string,
  proposedBy: string,
  civs: CivilizationProfile[],
): CouncilResolution {
  // Simulate votes: civs with higher trust + health vote in favor
  const votesFor: string[]     = [];
  const votesAgainst: string[] = [];
  const abstentions: string[]  = [];

  for (const civ of civs) {
    if (!council.member_civs.includes(civ.civ_id)) continue;
    const approvalProb = civ.trust_score * 0.50 + civ.health_index * 0.30 + civ.wisdom_score * 0.20;
    if (approvalProb > 0.60)      votesFor.push(civ.civ_id);
    else if (approvalProb < 0.35) votesAgainst.push(civ.civ_id);
    else                          abstentions.push(civ.civ_id);
  }

  // Check quorum
  const forWeight = votesFor.reduce((s, id) => s + (council.voting_weights[id] ?? 0), 0);
  const passed    = forWeight >= council.quorum_threshold;

  return {
    resolution_id:     uuidv4(),
    council_id:        council.council_id,
    title,
    body,
    proposed_by:       proposedBy,
    votes_for:         votesFor,
    votes_against:     votesAgainst,
    abstentions,
    passed,
    enacted_at_ms:     passed ? Date.now() : null,
    impact_assessment: passed
      ? `Resolution enacted — affects ${council.member_civs.length} civilizations`
      : `Resolution failed — insufficient quorum (${(forWeight * 100).toFixed(0)}% < ${(council.quorum_threshold * 100).toFixed(0)}% required)`,
  };
}

// ── Federation state ──────────────────────────────────────────────────────────

export function computeFederatedGovernanceState(
  civs: CivilizationProfile[],
  councils: PlanetaryCouncil[],
  treaties: PlanetaryTreaty[],
  pendingResolutions: CouncilResolution[],
): FederatedGovernanceState {
  const activeTreaties = treaties.filter(t => t.status === 'active');

  // Federation cohesion: avg pairwise trust + treaty coverage
  const avgTrust = civs.reduce((s, c) => s + c.trust_score, 0) / Math.max(civs.length, 1);
  const treatyCoverage = civs.length > 1
    ? activeTreaties.length / ((civs.length * (civs.length - 1)) / 2)
    : 0;
  const cohesion = avgTrust * 0.50 + Math.min(treatyCoverage, 1) * 0.30 + (councils.length / 5) * 0.20;

  // Sovereignty index: how much local autonomy preserved
  const constitutionalUnions = activeTreaties.filter(t => t.kind === 'constitutional_union').length;
  const sovereignty = Math.max(1 - constitutionalUnions * 0.15 - treatyCoverage * 0.10, 0.40);

  const govLoad = Math.min(pendingResolutions.length * 0.08 + councils.length * 0.05, 1);

  return {
    evaluated_at_ms:      Date.now(),
    councils:             [...councils, ...formPlanetaryCouncils(civs, councils)],
    active_treaties:      activeTreaties,
    pending_resolutions:  pendingResolutions,
    federation_cohesion:  parseFloat(cohesion.toFixed(3)),
    sovereignty_index:    parseFloat(sovereignty.toFixed(3)),
    governance_load:      parseFloat(govLoad.toFixed(3)),
  };
}
