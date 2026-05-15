import { v4 as uuidv4 } from 'uuid';
import {
  CivilizationProfile, PlanetaryTreaty, PlanetaryTreatyKind,
  DiplomaticResolution, NegotiationRound,
} from './types';
import { proposeTreaty, ratifyTreaty, runNegotiationRound } from './federated-governance';
import { scoreCompatibility } from './intercivilizational-protocol';

// ── Diplomatic recommendation ─────────────────────────────────────────────────

export function recommendTreatyKind(
  civA: CivilizationProfile,
  civB: CivilizationProfile,
): PlanetaryTreatyKind {
  const compat = scoreCompatibility(civA, civB);

  if (compat.overall > 0.80) return 'constitutional_union';
  if (compat.overall > 0.70) return 'strategic_alliance';
  if (compat.overall > 0.60) return 'joint_governance';
  if (compat.governance_compatibility < 0.40) return 'non_aggression';
  if (civA.health_index < 0.40 || civB.health_index < 0.40) return 'mutual_aid';
  if (compat.operational_synergy > 0.70) return 'resource_compact';
  return 'free_exchange';
}

// ── Full negotiation pipeline ──────────────────────────────────────────────────

export interface NegotiationResult {
  treaty: PlanetaryTreaty;
  rounds: NegotiationRound[];
  final_outcome: 'ratified' | 'partial' | 'failed';
  rounds_taken: number;
  diplomatic_notes: string[];
}

export function conductNegotiation(
  civA: CivilizationProfile,
  civB: CivilizationProfile,
  preferredKind?: PlanetaryTreatyKind,
): NegotiationResult {
  const kind    = preferredKind ?? recommendTreatyKind(civA, civB);
  const treaty  = proposeTreaty([civA.civ_id, civB.civ_id], kind, civA.civ_id);
  const rounds: NegotiationRound[] = [];
  const notes: string[]            = [];
  const MAX_ROUNDS = 4;

  notes.push(`Negotiation initiated: ${civA.civ_id} ↔ ${civB.civ_id} — treaty kind: ${kind}`);

  let outcome: NegotiationRound['outcome'] = 'pending';
  for (let r = 1; r <= MAX_ROUNDS && outcome === 'pending'; r++) {
    const round = runNegotiationRound(treaty.treaty_id, r, [civA, civB], kind);
    rounds.push(round);
    outcome = round.outcome;

    if (outcome === 'agreement') {
      notes.push(`Round ${r}: Agreement reached — all articles accepted`);
    } else if (outcome === 'deadlock') {
      notes.push(`Round ${r}: Deadlock — incompatible governance positions`);
    } else if (outcome === 'partial') {
      notes.push(`Round ${r}: Partial agreement — escalating to arbitration`);
    } else {
      notes.push(`Round ${r}: Ongoing — counter-proposals exchanged`);
    }
  }

  const finalOutcome: NegotiationResult['final_outcome'] =
    outcome === 'agreement' ? 'ratified' :
    outcome === 'partial'   ? 'partial'  : 'failed';

  const ratified = finalOutcome === 'ratified'
    ? ratifyTreaty(treaty, [civA.civ_id, civB.civ_id])
    : { ...treaty, status: (finalOutcome === 'partial' ? 'proposed' : 'dissolved') as PlanetaryTreaty['status'] };

  return {
    treaty:        ratified,
    rounds,
    final_outcome: finalOutcome,
    rounds_taken:  rounds.length,
    diplomatic_notes: notes,
  };
}

// ── Conflict mediation ────────────────────────────────────────────────────────

export function mediateDispute(
  parties: CivilizationProfile[],
  disputeKind: DiplomaticResolution['dispute_kind'],
  existingTreaties: PlanetaryTreaty[],
): DiplomaticResolution {
  const partyIds = parties.map(p => p.civ_id);
  const avgTrust = parties.reduce((s, p) => s + p.trust_score, 0) / Math.max(parties.length, 1);

  // Select mediator — highest trust + wisdom civ not party to dispute
  const mediator = parties.reduce((best, c) =>
    (c.trust_score + c.wisdom_score) > (best.trust_score + best.wisdom_score) ? c : best
  );

  const RESOLUTION_TEMPLATES: Record<DiplomaticResolution['dispute_kind'], string[]> = {
    resource_conflict: [
      'Dispute parties agree to binding resource arbitration by planetary economic council',
      'Interim resource sharing protocol applies during resolution period',
      'Compliance with resource_compact treaty required going forward',
    ],
    governance_clash: [
      'Each party maintains full sovereignty over internal governance',
      'Cross-civ governance interference prohibited',
      'Ethics council reviews disputed governance interactions quarterly',
    ],
    policy_violation: [
      `Violating party commits to policy compliance within 30 operational cycles`,
      'Remediation plan published to full federation',
      'Compliance monitored by arbitration tribunal for 3 generations',
    ],
    treaty_breach: [
      `Treaty obligations reinstated with 48-hour grace period`,
      'Compensatory resource transfer required to aggrieved party',
      'Repeated breach triggers treaty suspension and security council review',
    ],
  };

  const terms = RESOLUTION_TEMPLATES[disputeKind];

  // Precedent weight: higher when multiple civs involved + treaty exists
  const hasTreaty = existingTreaties.some(t =>
    t.status === 'active' && parties.every(p => t.parties.includes(p.civ_id))
  );
  const precedentWeight = parseFloat(
    Math.min(0.30 + (parties.length > 2 ? 0.20 : 0) + (hasTreaty ? 0.25 : 0) + avgTrust * 0.15, 1).toFixed(3)
  );

  const compliance: Record<string, string[]> = {};
  for (const p of partyIds) compliance[p] = [terms[0]];

  return {
    dispute_id:         uuidv4(),
    parties:            partyIds,
    dispute_kind:       disputeKind,
    mediator:           mediator.civ_id,
    resolution_terms:   terms,
    compliance_required: compliance,
    resolved_at_ms:     Date.now(),
    precedent_weight:   precedentWeight,
  };
}

// ── Trust scoring between civilizations ────────────────────────────────────────

export function computeInterCivTrust(
  civA: CivilizationProfile,
  civB: CivilizationProfile,
  sharedTreaties: PlanetaryTreaty[],
): number {
  const baseTrust   = (civA.trust_score + civB.trust_score) / 2;
  const compat      = scoreCompatibility(civA, civB);
  const treatyBonus = Math.min(sharedTreaties.filter(t => t.status === 'active').length * 0.10, 0.30);
  return parseFloat(Math.min(baseTrust * 0.50 + compat.overall * 0.35 + treatyBonus, 1).toFixed(3));
}
