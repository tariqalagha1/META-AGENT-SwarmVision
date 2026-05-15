import { v4 as uuidv4 } from 'uuid';
import {
  CivilizationProfile, ResourcePool, ResourceKind,
  ResourceAllocationDecision,
} from './types';

// ── Pool modeling ─────────────────────────────────────────────────────────────

export function buildResourcePools(civs: CivilizationProfile[]): ResourcePool[] {
  const KINDS: ResourceKind[] = ['compute', 'energy', 'bandwidth', 'storage', 'ai_capacity', 'human_expertise'];
  const pools: ResourcePool[] = [];

  for (const civ of civs) {
    for (const kind of KINDS) {
      const baseCapacity = 100 + civ.wisdom_score * 50 + civ.health_index * 50;
      const utilization  = 0.40 + (1 - civ.health_index) * 0.35;
      const allocated    = Math.floor(baseCapacity * utilization);
      const reserved     = Math.floor(baseCapacity * 0.10);
      pools.push({
        pool_id:         uuidv4(),
        kind,
        owning_civ:      civ.civ_id,
        total_capacity:  parseFloat(baseCapacity.toFixed(1)),
        allocated,
        reserved,
        available:       parseFloat((baseCapacity - allocated - reserved).toFixed(1)),
        cost_per_unit:   parseFloat((0.10 + (1 - civ.health_index) * 0.20).toFixed(3)),
      });
    }
  }
  return pools;
}

// ── Allocation decisions ──────────────────────────────────────────────────────

export function orchestrateResources(
  civs: CivilizationProfile[],
  pools: ResourcePool[],
): ResourceAllocationDecision {
  const now         = Date.now();
  const allocations: ResourceAllocationDecision['allocations'] = [];
  const rejected: string[] = [];

  // Identify surplus and deficit civilizations per resource kind
  const KINDS: ResourceKind[] = ['compute', 'energy', 'bandwidth', 'ai_capacity'];

  for (const kind of KINDS) {
    const kindPools = pools.filter(p => p.kind === kind);

    // Surplus: available > 25% of total
    const surplusPools = kindPools.filter(p => p.available / p.total_capacity > 0.25);
    // Deficit: available < 10% of total AND owning civ health < 0.60
    const deficitPools = kindPools.filter(p => {
      const civ = civs.find(c => c.civ_id === p.owning_civ);
      return p.available / p.total_capacity < 0.10 && (civ?.health_index ?? 1) < 0.60;
    });

    for (const deficit of deficitPools) {
      const supplier = surplusPools[0];
      if (!supplier) {
        rejected.push(`${deficit.owning_civ} needs ${kind} but no surplus available`);
        continue;
      }

      const deficitCiv = civs.find(c => c.civ_id === deficit.owning_civ);
      const isEmergency = (deficitCiv?.health_index ?? 1) < 0.30;
      const amount = Math.min(supplier.available * 0.40, deficit.total_capacity * 0.20);

      allocations.push({
        from_civ:  supplier.owning_civ,
        to_civ:    deficit.owning_civ,
        resource:  kind,
        amount:    parseFloat(amount.toFixed(1)),
        rationale: isEmergency
          ? `Emergency allocation: ${deficit.owning_civ} health critical — solidarity pricing`
          : `Efficiency rebalancing: ${supplier.owning_civ} surplus > 25%, ${deficit.owning_civ} at capacity`,
        priority:  isEmergency ? 'emergency' : 'medium',
      });

      // Mutate pools for subsequent iterations
      supplier.available -= amount;
      deficit.allocated  += amount;
    }
  }

  const totalRebalanced = allocations.reduce((s, a) => s + a.amount, 0);
  const efficiencyGain  = Math.min(allocations.length * 0.04 + 0.05, 0.35);
  const equityScore     = civs.length > 0
    ? 1 - (allocations.filter(a => a.priority === 'emergency').length / Math.max(civs.length, 1)) * 0.30
    : 0.80;

  return {
    decided_at_ms:  now,
    allocations,
    total_rebalanced: parseFloat(totalRebalanced.toFixed(1)),
    efficiency_gain:  parseFloat(efficiencyGain.toFixed(3)),
    equity_score:     parseFloat(equityScore.toFixed(3)),
    rejected_requests: rejected,
  };
}
