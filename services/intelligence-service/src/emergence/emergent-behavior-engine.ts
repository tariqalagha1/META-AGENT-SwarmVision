import { SwarmEvent } from "../types";
import {
  CollaborationArchetype,
  CollaborationEdge,
  EmergentBehaviorReport,
  EmergentRetryPattern,
  AnomalyPropagationSignature,
  OperationalCulturePattern,
} from "./types";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const SYNC_WINDOW_MS = 500;            // events within 500ms are "synchronous"
const HANDOFF_EVENT_TYPES = new Set(["TASK_HANDOFF", "TASK_DELEGATED", "TASK_TRANSFER"]);
const RETRY_EVENT_TYPES   = new Set(["TASK_RETRY", "AGENT_RETRY", "RETRY_ATTEMPT"]);
const ANOMALY_EVENT_TYPES = new Set(["ANOMALY_DETECTED", "CIRCUIT_BREAKER_OPEN", "AGENT_TIMEOUT", "AGENT_FAILED"]);
const RECOVERY_EVENT_TYPES = new Set(["AGENT_RECOVERED", "CIRCUIT_BREAKER_CLOSED", "TASK_COMPLETED"]);

// ─── Public API ───────────────────────────────────────────────────────────────

export function analyzeEmergentBehavior(
  swarmId: string,
  events: SwarmEvent[],
  windowMs: number,
): EmergentBehaviorReport {
  const now = Date.now();
  const sorted = [...events].sort((a, b) => eventMs(a) - eventMs(b));

  const agents = uniqueAgents(sorted);
  const graph  = buildCollaborationGraph(sorted, agents);

  const archetype = inferArchetype(graph, agents, sorted);
  const syncQuality = computeSynchronizationQuality(sorted, agents);
  const entropy     = computeCoordinationEntropy(sorted, agents);
  const retryPat    = detectRetryPattern(sorted, agents);
  const anomalyProp = detectAnomalyPropagation(sorted, agents);
  const culture     = inferCulture(sorted, syncQuality, retryPat, anomalyProp);

  return {
    swarm_id: swarmId,
    analyzed_at_ms: now,
    window_ms: windowMs,
    collaboration_archetype: archetype.kind,
    archetype_confidence: archetype.confidence,
    synchronization_quality: clamp01(syncQuality),
    coordination_entropy: clamp01(entropy),
    emergent_retry_pattern: retryPat,
    anomaly_propagation: anomalyProp,
    operational_culture: culture.kind,
    culture_confidence: culture.confidence,
    collaboration_graph: graph,
    signals: buildSignals(archetype.kind, culture.kind, retryPat, anomalyProp, syncQuality),
  };
}

// ─── Collaboration graph ──────────────────────────────────────────────────────

function buildCollaborationGraph(events: SwarmEvent[], agents: string[]): CollaborationEdge[] {
  const edgeMap = new Map<string, { count: number; latencies: number[]; ok: number }>();

  for (const ev of events) {
    if (!HANDOFF_EVENT_TYPES.has(ev.event_type)) continue;
    const toAgent = ev.data?.target_agent_id as string | undefined;
    if (!toAgent || toAgent === ev.agent_id) continue;

    const key = `${ev.agent_id}::${toAgent}`;
    const e = edgeMap.get(key) ?? { count: 0, latencies: [], ok: 0 };

    // Estimate latency: look for next TASK_COMPLETED from toAgent after this handoff
    const handoffTs = eventMs(ev);
    const nextCompletion = events.find(
      x => x.agent_id === toAgent &&
           x.event_type === "TASK_COMPLETED" &&
           eventMs(x) > handoffTs,
    );
    if (nextCompletion) e.latencies.push(eventMs(nextCompletion) - handoffTs);
    e.count++;
    e.ok++;

    edgeMap.set(key, e);
  }

  return Array.from(edgeMap.entries()).map(([key, d]) => {
    const [from, to] = key.split("::");
    const avgLatency = d.latencies.length
      ? d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length
      : 0;
    return {
      from_agent: from,
      to_agent: to,
      handoff_count: d.count,
      avg_latency_ms: Math.round(avgLatency),
      reliability: d.count > 0 ? d.ok / d.count : 0,
    };
  });
}

// ─── Archetype inference ──────────────────────────────────────────────────────

function inferArchetype(
  graph: CollaborationEdge[],
  agents: string[],
  events: SwarmEvent[],
): { kind: CollaborationArchetype; confidence: number } {
  if (agents.length === 0) return { kind: "pipeline", confidence: 0.5 };

  // Pipeline: each node has at most one outbound + one inbound edge (chain)
  const outDegree = new Map<string, number>();
  const inDegree  = new Map<string, number>();
  for (const e of graph) {
    outDegree.set(e.from_agent, (outDegree.get(e.from_agent) ?? 0) + 1);
    inDegree.set(e.to_agent,   (inDegree.get(e.to_agent)   ?? 0) + 1);
  }
  const maxOut = Math.max(0, ...outDegree.values());
  const maxIn  = Math.max(0, ...inDegree.values());

  if (graph.length === 0) return { kind: "pipeline", confidence: 0.6 };

  // Hub-spoke: one node with very high out-degree
  const hubCandidate = [...outDegree.entries()].find(([, d]) => d >= agents.length - 1);
  if (hubCandidate) return { kind: "hub_spoke", confidence: 0.80 };

  // Mesh: high edge density relative to N*(N-1)
  const possibleEdges = agents.length * (agents.length - 1);
  const density = possibleEdges > 0 ? graph.length / possibleEdges : 0;
  if (density > 0.5) return { kind: "mesh", confidence: 0.75 };

  // Competitive: multiple agents handling same task_ids
  const taskCounts = new Map<string, Set<string>>();
  for (const ev of events) {
    if (ev.event_type !== "TASK_COMPLETED") continue;
    const tid = ev.data?.task_id as string | undefined;
    if (!tid) continue;
    const s = taskCounts.get(tid) ?? new Set();
    s.add(ev.agent_id);
    taskCounts.set(tid, s);
  }
  const competitive = [...taskCounts.values()].some(s => s.size > 1);
  if (competitive) return { kind: "competitive", confidence: 0.70 };

  // Consensus: look for quorum-style task progression
  const completionsPerTask = new Map<string, number>();
  for (const ev of events) {
    if (ev.event_type !== "TASK_COMPLETED") continue;
    const tid = ev.data?.task_id as string | undefined;
    if (!tid) continue;
    completionsPerTask.set(tid, (completionsPerTask.get(tid) ?? 0) + 1);
  }
  const avgCompletions = avg([...completionsPerTask.values()]);
  if (avgCompletions >= 2.5) return { kind: "consensus", confidence: 0.65 };

  // Pipeline: max 1 out + 1 in per node and linear structure
  if (maxOut <= 1 && maxIn <= 1) return { kind: "pipeline", confidence: 0.85 };

  return { kind: "emergent_hybrid", confidence: 0.55 };
}

// ─── Synchronization quality ──────────────────────────────────────────────────
// High quality = agents emit completion events in tight temporal clusters

function computeSynchronizationQuality(events: SwarmEvent[], agents: string[]): number {
  if (agents.length < 2) return 1.0;

  const completions = events.filter(e => e.event_type === "TASK_COMPLETED");
  if (completions.length < 2) return 0.5;

  // Group completions into SYNC_WINDOW_MS windows
  let syncedPairs = 0;
  let totalPairs  = 0;
  for (let i = 0; i < completions.length; i++) {
    const left = completions[i];
    if (!left) continue;
    for (let j = i + 1; j < completions.length; j++) {
      const right = completions[j];
      if (!right) continue;
      if (eventMs(right) - eventMs(left) > SYNC_WINDOW_MS * 4) break;
      totalPairs++;
      if (
        eventMs(right) - eventMs(left) <= SYNC_WINDOW_MS &&
        left.agent_id !== right.agent_id
      ) syncedPairs++;
    }
  }
  return totalPairs > 0 ? syncedPairs / totalPairs : 0.5;
}

// ─── Coordination entropy ─────────────────────────────────────────────────────
// Low entropy = agents take turns in a predictable order

function computeCoordinationEntropy(events: SwarmEvent[], agents: string[]): number {
  if (agents.length < 2) return 0.0;

  const agentIndex = new Map(agents.map((a, i) => [a, i]));
  const transitions: number[] = [];

  for (let i = 1; i < events.length; i++) {
    const prev = agentIndex.get(events[i - 1].agent_id) ?? -1;
    const curr = agentIndex.get(events[i].agent_id) ?? -1;
    if (prev >= 0 && curr >= 0) transitions.push(prev * agents.length + curr);
  }
  if (transitions.length === 0) return 0.5;

  // Shannon entropy of transition distribution
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

// ─── Retry pattern detection ──────────────────────────────────────────────────

function detectRetryPattern(events: SwarmEvent[], agents: string[]): EmergentRetryPattern {
  const retryEvs = events.filter(e => RETRY_EVENT_TYPES.has(e.event_type));
  if (retryEvs.length === 0) {
    return { kind: "absent", participating_agents: [], avg_retry_lag_ms: 0, propagation_coefficient: 0 };
  }

  const byAgent = groupBy(retryEvs, e => e.agent_id);
  const participatingAgents = Object.keys(byAgent);

  // Propagation coefficient: fraction of agents whose retries follow another agent's within 2s
  let propagated = 0;
  for (let i = 0; i < retryEvs.length; i++) {
    for (let j = i + 1; j < retryEvs.length; j++) {
      const left = retryEvs[i];
      const right = retryEvs[j];
      if (!left || !right) continue;
      const lag = eventMs(right) - eventMs(left);
      if (lag > 2000) break;
      if (left.agent_id !== right.agent_id) { propagated++; break; }
    }
  }
  const propagationCoeff = retryEvs.length > 0 ? propagated / retryEvs.length : 0;

  // Avg lag between consecutive retries
  const lags: number[] = [];
  for (let i = 1; i < retryEvs.length; i++) {
    const curr = retryEvs[i];
    const prev = retryEvs[i - 1];
    if (!curr || !prev) continue;
    lags.push(eventMs(curr) - eventMs(prev));
  }
  const avgLag = lags.length ? avg(lags) : 0;

  // Classify
  let kind: EmergentRetryPattern["kind"] = "isolated";
  if (propagationCoeff > 0.6 && retryEvs.length > 8) kind = "storm";
  else if (propagationCoeff > 0.4) kind = "cascading";
  else if (avgLag < 500 && participatingAgents.length > 1) kind = "synchronized";

  return {
    kind,
    participating_agents: participatingAgents,
    avg_retry_lag_ms: Math.round(avgLag),
    propagation_coefficient: round2(propagationCoeff),
  };
}

// ─── Anomaly propagation ──────────────────────────────────────────────────────

function detectAnomalyPropagation(events: SwarmEvent[], agents: string[]): AnomalyPropagationSignature {
  const anomalies = events.filter(e => ANOMALY_EVENT_TYPES.has(e.event_type));
  if (anomalies.length === 0) {
    return {
      kind: "isolated",
      origin_agent: null,
      affected_zones: [],
      propagation_speed_ms: 0,
      blast_radius: 0,
    };
  }

  const origin = anomalies[0];
  const affectedAgents = new Set(anomalies.map(e => e.agent_id));
  const affectedZones  = unique(anomalies.map(e => e.channel ?? "unknown").filter(Boolean));
  const blastRadius    = agents.length > 0 ? affectedAgents.size / agents.length : 0;

  // Speed: ms between first and last anomaly divided by number of hops
  const firstMs = eventMs(anomalies[0]!);
  const lastMs  = eventMs(anomalies[anomalies.length - 1]!);
  const hops    = Math.max(affectedAgents.size - 1, 1);
  const speedMs = (lastMs - firstMs) / hops;

  let kind: AnomalyPropagationSignature["kind"] = "isolated";
  if (blastRadius > 0.6) kind = "epidemic";
  else if (blastRadius > 0.3 && affectedZones.length > 1) kind = "fan_out";
  else if (blastRadius > 0.15) kind = "linear_spread";
  else if (affectedAgents.size === 1) kind = "contained";

  return {
    kind,
    origin_agent: origin.agent_id,
    affected_zones: affectedZones,
    propagation_speed_ms: Math.round(speedMs),
    blast_radius: round2(blastRadius),
  };
}

// ─── Operational culture inference ───────────────────────────────────────────

function inferCulture(
  events: SwarmEvent[],
  syncQuality: number,
  retry: EmergentRetryPattern,
  anomaly: AnomalyPropagationSignature,
): { kind: OperationalCulturePattern; confidence: number } {
  const totalEvs      = events.length;
  const recoveries    = events.filter(e => RECOVERY_EVENT_TYPES.has(e.event_type)).length;
  const anomalies     = events.filter(e => ANOMALY_EVENT_TYPES.has(e.event_type)).length;
  const retries       = events.filter(e => RETRY_EVENT_TYPES.has(e.event_type)).length;
  const retryRatio    = totalEvs > 0 ? retries / totalEvs : 0;
  const anomalyRatio  = totalEvs > 0 ? anomalies / totalEvs : 0;
  const recoveryRatio = anomalies > 0 ? recoveries / anomalies : 1;

  if (retryRatio > 0.2 && anomaly.kind === "epidemic") {
    return { kind: "chaotic", confidence: 0.72 };
  }
  if (anomalyRatio < 0.05 && syncQuality > 0.6 && retryRatio < 0.05) {
    return { kind: "high_reliability", confidence: 0.80 };
  }
  if (recoveryRatio > 0.75 && anomalyRatio < 0.15) {
    return { kind: "agile_recovery", confidence: 0.75 };
  }
  if (syncQuality > 0.7 && retryRatio > 0.1) {
    return { kind: "brittle_efficient", confidence: 0.65 };
  }
  if (retryRatio < 0.08 && anomalyRatio < 0.10 && syncQuality < 0.4) {
    return { kind: "conservative", confidence: 0.62 };
  }
  return { kind: "adaptive", confidence: 0.55 };
}

// ─── Signal builder ───────────────────────────────────────────────────────────

function buildSignals(
  archetype: CollaborationArchetype,
  culture: OperationalCulturePattern,
  retry: EmergentRetryPattern,
  anomaly: AnomalyPropagationSignature,
  syncQ: number,
): string[] {
  const out: string[] = [];
  out.push(`Collaboration archetype: ${archetype}`);
  out.push(`Operational culture: ${culture}`);
  if (retry.kind !== "absent") {
    out.push(`Retry pattern: ${retry.kind} (propagation ${Math.round(retry.propagation_coefficient * 100)}%)`);
  }
  if (anomaly.kind !== "isolated") {
    out.push(`Anomaly propagation: ${anomaly.kind} — blast radius ${Math.round(anomaly.blast_radius * 100)}%`);
  }
  if (syncQ < 0.3) out.push("Low synchronization quality — agents are operating out of phase");
  if (syncQ > 0.8) out.push("High synchronization quality — agents are tightly coordinated");
  return out;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function uniqueAgents(events: SwarmEvent[]): string[] {
  return unique(events.map(e => e.agent_id));
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, T[]> {
  const r: Record<string, T[]> = {};
  for (const x of arr) {
    const k = key(x);
    (r[k] = r[k] ?? []).push(x);
  }
  return r;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function eventMs(ev: SwarmEvent): number {
  return ev.timestamp_ms ?? ev.offset_ms ?? 0;
}
