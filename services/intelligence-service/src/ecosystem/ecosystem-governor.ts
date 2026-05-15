import {
  SwarmEcosystemState,
  EcosystemGovernanceDecision,
  EcosystemAction,
  SwarmSpecialization,
} from "../emergence/types";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const OVERLOAD_THRESHOLD      = 0.75;
const DEGRADED_THRESHOLD      = 0.45;
const ISOLATION_THRESHOLD     = 0.25;
const FEDERATION_BENEFIT_MIN  = 0.12;
const ACTION_COOLDOWN_MAP     = new Map<string, number>();
const ACTION_COOLDOWN_MS      = 45_000;

// ─── Public API ───────────────────────────────────────────────────────────────

export function decideEcosystem(
  swarms: SwarmEcosystemState[],
): EcosystemGovernanceDecision {
  const now = Date.now();
  const actions: EcosystemAction[] = [];

  for (const swarm of swarms) {
    const swarmActions = buildActionsForSwarm(swarm, swarms, now);
    actions.push(...swarmActions);
  }

  // Cross-swarm: federate compatible specialists
  const federateActions = detectFederationOpportunities(swarms, now);
  actions.push(...federateActions);

  // Apply cooldown gate
  const gated = actions.filter(a => {
    const key = `${a.kind}::${a.source_swarm}::${a.target_swarm ?? ""}`;
    const last = ACTION_COOLDOWN_MAP.get(key) ?? 0;
    if (now - last < ACTION_COOLDOWN_MS) return false;
    ACTION_COOLDOWN_MAP.set(key, now);
    return true;
  });

  // Sort: critical → high → medium → low
  gated.sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency));

  const ecosystemHealth  = avgHealth(swarms);
  const loadBalance      = computeLoadBalance(swarms);
  const propagationRisk  = computePropagationRisk(swarms);
  const federationStab   = computeFederationStability(swarms);

  return {
    decided_at_ms:       now,
    actions:             gated.slice(0, 8),
    propagation_risk:    round2(propagationRisk),
    ecosystem_health:    round2(ecosystemHealth),
    load_balance_score:  round2(loadBalance),
    federation_stability: round2(federationStab),
  };
}

// ─── Per-swarm actions ────────────────────────────────────────────────────────

function buildActionsForSwarm(
  swarm: SwarmEcosystemState,
  all: SwarmEcosystemState[],
  now: number,
): EcosystemAction[] {
  const actions: EcosystemAction[] = [];
  const others = all.filter(s => s.swarm_id !== swarm.swarm_id);

  // Emergency shutdown for critically degraded swarm
  if (swarm.health < ISOLATION_THRESHOLD && swarm.anomaly_rate > 0.4) {
    actions.push({
      kind: "emergency_shutdown",
      source_swarm: swarm.swarm_id,
      target_swarm: null,
      rationale: `Health ${pct(swarm.health)}% with ${pct(swarm.anomaly_rate)}% anomaly rate — emergency shutdown`,
      urgency: "critical",
      confidence: 0.90,
    });
    return actions;
  }

  // Isolate severely degraded swarm to prevent propagation
  if (swarm.health < DEGRADED_THRESHOLD && swarm.anomaly_rate > 0.25) {
    actions.push({
      kind: "isolate_swarm",
      source_swarm: swarm.swarm_id,
      target_swarm: null,
      rationale: `Health ${pct(swarm.health)}% — isolating to prevent cross-swarm anomaly propagation`,
      urgency: "high",
      confidence: 0.82,
    });
  }

  // Rebalance load from overloaded swarm to healthy peers
  if (swarm.is_overloaded && swarm.load > OVERLOAD_THRESHOLD) {
    const recipient = bestRecipient(others, swarm.specialization);
    if (recipient) {
      actions.push({
        kind: "rebalance_load",
        source_swarm: swarm.swarm_id,
        target_swarm: recipient.swarm_id,
        rationale: `${swarm.swarm_id} overloaded at ${pct(swarm.load)}% load — offloading to ${recipient.swarm_id}`,
        urgency: swarm.load > 0.90 ? "high" : "medium",
        confidence: 0.75,
      });
    }
  }

  // Throttle swarm that is spamming anomalies
  if (swarm.anomaly_rate > 0.30 && swarm.health > DEGRADED_THRESHOLD) {
    actions.push({
      kind: "throttle_swarm",
      source_swarm: swarm.swarm_id,
      target_swarm: null,
      rationale: `Anomaly rate ${pct(swarm.anomaly_rate)}% — throttling to contain blast radius`,
      urgency: "medium",
      confidence: 0.70,
    });
  }

  // Migrate agents from idle swarm to struggling neighbor
  if (swarm.load < 0.20 && swarm.health > 0.70) {
    const target = others.find(s => s.is_degraded && s.health > ISOLATION_THRESHOLD);
    if (target) {
      actions.push({
        kind: "migrate_agents",
        source_swarm: swarm.swarm_id,
        target_swarm: target.swarm_id,
        rationale: `${swarm.swarm_id} underutilized (${pct(swarm.load)}%) — migrating agents to assist ${target.swarm_id}`,
        urgency: "low",
        confidence: 0.65,
      });
    }
  }

  return actions;
}

// ─── Federation detection ─────────────────────────────────────────────────────

function detectFederationOpportunities(
  swarms: SwarmEcosystemState[],
  now: number,
): EcosystemAction[] {
  const actions: EcosystemAction[] = [];

  // Federate complementary specialists that are both healthy
  const specialists = swarms.filter(s =>
    s.health > 0.65 && s.specialization !== "generalist" && !s.is_degraded,
  );

  for (let i = 0; i < specialists.length; i++) {
    for (let j = i + 1; j < specialists.length; j++) {
      const a = specialists[i];
      const b = specialists[j];
      if (areComplementary(a.specialization, b.specialization)) {
        const gain = (a.health + b.health) / 2 * FEDERATION_BENEFIT_MIN + FEDERATION_BENEFIT_MIN;
        if (gain >= FEDERATION_BENEFIT_MIN) {
          actions.push({
            kind: "federate_swarms",
            source_swarm: a.swarm_id,
            target_swarm: b.swarm_id,
            rationale: `Federate ${a.specialization} + ${b.specialization} for ${pct(gain)}% expected gain`,
            urgency: "low",
            confidence: 0.60,
          });
        }
      }
    }
  }
  return actions.slice(0, 2);
}

function areComplementary(a: SwarmSpecialization, b: SwarmSpecialization): boolean {
  const pairs: Array<[SwarmSpecialization, SwarmSpecialization]> = [
    ["ingest", "transform"],
    ["transform", "validate"],
    ["validate", "output"],
    ["coordination", "ingest"],
    ["coordination", "output"],
  ];
  return pairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function computeLoadBalance(swarms: SwarmEcosystemState[]): number {
  if (swarms.length < 2) return 1;
  const loads = swarms.map(s => s.load);
  const m = avg(loads);
  if (m === 0) return 1;
  const variance = loads.reduce((s, l) => s + (l - m) ** 2, 0) / loads.length;
  const cv = Math.sqrt(variance) / m;
  return clamp01(1 - cv * 0.5);
}

function computePropagationRisk(swarms: SwarmEcosystemState[]): number {
  const degradedCount  = swarms.filter(s => s.is_degraded).length;
  const highAnomalyCount = swarms.filter(s => s.anomaly_rate > 0.25).length;
  return clamp01(
    (degradedCount / Math.max(swarms.length, 1)) * 0.5 +
    (highAnomalyCount / Math.max(swarms.length, 1)) * 0.5,
  );
}

function computeFederationStability(swarms: SwarmEcosystemState[]): number {
  if (!swarms.length) return 1;
  const avgH = avgHealth(swarms);
  const allHealthy = swarms.filter(s => !s.is_degraded && !s.is_overloaded).length;
  return clamp01(avgH * 0.6 + (allHealthy / swarms.length) * 0.4);
}

function avgHealth(swarms: SwarmEcosystemState[]): number {
  return swarms.length ? avg(swarms.map(s => s.health)) : 0;
}

function bestRecipient(
  candidates: SwarmEcosystemState[],
  sourceSpec: SwarmSpecialization,
): SwarmEcosystemState | null {
  const eligible = candidates.filter(s =>
    s.load < 0.60 && s.health > 0.55 && !s.is_degraded,
  );
  if (!eligible.length) return null;
  return eligible.sort((a, b) => a.load - b.load)[0];
}

function urgencyRank(u: EcosystemAction["urgency"]): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[u] ?? 0;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function pct(v: number): number {
  return Math.round(v * 100);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
