import { SwarmEvent, SwarmHealthReport } from "../types";
import { SwarmCoherenceReport } from "./types";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const ANOMALY_TYPES    = new Set(["ANOMALY_DETECTED", "CIRCUIT_BREAKER_OPEN", "AGENT_FAILED", "AGENT_TIMEOUT"]);
const RETRY_TYPES      = new Set(["TASK_RETRY", "AGENT_RETRY", "RETRY_ATTEMPT"]);
const RECOVERY_TYPES   = new Set(["AGENT_RECOVERED", "CIRCUIT_BREAKER_CLOSED"]);
const HANDOFF_TYPES    = new Set(["TASK_HANDOFF", "TASK_DELEGATED"]);

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeCoherence(
  swarmId: string,
  events: SwarmEvent[],
  healthReport: SwarmHealthReport,
  healthHistory: number[],     // recent overall_health values, newest last
): SwarmCoherenceReport {
  const sorted = [...events].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const agents = uniqueAgents(sorted);

  const harmony             = computeHarmony(healthReport, sorted, agents);
  const collectiveStress    = computeCollectiveStress(sorted, agents, healthReport);
  const coordinationEntropy = computeCoordinationEntropy(sorted, agents);
  const syncQuality         = computeSyncQuality(sorted, agents);
  const operationalCohesion = computeOperationalCohesion(sorted, agents);
  const systemicResilience  = computeSystemicResilience(sorted, healthHistory);

  const label = deriveLabel(harmony, collectiveStress, syncQuality);
  const stressor = dominantStressor(sorted, healthReport);

  return {
    swarm_id: swarmId,
    computed_at_ms: Date.now(),
    harmony:              clamp01(harmony),
    collective_stress:    clamp01(collectiveStress),
    coordination_entropy: clamp01(coordinationEntropy),
    synchronization_quality: clamp01(syncQuality),
    operational_cohesion: clamp01(operationalCohesion),
    systemic_resilience:  clamp01(systemicResilience),
    coherence_label: label,
    dominant_stressor: stressor,
    recommendations: buildRecommendations(label, stressor, harmony, collectiveStress),
  };
}

// ─── Harmony ─────────────────────────────────────────────────────────────────
// Weighted composite of health sub-scores + structural smoothness

function computeHarmony(
  report: SwarmHealthReport,
  events: SwarmEvent[],
  agents: string[],
): number {
  const healthComponent  = report.overall_health;
  const balanceComponent = report.agent_balance;
  const throughputComp   = report.throughput_stability;

  // Structural harmony: fraction of agents completing tasks successfully
  const completions = events.filter(e => e.event_type === "TASK_COMPLETED").length;
  const failures    = events.filter(e => ANOMALY_TYPES.has(e.event_type)).length;
  const structuralH = completions + failures > 0
    ? completions / (completions + failures)
    : 0.5;

  return (healthComponent * 0.35) + (balanceComponent * 0.25) +
         (throughputComp * 0.20) + (structuralH * 0.20);
}

// ─── Collective stress ────────────────────────────────────────────────────────
// Inversely correlated with health; driven by retries, anomalies, timeouts

function computeCollectiveStress(
  events: SwarmEvent[],
  agents: string[],
  report: SwarmHealthReport,
): number {
  const total    = Math.max(events.length, 1);
  const retries  = events.filter(e => RETRY_TYPES.has(e.event_type)).length;
  const anomalies = events.filter(e => ANOMALY_TYPES.has(e.event_type)).length;
  const timeouts  = events.filter(e => e.event_type === "AGENT_TIMEOUT").length;

  const retryStress   = Math.min(retries  / total * 8, 1);
  const anomalyStress = Math.min(anomalies / total * 10, 1);
  const timeoutStress = Math.min(timeouts  / Math.max(agents.length, 1) * 2, 1);
  const healthStress  = 1 - report.overall_health;

  return (retryStress * 0.25) + (anomalyStress * 0.30) +
         (timeoutStress * 0.20) + (healthStress * 0.25);
}

// ─── Coordination entropy ─────────────────────────────────────────────────────
// Shannon entropy of the agent-transition sequence (reused from emergent engine)

function computeCoordinationEntropy(events: SwarmEvent[], agents: string[]): number {
  if (agents.length < 2) return 0;
  const idx = new Map(agents.map((a, i) => [a, i]));
  const transitions: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const p = idx.get(events[i - 1].agent_id) ?? -1;
    const c = idx.get(events[i].agent_id)     ?? -1;
    if (p >= 0 && c >= 0) transitions.push(p * agents.length + c);
  }
  if (!transitions.length) return 0.5;
  const counts = new Map<number, number>();
  for (const t of transitions) counts.set(t, (counts.get(t) ?? 0) + 1);
  const n = transitions.length;
  let H = 0;
  for (const c of counts.values()) {
    const p = c / n;
    H -= p * Math.log2(p);
  }
  const maxH = Math.log2(agents.length * agents.length);
  return maxH > 0 ? H / maxH : 0;
}

// ─── Synchronization quality ──────────────────────────────────────────────────
// How often completions cluster in time (within 500ms windows)

function computeSyncQuality(events: SwarmEvent[], agents: string[]): number {
  if (agents.length < 2) return 1;
  const completions = events.filter(e => e.event_type === "TASK_COMPLETED");
  if (completions.length < 2) return 0.5;
  let sync = 0;
  let total = 0;
  for (let i = 0; i < completions.length; i++) {
    for (let j = i + 1; j < completions.length; j++) {
      const lag = completions[j].timestamp_ms - completions[i].timestamp_ms;
      if (lag > 2000) break;
      total++;
      if (lag <= 500 && completions[i].agent_id !== completions[j].agent_id) sync++;
    }
  }
  return total > 0 ? sync / total : 0.5;
}

// ─── Operational cohesion ─────────────────────────────────────────────────────
// How well agents converge on the same swarm goal: ratio of on-swarm events

function computeOperationalCohesion(events: SwarmEvent[], agents: string[]): number {
  if (!agents.length) return 0;

  // Events per agent — penalize agents with 0 completions (off-task)
  const completionCounts = new Map<string, number>();
  for (const ev of events) {
    if (ev.event_type === "TASK_COMPLETED") {
      completionCounts.set(ev.agent_id, (completionCounts.get(ev.agent_id) ?? 0) + 1);
    }
  }
  const contributing = agents.filter(a => (completionCounts.get(a) ?? 0) > 0).length;
  const participationRatio = contributing / agents.length;

  // Handoff balance — are handoffs distributed evenly?
  const handoffCounts = new Map<string, number>();
  for (const ev of events) {
    if (HANDOFF_TYPES.has(ev.event_type)) {
      handoffCounts.set(ev.agent_id, (handoffCounts.get(ev.agent_id) ?? 0) + 1);
    }
  }
  const handoffVals = [...handoffCounts.values()];
  const handoffCV   = handoffVals.length > 1 ? coefficientOfVariation(handoffVals) : 0;
  const handoffBalance = 1 / (1 + handoffCV);

  return participationRatio * 0.6 + handoffBalance * 0.4;
}

// ─── Systemic resilience ──────────────────────────────────────────────────────
// How quickly the swarm recovers from anomalies

function computeSystemicResilience(
  events: SwarmEvent[],
  healthHistory: number[],
): number {
  // Recovery ratio from events
  const anomalies  = events.filter(e => ANOMALY_TYPES.has(e.event_type)).length;
  const recoveries = events.filter(e => RECOVERY_TYPES.has(e.event_type)).length;
  const eventResilience = anomalies > 0 ? Math.min(recoveries / anomalies, 1) : 1;

  // Health mean from history (recency-weighted)
  let historyScore = 0.5;
  if (healthHistory.length > 0) {
    const weights = healthHistory.map((_, i) => i + 1);
    const totalW  = weights.reduce((a, b) => a + b, 0);
    historyScore  = healthHistory.reduce((acc, h, i) => acc + h * weights[i], 0) / totalW;
  }

  return eventResilience * 0.5 + historyScore * 0.5;
}

// ─── Label + stressor ─────────────────────────────────────────────────────────

function deriveLabel(
  harmony: number,
  stress: number,
  syncQ: number,
): SwarmCoherenceReport["coherence_label"] {
  if (harmony > 0.72 && stress < 0.25) return "cohesive";
  if (stress > 0.65 || harmony < 0.35) return "critical";
  if (syncQ < 0.3 || harmony < 0.5)    return "fragmented";
  return "stressed";
}

function dominantStressor(events: SwarmEvent[], report: SwarmHealthReport): string | null {
  if (report.retry_pressure < 0.35) return "retry_pressure";
  if (report.anomaly_severity < 0.40) return "anomaly_concentration";
  if (report.agent_balance < 0.40) return "workload_imbalance";
  if (report.throughput_stability < 0.40) return "throughput_instability";
  if (report.orchestration_efficiency < 0.50) return "low_orchestration_efficiency";
  return null;
}

function buildRecommendations(
  label: SwarmCoherenceReport["coherence_label"],
  stressor: string | null,
  harmony: number,
  stress: number,
): string[] {
  const out: string[] = [];
  if (label === "critical") out.push("Immediate intervention required — coherence critical");
  if (stressor === "retry_pressure") out.push("Suppress retries with exponential backoff to reduce collective stress");
  if (stressor === "anomaly_concentration") out.push("Quarantine anomaly origin zone to prevent propagation");
  if (stressor === "workload_imbalance") out.push("Rebalance task distribution across agents");
  if (stressor === "throughput_instability") out.push("Introduce ingestion smoothing to stabilize throughput");
  if (harmony < 0.4) out.push("Consider topology restructuring to improve agent harmony");
  return out.slice(0, 4);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function uniqueAgents(events: SwarmEvent[]): string[] {
  return [...new Set(events.map(e => e.agent_id))];
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  if (m === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) / m;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
