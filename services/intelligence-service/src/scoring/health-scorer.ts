import { v4 as uuidv4 } from 'uuid';
import {
  SwarmHealthReport, AgentEfficiencyScore,
  Bottleneck, BottleneckKind,
} from '../types';
import { detectBottlenecks } from '../analysis/bottleneck-detector';
import { detectIncidents } from '../analysis/incident-detector';

// ─── Raw event window passed to the scorer ───────────────────────────────────

export interface ScoringWindow {
  swarm_id:       string;
  started_at_ms:  number;
  window_start_ms: number;
  window_end_ms:   number;
  events:         ScoringEvent[];
}

export interface ScoringEvent {
  id:          string;
  event_type:  string;
  agent_id:    string;
  zone_id:     string;
  offset_ms:   number;   // from swarm start
  priority:    number;
  data:        Record<string, unknown>;
}

// ─── Event classification sets ────────────────────────────────────────────────

const RETRY_TYPES    = new Set(['TASK_RETRY', 'AGENT_RETRY', 'CIRCUIT_BREAKER_HALF_OPEN']);
const ANOMALY_TYPES  = new Set(['ANOMALY_DETECTED', 'CIRCUIT_BREAKER_OPEN', 'AGENT_TIMEOUT', 'QUEUE_OVERFLOW']);
const FAILURE_TYPES  = new Set(['TASK_FAILED', 'AGENT_FAILED', 'SWARM_FAILED']);
const SUCCESS_TYPES  = new Set(['TASK_COMPLETED', 'AGENT_STEP_COMPLETED', 'SWARM_COMPLETED']);
const HANDOFF_TYPES  = new Set(['TASK_HANDOFF', 'AGENT_HANDOFF']);
const CRITICAL_TYPES = new Set(['SWARM_FAILED', 'CIRCUIT_BREAKER_OPEN', 'ANOMALY_DETECTED']);

// ─── SwarmHealthScorer ────────────────────────────────────────────────────────

export class SwarmHealthScorer {

  score(window: ScoringWindow): SwarmHealthReport {
    const { swarm_id, events, window_start_ms, window_end_ms, started_at_ms } = window;
    const duration_ms = window_end_ms - window_start_ms;

    // ── Per-agent aggregation ─────────────────────────────────────────────────

    const agentMap = new Map<string, {
      eventCount: number; retryCount: number; failureCount: number;
      successCount: number; taskDurations: number[];
    }>();

    for (const e of events) {
      let rec = agentMap.get(e.agent_id);
      if (!rec) {
        rec = { eventCount: 0, retryCount: 0, failureCount: 0, successCount: 0, taskDurations: [] };
        agentMap.set(e.agent_id, rec);
      }
      rec.eventCount++;
      if (RETRY_TYPES.has(e.event_type))   rec.retryCount++;
      if (FAILURE_TYPES.has(e.event_type)) rec.failureCount++;
      if (SUCCESS_TYPES.has(e.event_type)) rec.successCount++;
      if (typeof e.data.duration_ms === 'number') rec.taskDurations.push(e.data.duration_ms as number);
    }

    const totalEvents = events.length;
    const agentScores: AgentEfficiencyScore[] = [];

    for (const [agent_id, rec] of agentMap) {
      const completions = rec.successCount;
      const attempts    = completions + rec.retryCount + rec.failureCount;
      const successRate = attempts > 0 ? completions / attempts : 1.0;
      const retryPenalty = Math.min(rec.retryCount / Math.max(rec.eventCount, 1), 1.0);
      const efficiency  = Math.max(0, successRate - retryPenalty * 0.3);

      const avg_task_ms = rec.taskDurations.length
        ? rec.taskDurations.reduce((a, b) => a + b, 0) / rec.taskDurations.length
        : null;

      agentScores.push({
        agent_id,
        efficiency: clamp(efficiency),
        event_count:    rec.eventCount,
        retry_count:    rec.retryCount,
        failure_count:  rec.failureCount,
        avg_task_ms,
        workload_share: totalEvents > 0 ? rec.eventCount / totalEvents : 0,
        is_bottleneck:  false,   // set by bottleneck detector below
      });
    }

    // ── Bottleneck detection ──────────────────────────────────────────────────

    const bottlenecks = detectBottlenecks(window, agentScores);

    // Mark bottleneck agents
    const bottleneckAgents = new Set(
      bottlenecks
        .filter(b => b.agent_id)
        .map(b => b.agent_id as string)
    );
    for (const a of agentScores) {
      if (bottleneckAgents.has(a.agent_id)) a.is_bottleneck = true;
    }

    // ── Incident detection ────────────────────────────────────────────────────

    const incidents = detectIncidents(window, agentScores, bottlenecks);

    // ── Composite scoring ─────────────────────────────────────────────────────

    const retryCount   = events.filter(e => RETRY_TYPES.has(e.event_type)).length;
    const anomalyCount = events.filter(e => ANOMALY_TYPES.has(e.event_type)).length;
    const failureCount = events.filter(e => FAILURE_TYPES.has(e.event_type)).length;
    const criticalCount = events.filter(e => CRITICAL_TYPES.has(e.event_type)).length;

    // Retry pressure: exponential decay toward 0 as retries accumulate
    const retryRatio     = totalEvents > 0 ? retryCount / totalEvents : 0;
    const retry_pressure = clamp(1.0 - Math.min(retryRatio * 5, 1.0));

    // Anomaly severity (inverted): 1.0 = clean
    const anomalyRatio     = totalEvents > 0 ? anomalyCount / totalEvents : 0;
    const anomaly_severity = clamp(1.0 - Math.min(anomalyRatio * 8, 1.0));

    // Agent balance: 1.0 = perfectly even load; penalises extreme skew
    const workloads = agentScores.map(a => a.workload_share);
    const agent_balance = workloads.length > 1
      ? clamp(1.0 - coefficientOfVariation(workloads))
      : 1.0;

    // Orchestration efficiency: mean agent efficiency weighted by event count
    const orchestration_efficiency = agentScores.length
      ? clamp(
          agentScores.reduce((s, a) => s + a.efficiency * a.event_count, 0) /
          Math.max(totalEvents, 1)
        )
      : 1.0;

    // Throughput stability: 1-second bucket CV
    const bucketCounts = buildTimeBuckets(events, 1000);
    const throughput_stability = bucketCounts.length > 1
      ? clamp(1.0 - Math.min(coefficientOfVariation(bucketCounts) * 0.5, 1.0))
      : 1.0;

    // Overall health: weighted composite
    const overall_health = clamp(
      orchestration_efficiency * 0.30 +
      anomaly_severity         * 0.25 +
      retry_pressure           * 0.20 +
      throughput_stability     * 0.15 +
      agent_balance            * 0.10
    );

    // Apply hard penalties
    const criticalPenalty = criticalCount > 0 ? Math.min(criticalCount * 0.1, 0.3) : 0;
    const failurePenalty  = failureCount  > 0 ? Math.min(failureCount  * 0.05, 0.2) : 0;
    const penalised_health = clamp(overall_health - criticalPenalty - failurePenalty);

    const health_label = labelFromScore(penalised_health);
    const health_trend = computeTrend(events);

    return {
      swarm_id,
      computed_at_ms:           Date.now(),
      duration_ms,
      overall_health:           penalised_health,
      orchestration_efficiency,
      anomaly_severity,
      retry_pressure,
      throughput_stability,
      agent_balance,
      health_label,
      health_trend,
      agent_scores:             agentScores,
      bottlenecks,
      incidents,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function buildTimeBuckets(events: ScoringEvent[], bucketMs: number): number[] {
  if (!events.length) return [];
  const min = events[0].offset_ms;
  const max = events[events.length - 1].offset_ms;
  const numBuckets = Math.max(1, Math.ceil((max - min + 1) / bucketMs));
  const buckets = new Array<number>(numBuckets).fill(0);
  for (const e of events) {
    const idx = Math.min(Math.floor((e.offset_ms - min) / bucketMs), numBuckets - 1);
    buckets[idx]++;
  }
  return buckets;
}

function labelFromScore(score: number): SwarmHealthReport['health_label'] {
  if (score >= 0.80) return 'healthy';
  if (score >= 0.55) return 'degraded';
  if (score >= 0.30) return 'critical';
  return 'failed';
}

function computeTrend(events: ScoringEvent[]): SwarmHealthReport['health_trend'] {
  if (events.length < 20) return 'unknown';

  // Compare anomaly + retry density in first half vs second half
  const mid = Math.floor(events.length / 2);
  const firstHalf  = events.slice(0, mid);
  const secondHalf = events.slice(mid);

  const badRate = (evts: ScoringEvent[]) =>
    evts.filter(e => RETRY_TYPES.has(e.event_type) || ANOMALY_TYPES.has(e.event_type)).length /
    Math.max(evts.length, 1);

  const d1 = badRate(firstHalf);
  const d2 = badRate(secondHalf);
  const delta = d2 - d1;

  if (delta < -0.05) return 'improving';
  if (delta > 0.05)  return 'degrading';
  return 'stable';
}

// Compatibility re-exports for modules that import report/agent types from scorer.
export type { SwarmHealthReport, AgentEfficiencyScore } from '../types';
