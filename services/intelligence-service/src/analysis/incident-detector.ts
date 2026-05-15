import { v4 as uuidv4 } from 'uuid';
import {
  DetectedIncident, IncidentKind, IncidentRisk, IncidentSignal, Bottleneck,
} from '../types';
import { ScoringWindow, AgentEfficiencyScore } from '../scoring/health-scorer';

// ─── Signal thresholds ────────────────────────────────────────────────────────

const RETRY_STORM_RATE_PER_MIN     = 8;    // retries/min across swarm → storm imminent
const DEGRADATION_EFFICIENCY_DROP  = 0.25; // 25% efficiency drop in second half
const CASCADE_ANOMALY_COUNT        = 3;    // ≥3 anomalies within 10s across ≥2 agents
const THROUGHPUT_COLLAPSE_DROP     = 0.6;  // 60% drop in event rate between halves
const INSTABILITY_FLIP_COUNT       = 4;    // ≥4 retry→success→retry flip transitions
const EXHAUSTION_RETRY_RATIO       = 0.35; // >35% of an agent's events are retries

const RETRY_TYPES   = new Set(['TASK_RETRY', 'AGENT_RETRY', 'CIRCUIT_BREAKER_HALF_OPEN']);
const ANOMALY_TYPES = new Set(['ANOMALY_DETECTED', 'CIRCUIT_BREAKER_OPEN', 'AGENT_TIMEOUT', 'QUEUE_OVERFLOW']);
const SUCCESS_TYPES = new Set(['TASK_COMPLETED', 'AGENT_STEP_COMPLETED']);
const FAILURE_TYPES = new Set(['TASK_FAILED', 'AGENT_FAILED', 'SWARM_FAILED']);

export function detectIncidents(
  window: ScoringWindow,
  agentScores: AgentEfficiencyScore[],
  bottlenecks: Bottleneck[]
): DetectedIncident[] {
  const incidents: DetectedIncident[] = [];

  const rs = detectRetryStorm(window);
  if (rs) incidents.push(rs);

  const sd = detectSwarmDegradation(window, agentScores);
  if (sd) incidents.push(sd);

  const ac = detectAnomalyCascade(window);
  if (ac) incidents.push(ac);

  const tc = detectThroughputCollapse(window);
  if (tc) incidents.push(tc);

  const oi = detectOrchestrationInstability(window);
  if (oi) incidents.push(oi);

  incidents.push(...detectAgentExhaustion(window, agentScores));

  return incidents.sort((a, b) =>
    riskValue(b.risk) - riskValue(a.risk) || b.probability - a.probability
  );
}

// ─── Retry storm ──────────────────────────────────────────────────────────────

function detectRetryStorm(window: ScoringWindow): DetectedIncident | null {
  const retries = window.events.filter(e => RETRY_TYPES.has(e.event_type));
  if (retries.length < 3) return null;

  const duration_min = Math.max(
    (window.window_end_ms - window.window_start_ms) / 60000, 0.1
  );
  const rate = retries.length / duration_min;

  if (rate < RETRY_STORM_RATE_PER_MIN * 0.5) return null;

  // Find onset: first 3-retry burst within 10s
  let onsetMs = retries[0].offset_ms;
  for (let i = 2; i < retries.length; i++) {
    if (retries[i].offset_ms - retries[i - 2].offset_ms <= 10000) {
      onsetMs = retries[i - 2].offset_ms;
      break;
    }
  }

  const probability = Math.min(rate / (RETRY_STORM_RATE_PER_MIN * 2), 1.0);
  const risk        = riskFromProbability(probability);

  const affectedAgents = [...new Set(retries.map(e => e.agent_id))];
  const affectedZones  = [...new Set(retries.map(e => e.zone_id).filter(Boolean) as string[])];

  const escalation_ms = probability > 0.7
    ? onsetMs + Math.round(30000 / probability)
    : null;

  return {
    id:           uuidv4(),
    kind:         'retry_storm',
    risk,
    probability,
    onset_ms:     onsetMs,
    predicted_escalation_ms: escalation_ms,
    affected_agents: affectedAgents,
    affected_zones:  affectedZones,
    description:  `Retry storm detected: ${retries.length} retries at ${rate.toFixed(1)}/min across ${affectedAgents.length} agents`,
    signals: [{
      signal_type:     'retry_rate_per_min',
      value:           rate,
      threshold:       RETRY_STORM_RATE_PER_MIN,
      triggered_at_ms: onsetMs,
    }],
  };
}

// ─── Swarm degradation ────────────────────────────────────────────────────────

function detectSwarmDegradation(
  window: ScoringWindow,
  agentScores: AgentEfficiencyScore[]
): DetectedIncident | null {
  if (window.events.length < 20) return null;

  const mid = Math.floor(window.events.length / 2);
  const firstHalf  = window.events.slice(0, mid);
  const secondHalf = window.events.slice(mid);

  const badRatio = (evts: typeof window.events) =>
    evts.filter(e => RETRY_TYPES.has(e.event_type) || FAILURE_TYPES.has(e.event_type)).length /
    Math.max(evts.length, 1);

  const d1 = badRatio(firstHalf);
  const d2 = badRatio(secondHalf);
  const drop = d2 - d1;

  if (drop < DEGRADATION_EFFICIENCY_DROP * 0.5) return null;

  const probability = Math.min(drop / DEGRADATION_EFFICIENCY_DROP, 1.0);
  const risk        = riskFromProbability(probability);

  const onsetMs = secondHalf[0]?.offset_ms ?? 0;
  const affectedAgents = agentScores.filter(a => a.efficiency < 0.5).map(a => a.agent_id);

  return {
    id:           uuidv4(),
    kind:         'swarm_degradation',
    risk,
    probability,
    onset_ms:     onsetMs,
    predicted_escalation_ms: probability > 0.6 ? onsetMs + 60000 : null,
    affected_agents: affectedAgents,
    affected_zones:  [],
    description:  `Swarm efficiency degrading: error rate rose ${(drop * 100).toFixed(0)}% in second half`,
    signals: [{
      signal_type:     'error_rate_increase',
      value:           drop,
      threshold:       DEGRADATION_EFFICIENCY_DROP,
      triggered_at_ms: onsetMs,
    }],
  };
}

// ─── Anomaly cascade ─────────────────────────────────────────────────────────

function detectAnomalyCascade(window: ScoringWindow): DetectedIncident | null {
  const anomalies = window.events.filter(e => ANOMALY_TYPES.has(e.event_type));
  if (anomalies.length < CASCADE_ANOMALY_COUNT) return null;

  // Look for CASCADE_ANOMALY_COUNT anomalies within 10s across ≥2 agents
  for (let i = CASCADE_ANOMALY_COUNT - 1; i < anomalies.length; i++) {
    const window10s = anomalies.slice(
      anomalies.findIndex(e => e.offset_ms >= anomalies[i].offset_ms - 10000), i + 1
    );
    const uniqueAgents = new Set(window10s.map(e => e.agent_id));

    if (window10s.length >= CASCADE_ANOMALY_COUNT && uniqueAgents.size >= 2) {
      const onsetMs    = window10s[0].offset_ms;
      const probability = Math.min(window10s.length / (CASCADE_ANOMALY_COUNT * 2), 1.0);
      const risk        = riskFromProbability(probability);

      return {
        id:           uuidv4(),
        kind:         'anomaly_cascade',
        risk,
        probability,
        onset_ms:     onsetMs,
        predicted_escalation_ms: onsetMs + 15000,
        affected_agents: [...uniqueAgents],
        affected_zones:  [...new Set(window10s.map(e => e.zone_id).filter(Boolean) as string[])],
        description:  `Anomaly cascade: ${window10s.length} anomalies across ${uniqueAgents.size} agents in 10s`,
        signals: [{
          signal_type:     'cascade_anomaly_count',
          value:           window10s.length,
          threshold:       CASCADE_ANOMALY_COUNT,
          triggered_at_ms: onsetMs,
        }],
      };
    }
  }
  return null;
}

// ─── Throughput collapse ──────────────────────────────────────────────────────

function detectThroughputCollapse(window: ScoringWindow): DetectedIncident | null {
  if (window.events.length < 10) return null;

  const mid         = Math.floor(window.events.length / 2);
  const firstRate   = mid;
  const secondRate  = window.events.length - mid;

  if (firstRate === 0) return null;
  const drop = (firstRate - secondRate) / firstRate;

  if (drop < THROUGHPUT_COLLAPSE_DROP) return null;

  const onsetMs    = window.events[mid]?.offset_ms ?? 0;
  const probability = Math.min(drop / 0.8, 1.0);

  return {
    id:           uuidv4(),
    kind:         'throughput_collapse',
    risk:         riskFromProbability(probability),
    probability,
    onset_ms:     onsetMs,
    predicted_escalation_ms: onsetMs + 30000,
    affected_agents: [],
    affected_zones:  [],
    description:  `Throughput collapsing: ${Math.round(drop * 100)}% drop in event rate`,
    signals: [{
      signal_type:     'throughput_drop_pct',
      value:           drop,
      threshold:       THROUGHPUT_COLLAPSE_DROP,
      triggered_at_ms: onsetMs,
    }],
  };
}

// ─── Orchestration instability ────────────────────────────────────────────────
// Counts retry→success→retry flips per agent.

function detectOrchestrationInstability(window: ScoringWindow): DetectedIncident | null {
  let totalFlips = 0;
  const affectedAgents: string[] = [];

  const byAgent = new Map<string, typeof window.events>();
  for (const e of window.events) {
    const arr = byAgent.get(e.agent_id) ?? [];
    arr.push(e);
    byAgent.set(e.agent_id, arr);
  }

  for (const [agent_id, events] of byAgent) {
    let flips = 0;
    let lastWasRetry = false;
    for (const e of events) {
      const isRetry   = RETRY_TYPES.has(e.event_type);
      const isSuccess = SUCCESS_TYPES.has(e.event_type);
      if (isRetry && !lastWasRetry) flips++;
      if (isSuccess) lastWasRetry = false;
      if (isRetry)   lastWasRetry = true;
    }
    if (flips >= 2) {
      totalFlips += flips;
      affectedAgents.push(agent_id);
    }
  }

  if (totalFlips < INSTABILITY_FLIP_COUNT) return null;

  const probability = Math.min(totalFlips / (INSTABILITY_FLIP_COUNT * 2), 1.0);
  const onsetMs     = window.events[0]?.offset_ms ?? 0;

  return {
    id:           uuidv4(),
    kind:         'orchestration_instability',
    risk:         riskFromProbability(probability),
    probability,
    onset_ms:     onsetMs,
    predicted_escalation_ms: null,
    affected_agents: affectedAgents,
    affected_zones:  [],
    description:  `Orchestration instability: ${totalFlips} retry/recovery flip cycles across ${affectedAgents.length} agents`,
    signals: [{
      signal_type:     'instability_flip_count',
      value:           totalFlips,
      threshold:       INSTABILITY_FLIP_COUNT,
      triggered_at_ms: onsetMs,
    }],
  };
}

// ─── Agent exhaustion ─────────────────────────────────────────────────────────

function detectAgentExhaustion(
  window: ScoringWindow,
  agentScores: AgentEfficiencyScore[]
): DetectedIncident[] {
  const results: DetectedIncident[] = [];

  for (const a of agentScores) {
    const ratio = a.retry_count / Math.max(a.event_count, 1);
    if (ratio < EXHAUSTION_RETRY_RATIO) continue;

    const probability = Math.min(ratio / 0.6, 1.0);
    const agentEvents = window.events.filter(e => e.agent_id === a.agent_id);
    const onsetMs     = agentEvents[0]?.offset_ms ?? 0;

    results.push({
      id:           uuidv4(),
      kind:         'agent_exhaustion',
      risk:         riskFromProbability(probability),
      probability,
      onset_ms:     onsetMs,
      predicted_escalation_ms: probability > 0.7 ? onsetMs + 20000 : null,
      affected_agents: [a.agent_id],
      affected_zones:  [...new Set(agentEvents.map(e => e.zone_id).filter(Boolean) as string[])],
      description:  `Agent ${a.agent_id} exhaustion: ${Math.round(ratio * 100)}% retry rate (${a.retry_count}/${a.event_count} events)`,
      signals: [{
        signal_type:     'agent_retry_ratio',
        value:           ratio,
        threshold:       EXHAUSTION_RETRY_RATIO,
        triggered_at_ms: onsetMs,
      }],
    });
  }
  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskFromProbability(p: number): IncidentRisk {
  if (p >= 0.8) return 'critical';
  if (p >= 0.6) return 'high';
  if (p >= 0.35) return 'medium';
  return 'low';
}

function riskValue(r: IncidentRisk): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[r];
}
