import { v4 as uuidv4 } from 'uuid';
import {
  CivilizationProfile, PlanetaryDomain, PlanetaryDomainKind,
  PlanetaryTwinState, PlanetaryTreaty,
} from './types';

// ── Domain construction ───────────────────────────────────────────────────────

function buildDomains(civs: CivilizationProfile[]): PlanetaryDomain[] {
  const avgHealth = civs.reduce((s, c) => s + c.health_index, 0) / Math.max(civs.length, 1);
  const allCivIds = civs.map(c => c.civ_id);
  const now       = Date.now();

  const DOMAIN_TEMPLATES: Array<{
    kind: PlanetaryDomainKind; name: string; criticality: number; baseCascade: number;
  }> = [
    { kind: 'compute_fabric',        name: 'Planetary Compute Fabric',       criticality: 0.95, baseCascade: 0.70 },
    { kind: 'energy_grid',           name: 'Global Energy Grid',             criticality: 0.90, baseCascade: 0.80 },
    { kind: 'communication_network', name: 'Planetary Communication Network', criticality: 0.85, baseCascade: 0.65 },
    { kind: 'ai_ecosystem',          name: 'AI Ecosystem Layer',             criticality: 0.80, baseCascade: 0.55 },
    { kind: 'governance_layer',      name: 'Federated Governance Layer',     criticality: 0.75, baseCascade: 0.45 },
    { kind: 'logistics_network',     name: 'Global Logistics Network',       criticality: 0.70, baseCascade: 0.50 },
    { kind: 'human_capital',         name: 'Human Capital Layer',            criticality: 0.65, baseCascade: 0.30 },
  ];

  return DOMAIN_TEMPLATES.map(t => {
    const domainHealth = Math.min(
      avgHealth * 0.70 + (1 - t.baseCascade * 0.30) * 0.30,
      1,
    );
    return {
      domain_id:       uuidv4(),
      kind:            t.kind,
      name:            t.name,
      controlling_civs: allCivIds,
      health:          parseFloat(domainHealth.toFixed(3)),
      capacity:        parseFloat((0.50 + avgHealth * 0.40).toFixed(3)),
      criticality:     t.criticality,
      cascade_risk:    parseFloat((t.baseCascade * (1 - avgHealth) * 1.2).toFixed(3)),
    };
  });
}

// ── Risk propagation ──────────────────────────────────────────────────────────

function estimateFailureDomains(domains: PlanetaryDomain[]): string[] {
  return domains
    .filter(d => d.health < 0.45 || d.cascade_risk > 0.40)
    .sort((a, b) => b.criticality - a.criticality)
    .map(d => d.name);
}

function computeSystemicFragility(domains: PlanetaryDomain[], civs: CivilizationProfile[]): number {
  const avgDomainHealth = domains.reduce((s, d) => s + d.health, 0) / Math.max(domains.length, 1);
  const maxCascade      = Math.max(...domains.map(d => d.cascade_risk));
  const avgCivHealth    = civs.reduce((s, c) => s + c.health_index, 0) / Math.max(civs.length, 1);
  return parseFloat(Math.min(
    (1 - avgDomainHealth) * 0.40 + maxCascade * 0.35 + (1 - avgCivHealth) * 0.25,
    1,
  ).toFixed(3));
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildPlanetaryTwin(
  civs: CivilizationProfile[],
  treaties: PlanetaryTreaty[],
): PlanetaryTwinState {
  const domains            = buildDomains(civs);
  const activeTreaties     = treaties.filter(t => t.status === 'active');
  const avgHealth          = civs.reduce((s, c) => s + c.health_index, 0) / Math.max(civs.length, 1);
  const avgWisdom          = civs.reduce((s, c) => s + c.wisdom_score, 0) / Math.max(civs.length, 1);
  const treatyCoverage     = activeTreaties.length > 0 ? Math.min(activeTreaties.length * 0.15, 0.40) : 0;
  const coordEfficiency    = parseFloat((avgWisdom * 0.50 + treatyCoverage + avgHealth * 0.20).toFixed(3));
  const systemicFragility  = computeSystemicFragility(domains, civs);
  const failureDomains     = estimateFailureDomains(domains);

  const priorities: string[] = [];
  if (systemicFragility > 0.60) priorities.push('CRITICAL: Systemic fragility above cascade threshold — initiate planetary resilience protocol');
  if (failureDomains.length > 0) priorities.push(`At-risk domains: ${failureDomains.slice(0, 2).join(', ')} — targeted intervention required`);
  if (activeTreaties.length === 0) priorities.push('No active treaties — planetary coordination severely limited');
  if (coordEfficiency < 0.45) priorities.push('Low coordination efficiency — knowledge federation treaty recommended');

  return {
    simulated_at_ms:         Date.now(),
    civilizations:           civs,
    domains,
    active_treaties:         activeTreaties,
    global_health_index:     parseFloat(avgHealth.toFixed(3)),
    systemic_fragility:      systemicFragility,
    coordination_efficiency: coordEfficiency,
    estimated_failure_domains: failureDomains,
    intervention_priorities: priorities,
  };
}
