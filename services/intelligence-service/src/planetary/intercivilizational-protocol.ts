import { v4 as uuidv4 } from 'uuid';
import {
  CivilizationProfile, CompatibilityScore, InteroperabilityReport,
  ProtocolMessage, ProtocolKind,
} from './types';

// ── Ideology compatibility matrix ─────────────────────────────────────────────

const IDEOLOGY_COMPAT: Record<string, Record<string, number>> = {
  federated_republic:        { federated_republic: 1.00, consensus_democracy: 0.88, evolutionary_meritocracy: 0.72, decentralized_autonomy: 0.65, hierarchical_mandate: 0.45, adaptive_anarchy: 0.40 },
  consensus_democracy:       { federated_republic: 0.88, consensus_democracy: 1.00, evolutionary_meritocracy: 0.75, decentralized_autonomy: 0.70, hierarchical_mandate: 0.42, adaptive_anarchy: 0.45 },
  evolutionary_meritocracy:  { federated_republic: 0.72, consensus_democracy: 0.75, evolutionary_meritocracy: 1.00, decentralized_autonomy: 0.68, hierarchical_mandate: 0.55, adaptive_anarchy: 0.50 },
  decentralized_autonomy:    { federated_republic: 0.65, consensus_democracy: 0.70, evolutionary_meritocracy: 0.68, decentralized_autonomy: 1.00, hierarchical_mandate: 0.30, adaptive_anarchy: 0.72 },
  hierarchical_mandate:      { federated_republic: 0.45, consensus_democracy: 0.42, evolutionary_meritocracy: 0.55, decentralized_autonomy: 0.30, hierarchical_mandate: 1.00, adaptive_anarchy: 0.20 },
  adaptive_anarchy:          { federated_republic: 0.40, consensus_democracy: 0.45, evolutionary_meritocracy: 0.50, decentralized_autonomy: 0.72, hierarchical_mandate: 0.20, adaptive_anarchy: 1.00 },
};

function ideologyCompat(a: string, b: string): number {
  return IDEOLOGY_COMPAT[a]?.[b] ?? IDEOLOGY_COMPAT[b]?.[a] ?? 0.50;
}

// ── Specialization synergy ────────────────────────────────────────────────────

function specializationSynergy(a: string[], b: string[]): number {
  const COMPLEMENTS: Array<[string, string]> = [
    ['ingest', 'transform'], ['transform', 'validate'], ['validate', 'output'],
    ['compute', 'storage'], ['energy', 'compute'], ['governance', 'compliance'],
  ];
  let synergy = 0;
  for (const [x, y] of COMPLEMENTS) {
    const aHasX = a.some(s => s.includes(x));
    const bHasY = b.some(s => s.includes(y));
    const aHasY = a.some(s => s.includes(y));
    const bHasX = b.some(s => s.includes(x));
    if ((aHasX && bHasY) || (aHasY && bHasX)) synergy += 0.18;
  }
  return Math.min(synergy + 0.20, 1);
}

// ── Compatibility scoring ─────────────────────────────────────────────────────

export function scoreCompatibility(a: CivilizationProfile, b: CivilizationProfile): CompatibilityScore {
  const govCompat      = ideologyCompat(a.dominant_ideology, b.dominant_ideology);
  const policyTrans    = govCompat * 0.70 + Math.min(a.wisdom_score, b.wisdom_score) * 0.30;
  const treatyReady    = (a.trust_score * 0.40 + b.trust_score * 0.40 + govCompat * 0.20);
  const opSynergy      = specializationSynergy(a.specialization, b.specialization);
  const overall        = govCompat * 0.30 + policyTrans * 0.25 + treatyReady * 0.25 + opSynergy * 0.20;

  return {
    civ_a: a.civ_id,
    civ_b: b.civ_id,
    governance_compatibility: parseFloat(govCompat.toFixed(3)),
    policy_translatability:   parseFloat(policyTrans.toFixed(3)),
    treaty_readiness:         parseFloat(treatyReady.toFixed(3)),
    operational_synergy:      parseFloat(opSynergy.toFixed(3)),
    overall:                  parseFloat(overall.toFixed(3)),
  };
}

// ── Protocol message builder ──────────────────────────────────────────────────

export function buildProtocolMessage(
  fromCiv: string,
  toCiv: string | 'broadcast',
  kind: ProtocolKind,
  payload: Record<string, unknown>,
  ttlMs = 300_000,
): ProtocolMessage {
  return {
    msg_id:      uuidv4(),
    from_civ:    fromCiv,
    to_civ:      toCiv,
    kind,
    payload,
    signed_at_ms: Date.now(),
    ttl_ms:      ttlMs,
    acknowledged: false,
  };
}

// ── Policy translation ────────────────────────────────────────────────────────

export function translatePolicy(
  sourceIdeology: string,
  targetIdeology: string,
  policyBody: string,
): { translated: string; fidelity: number; warnings: string[] } {
  const fidelity = ideologyCompat(sourceIdeology, targetIdeology);
  const warnings: string[] = [];
  let translated = policyBody;

  // Simple doctrine-aware term substitution
  const SUBSTITUTIONS: Record<string, Record<string, string>> = {
    hierarchical_mandate: { decentralized_autonomy: { 'mandate': 'recommendation', 'order': 'proposal', 'authority': 'coordinator' } },
    decentralized_autonomy: { hierarchical_mandate: { 'recommendation': 'mandate', 'proposal': 'directive', 'optional': 'required' } },
    consensus_democracy: { hierarchical_mandate: { 'approved by all': 'directed by authority', 'quorum': 'executive decision' } },
  };

  const subs = SUBSTITUTIONS[sourceIdeology]?.[targetIdeology];
  if (subs) {
    for (const [from, to] of Object.entries(subs)) {
      translated = translated.replace(new RegExp(from, 'gi'), to);
    }
  }

  if (fidelity < 0.50) {
    warnings.push(`Low translation fidelity (${(fidelity * 100).toFixed(0)}%) — manual review recommended`);
  }
  if (sourceIdeology === 'adaptive_anarchy' || targetIdeology === 'adaptive_anarchy') {
    warnings.push('Adaptive anarchy governance is partially untranslatable — emergent rules may not map to explicit policies');
  }

  return { translated, fidelity, warnings };
}

// ── Interoperability report ───────────────────────────────────────────────────

const TREATY_READINESS_THRESHOLD = 0.55;

export function computeInteroperability(civs: CivilizationProfile[]): InteroperabilityReport {
  const pairs: CompatibilityScore[] = [];
  const federationReady: string[][] = [];
  const blocking: string[] = [];

  for (let i = 0; i < civs.length; i++) {
    for (let j = i + 1; j < civs.length; j++) {
      const score = scoreCompatibility(civs[i], civs[j]);
      pairs.push(score);
      if (score.treaty_readiness >= TREATY_READINESS_THRESHOLD) {
        federationReady.push([civs[i].civ_id, civs[j].civ_id]);
      }
      if (score.governance_compatibility < 0.30) {
        blocking.push(`${civs[i].civ_id} ↔ ${civs[j].civ_id}: governance incompatibility (${(score.governance_compatibility * 100).toFixed(0)}%)`);
      }
    }
  }

  pairs.sort((a, b) => b.overall - a.overall);
  const highest = pairs[0] ?? null;
  const lowest  = pairs[pairs.length - 1] ?? null;

  return {
    evaluated_at_ms:          Date.now(),
    civilization_pairs:       pairs,
    highest_compatibility:    highest,
    lowest_compatibility:     lowest,
    federation_ready_pairs:   federationReady,
    blocking_incompatibilities: blocking,
  };
}
