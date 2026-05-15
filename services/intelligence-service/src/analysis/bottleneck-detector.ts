import { v4 as uuidv4 } from 'uuid';
import { Bottleneck, BottleneckKind } from '../types';
import { ScoringWindow, ScoringEvent, AgentEfficiencyScore } from '../scoring/health-scorer';

const RETRY_TYPES   = new Set(['TASK_RETRY', 'AGENT_RETRY', 'CIRCUIT_BREAKER_HALF_OPEN']);
const ANOMALY_TYPES = new Set(['ANOMALY_DETECTED', 'CIRCUIT_BREAKER_OPEN', 'AGENT_TIMEOUT', 'QUEUE_OVERFLOW']);
const HANDOFF_TYPES = new Set(['TASK_HANDOFF', 'AGENT_HANDOFF']);

// Thresholds
const RETRY_LOOP_THRESHOLD          = 3;    // retries within a 5s window per agent → loop
const SLOW_AGENT_PERCENTILE_MULT    = 2.5;  // avg_task_ms > 2.5× swarm median → slow
const HANDOFF_DELAY_MS_THRESHOLD    = 5000; // gap between handoff and next event in target
const QUEUE_BUILDUP_RATE_THRESHOLD  = 3.0;  // events/sec acceleration rate
const ANOMALY_CONCENTRATION_RATIO   = 0.4;  // >40% of a zone's events are anomalies
const STALL_GAP_MS                  = 10000; // no events from agent for >10s during active swarm

export function detectBottlenecks(
  window: ScoringWindow,
  agentScores: AgentEfficiencyScore[]
): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];

  bottlenecks.push(...detectRetryLoops(window));
  bottlenecks.push(...detectSlowAgents(window, agentScores));
  bottlenecks.push(...detectHandoffDelays(window));
  bottlenecks.push(...detectQueueBuildup(window));
  bottlenecks.push(...detectAnomalyConcentration(window));
  bottlenecks.push(...detectStalledOrchestration(window));

  // Deduplicate overlapping agent/kind pairs, keep highest severity
  return deduplicateBottlenecks(bottlenecks);
}

// ─── Retry loop detection ─────────────────────────────────────────────────────
// Sliding 5-second window: if an agent fires RETRY_LOOP_THRESHOLD retries, it's looping.

function detectRetryLoops(window: ScoringWindow): Bottleneck[] {
  const result: Bottleneck[] = [];
  const retries = window.events.filter(e => RETRY_TYPES.has(e.event_type));

  // Group by agent
  const byAgent = new Map<string, ScoringEvent[]>();
  for (const e of retries) {
    const arr = byAgent.get(e.agent_id) ?? [];
    arr.push(e);
    byAgent.set(e.agent_id, arr);
  }

  for (const [agent_id, events] of byAgent) {
    // Sliding window: find bursts
    let windowStart = 0;
    for (let i = RETRY_LOOP_THRESHOLD - 1; i < events.length; i++) {
      // Advance window start to keep within 5s
      while (events[i].offset_ms - events[windowStart].offset_ms > 5000) windowStart++;

      const burstSize = i - windowStart + 1;
      if (burstSize >= RETRY_LOOP_THRESHOLD) {
        const severity = Math.min(burstSize / 10, 1.0);
        result.push({
          id:          uuidv4(),
          kind:        'retry_loop',
          agent_id,
          zone_id:     events[i].zone_id || null,
          severity,
          onset_ms:    events[windowStart].offset_ms,
          description: `Agent ${agent_id} entered retry loop: ${burstSize} retries in 5s`,
          event_ids:   events.slice(windowStart, i + 1).map(e => e.id),
        });
        // Skip ahead to avoid duplicate reporting on same burst
        windowStart = i + 1;
      }
    }
  }
  return result;
}

// ─── Slow agent detection ─────────────────────────────────────────────────────
// Agents whose avg task duration exceeds 2.5× swarm median are flagged.

function detectSlowAgents(
  window: ScoringWindow,
  agentScores: AgentEfficiencyScore[]
): Bottleneck[] {
  const result: Bottleneck[] = [];

  const durations = agentScores
    .filter(a => a.avg_task_ms !== null)
    .map(a => a.avg_task_ms as number)
    .sort((a, b) => a - b);

  if (durations.length < 2) return result;

  const median = durations[Math.floor(durations.length / 2)];
  const threshold = median * SLOW_AGENT_PERCENTILE_MULT;

  for (const a of agentScores) {
    if (a.avg_task_ms !== null && a.avg_task_ms > threshold) {
      const severity = Math.min((a.avg_task_ms - threshold) / threshold, 1.0);
      const agentEvents = window.events.filter(e => e.agent_id === a.agent_id);
      result.push({
        id:          uuidv4(),
        kind:        'slow_agent',
        agent_id:    a.agent_id,
        zone_id:     agentEvents[0]?.zone_id ?? null,
        severity,
        onset_ms:    agentEvents[0]?.offset_ms ?? 0,
        description: `Agent ${a.agent_id} avg task ${Math.round(a.avg_task_ms)}ms vs swarm median ${Math.round(median)}ms`,
        event_ids:   agentEvents.slice(0, 5).map(e => e.id),
      });
    }
  }
  return result;
}

// ─── Handoff delay detection ──────────────────────────────────────────────────
// Time between TASK_HANDOFF and next event from the receiving agent.

function detectHandoffDelays(window: ScoringWindow): Bottleneck[] {
  const result: Bottleneck[] = [];
  const handoffs = window.events.filter(e => HANDOFF_TYPES.has(e.event_type));

  for (const handoff of handoffs) {
    const targetAgent = handoff.data.target_agent_id as string | undefined;
    if (!targetAgent) continue;

    // Find next event from targetAgent after handoff offset
    const nextEvent = window.events.find(
      e => e.agent_id === targetAgent && e.offset_ms > handoff.offset_ms
    );

    const delay = nextEvent
      ? nextEvent.offset_ms - handoff.offset_ms
      : (window.window_end_ms - window.window_start_ms) - handoff.offset_ms;

    if (delay > HANDOFF_DELAY_MS_THRESHOLD) {
      const severity = Math.min(delay / 30000, 1.0);
      result.push({
        id:          uuidv4(),
        kind:        'handoff_delay',
        agent_id:    handoff.agent_id,
        zone_id:     handoff.zone_id || null,
        severity,
        onset_ms:    handoff.offset_ms,
        description: `Handoff from ${handoff.agent_id} to ${targetAgent} delayed ${Math.round(delay / 1000)}s`,
        event_ids:   [handoff.id],
      });
    }
  }
  return result;
}

// ─── Queue buildup detection ──────────────────────────────────────────────────
// Measures event-rate acceleration over 3-second buckets.

function detectQueueBuildup(window: ScoringWindow): Bottleneck[] {
  const result: Bottleneck[] = [];
  if (window.events.length < 10) return result;

  const BUCKET_MS = 3000;
  const buckets = new Map<number, ScoringEvent[]>();

  for (const e of window.events) {
    const bucket = Math.floor(e.offset_ms / BUCKET_MS);
    const arr = buckets.get(bucket) ?? [];
    arr.push(e);
    buckets.set(bucket, arr);
  }

  const sortedBuckets = Array.from(buckets.entries()).sort(([a], [b]) => a - b);

  for (let i = 1; i < sortedBuckets.length; i++) {
    const prev = sortedBuckets[i - 1][1].length;
    const curr = sortedBuckets[i][1].length;
    if (prev > 0 && curr / prev >= QUEUE_BUILDUP_RATE_THRESHOLD) {
      const severity = Math.min((curr / prev - QUEUE_BUILDUP_RATE_THRESHOLD) / 3, 1.0);
      const onset = sortedBuckets[i][0] * BUCKET_MS;
      result.push({
        id:          uuidv4(),
        kind:        'queue_buildup',
        agent_id:    null,
        zone_id:     null,
        severity,
        onset_ms:    onset,
        description: `Event rate spike ${prev}→${curr} events in 3s window at ${Math.round(onset / 1000)}s`,
        event_ids:   sortedBuckets[i][1].slice(0, 5).map(e => e.id),
      });
    }
  }
  return result;
}

// ─── Anomaly concentration detection ─────────────────────────────────────────
// Zones where >40% of events are anomalies.

function detectAnomalyConcentration(window: ScoringWindow): Bottleneck[] {
  const result: Bottleneck[] = [];

  const zoneTotal   = new Map<string, number>();
  const zoneAnomaly = new Map<string, number>();

  for (const e of window.events) {
    if (!e.zone_id) continue;
    zoneTotal.set(e.zone_id, (zoneTotal.get(e.zone_id) ?? 0) + 1);
    if (ANOMALY_TYPES.has(e.event_type))
      zoneAnomaly.set(e.zone_id, (zoneAnomaly.get(e.zone_id) ?? 0) + 1);
  }

  for (const [zone_id, total] of zoneTotal) {
    if (total < 5) continue;
    const anomalyCount = zoneAnomaly.get(zone_id) ?? 0;
    const ratio = anomalyCount / total;

    if (ratio >= ANOMALY_CONCENTRATION_RATIO) {
      const severity = Math.min(ratio * 1.5, 1.0);
      const zoneEvents = window.events.filter(e => e.zone_id === zone_id && ANOMALY_TYPES.has(e.event_type));
      result.push({
        id:          uuidv4(),
        kind:        'anomaly_concentration',
        agent_id:    null,
        zone_id,
        severity,
        onset_ms:    zoneEvents[0]?.offset_ms ?? 0,
        description: `Zone ${zone_id}: ${Math.round(ratio * 100)}% anomaly rate (${anomalyCount}/${total} events)`,
        event_ids:   zoneEvents.slice(0, 5).map(e => e.id),
      });
    }
  }
  return result;
}

// ─── Stalled orchestration detection ─────────────────────────────────────────
// Agent is active earlier but silent for >STALL_GAP_MS during a live swarm.

function detectStalledOrchestration(window: ScoringWindow): Bottleneck[] {
  const result: Bottleneck[] = [];
  const duration = window.window_end_ms - window.window_start_ms;
  if (duration < STALL_GAP_MS * 2) return result;

  const byAgent = new Map<string, ScoringEvent[]>();
  for (const e of window.events) {
    const arr = byAgent.get(e.agent_id) ?? [];
    arr.push(e);
    byAgent.set(e.agent_id, arr);
  }

  for (const [agent_id, events] of byAgent) {
    // Only check agents that had activity but appear to have stopped mid-swarm
    if (events.length < 3) continue;
    const last = events[events.length - 1];
    const remaining = duration - last.offset_ms;
    if (remaining > STALL_GAP_MS) {
      const severity = Math.min(remaining / 30000, 1.0);
      result.push({
        id:          uuidv4(),
        kind:        'stalled_orchestration',
        agent_id,
        zone_id:     last.zone_id || null,
        severity,
        onset_ms:    last.offset_ms,
        description: `Agent ${agent_id} stalled: no activity for ${Math.round(remaining / 1000)}s`,
        event_ids:   [last.id],
      });
    }
  }
  return result;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateBottlenecks(bottlenecks: Bottleneck[]): Bottleneck[] {
  const seen = new Map<string, Bottleneck>();
  for (const b of bottlenecks) {
    const key = `${b.kind}|${b.agent_id ?? ''}|${b.zone_id ?? ''}`;
    const existing = seen.get(key);
    if (!existing || b.severity > existing.severity) {
      seen.set(key, b);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.severity - a.severity);
}
