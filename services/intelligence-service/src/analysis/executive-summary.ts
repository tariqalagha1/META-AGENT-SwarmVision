import {
  ExecutiveSummary, SummaryHighlight, SummaryTimelineEntry,
  SwarmHealthReport,
} from '../types';
import { ScoringWindow } from '../scoring/health-scorer';

const RETRY_TYPES   = new Set(['TASK_RETRY', 'AGENT_RETRY', 'CIRCUIT_BREAKER_HALF_OPEN']);
const ANOMALY_TYPES = new Set(['ANOMALY_DETECTED', 'CIRCUIT_BREAKER_OPEN', 'AGENT_TIMEOUT', 'QUEUE_OVERFLOW']);
const FAILURE_TYPES = new Set(['TASK_FAILED', 'AGENT_FAILED', 'SWARM_FAILED']);
const SUCCESS_TYPES = new Set(['TASK_COMPLETED', 'SWARM_COMPLETED', 'AGENT_STEP_COMPLETED']);

export class ExecutiveSummaryGenerator {

  generate(
    window: ScoringWindow,
    health: SwarmHealthReport,
    qualityScore: number | null,
    isComplete: boolean
  ): ExecutiveSummary {
    const highlights  = this.buildHighlights(window, health);
    const timeline    = this.buildTimeline(window, health);
    const outcome     = this.computeOutcome(health, isComplete);
    const headline    = this.buildHeadline(health, outcome, qualityScore);
    const recommendations = this.buildRecommendations(health);

    return {
      swarm_id:        window.swarm_id,
      generated_at_ms: Date.now(),
      duration_ms:     health.duration_ms,
      headline,
      outcome,
      quality_score:   qualityScore,
      highlights,
      timeline,
      recommendations,
    };
  }

  // ── Headline ─────────────────────────────────────────────────────────────────

  private buildHeadline(
    health: SwarmHealthReport,
    outcome: ExecutiveSummary['outcome'],
    quality: number | null
  ): string {
    const pct     = Math.round(health.orchestration_efficiency * 100);
    const qStr    = quality !== null ? ` — quality ${(quality * 100).toFixed(0)}%` : '';
    const bnCount = health.bottlenecks.length;
    const incHigh = health.incidents.filter(i => i.risk === 'high' || i.risk === 'critical');

    if (outcome === 'failure') {
      const failInc = health.incidents.find(i => i.kind === 'retry_storm' || i.kind === 'throughput_collapse');
      return failInc
        ? `Swarm failed: ${failInc.description.toLowerCase()}${qStr}`
        : `Swarm failed at ${pct}% efficiency${qStr}`;
    }

    if (outcome === 'ongoing') {
      if (incHigh.length > 0) {
        return `Live swarm degrading: ${incHigh[0].description.toLowerCase()} — ${pct}% efficiency`;
      }
      return `Swarm running at ${pct}% efficiency — ${health.health_label}${qStr}`;
    }

    if (outcome === 'partial') {
      const bnStr = bnCount > 0 ? `, ${bnCount} bottleneck${bnCount > 1 ? 's' : ''} resolved` : '';
      return `Swarm completed with ${pct}% efficiency${bnStr}${qStr}`;
    }

    // success
    if (incHigh.length > 0) {
      return `Swarm completed ${pct}% efficient — ${incHigh.length} incident${incHigh.length > 1 ? 's' : ''} recovered${qStr}`;
    }
    return `Swarm completed cleanly at ${pct}% efficiency${qStr}`;
  }

  // ── Highlights ────────────────────────────────────────────────────────────────

  private buildHighlights(
    window: ScoringWindow,
    health: SwarmHealthReport
  ): SummaryHighlight[] {
    const highlights: SummaryHighlight[] = [];

    // Bottlenecks → highlights
    for (const b of health.bottlenecks.slice(0, 5)) {
      highlights.push({
        offset_ms:  b.onset_ms,
        kind:       b.kind === 'retry_loop' ? 'retry'
                  : b.kind === 'anomaly_concentration' ? 'anomaly'
                  : b.kind === 'stalled_orchestration' ? 'failure'
                  : 'anomaly',
        headline:   bottleneckHeadline(b.kind),
        detail:     b.description,
        agent_id:   b.agent_id,
      });
    }

    // Incidents → highlights
    for (const inc of health.incidents.slice(0, 4)) {
      if (inc.risk === 'low') continue;
      highlights.push({
        offset_ms:  inc.onset_ms,
        kind:       inc.kind === 'retry_storm' ? 'retry'
                  : inc.kind === 'anomaly_cascade' ? 'anomaly'
                  : inc.kind === 'throughput_collapse' ? 'failure'
                  : 'anomaly',
        headline:   incidentHeadline(inc.kind),
        detail:     inc.description,
        agent_id:   inc.affected_agents[0] ?? null,
      });
    }

    // Recovery events
    const recoveries = window.events.filter(e =>
      e.event_type === 'CIRCUIT_BREAKER_CLOSED' ||
      e.event_type === 'AGENT_RECOVERED' ||
      e.event_type === 'SWARM_RECOVERED'
    );
    for (const r of recoveries.slice(0, 3)) {
      highlights.push({
        offset_ms:  r.offset_ms,
        kind:       'recovery',
        headline:   'System recovered',
        detail:     `${r.event_type} on ${r.agent_id}`,
        agent_id:   r.agent_id,
      });
    }

    // Notable successes
    const swarmComplete = window.events.find(e => e.event_type === 'SWARM_COMPLETED');
    if (swarmComplete) {
      highlights.push({
        offset_ms:  swarmComplete.offset_ms,
        kind:       'success',
        headline:   'Swarm completed',
        detail:     `All agents reached completion at ${Math.round(swarmComplete.offset_ms / 1000)}s`,
        agent_id:   null,
      });
    }

    return highlights.sort((a, b) => a.offset_ms - b.offset_ms);
  }

  // ── Timeline phases ───────────────────────────────────────────────────────────

  private buildTimeline(
    window: ScoringWindow,
    health: SwarmHealthReport
  ): SummaryTimelineEntry[] {
    const entries: SummaryTimelineEntry[] = [];
    const dur = health.duration_ms;
    if (dur <= 0) return entries;

    entries.push({ offset_ms: 0, label: 'Swarm initialized', phase: 'init' });

    // Ramp: first 15% of duration where event rate is building
    const rampEnd = Math.floor(dur * 0.15);
    entries.push({ offset_ms: rampEnd, label: 'Agents activated', phase: 'ramp' });

    // Peak: highest-density period
    const peakEvent = findPeakDensityOffset(window.events);
    if (peakEvent > rampEnd) {
      entries.push({ offset_ms: peakEvent, label: 'Peak orchestration activity', phase: 'peak' });
    }

    // Incidents
    for (const inc of health.incidents.filter(i => i.risk !== 'low').slice(0, 2)) {
      entries.push({
        offset_ms: inc.onset_ms,
        label:     incidentHeadline(inc.kind),
        phase:     'incident',
      });
      if (inc.predicted_escalation_ms !== null) {
        entries.push({
          offset_ms: inc.predicted_escalation_ms,
          label:     'Recovery sequence initiated',
          phase:     'recovery',
        });
      }
    }

    // Wind down
    const windDown = Math.floor(dur * 0.85);
    entries.push({ offset_ms: windDown, label: 'Wind-down phase', phase: 'wind_down' });

    // Completion
    const completeEvent = window.events.find(e => e.event_type === 'SWARM_COMPLETED');
    if (completeEvent) {
      entries.push({
        offset_ms: completeEvent.offset_ms,
        label:     'Swarm completed',
        phase:     'complete',
      });
    }

    return entries
      .sort((a, b) => a.offset_ms - b.offset_ms)
      .filter((e, i, arr) => i === 0 || e.offset_ms !== arr[i - 1].offset_ms);
  }

  // ── Recommendations ───────────────────────────────────────────────────────────

  private buildRecommendations(health: SwarmHealthReport): string[] {
    const recs: string[] = [];

    if (health.retry_pressure < 0.6) {
      recs.push('High retry pressure detected — consider increasing agent retry backoff or adding circuit breaker thresholds');
    }

    if (health.agent_balance < 0.5) {
      recs.push('Agent workload imbalance detected — review task distribution strategy and zone assignment');
    }

    if (health.throughput_stability < 0.5) {
      recs.push('Throughput instability — consider event queue smoothing or rate limiting at ingestion layer');
    }

    const retryStorms = health.incidents.filter(i => i.kind === 'retry_storm');
    if (retryStorms.length > 0) {
      recs.push(`Retry storm detected (${retryStorms.length} occurrence${retryStorms.length > 1 ? 's' : ''}) — implement exponential backoff with jitter`);
    }

    const exhausted = health.agent_scores.filter(a => a.efficiency < 0.3);
    if (exhausted.length > 0) {
      recs.push(`${exhausted.length} agent${exhausted.length > 1 ? 's' : ''} operating below 30% efficiency — review agent capacity and task complexity`);
    }

    const bottleneckZones = [...new Set(health.bottlenecks.map(b => b.zone_id).filter(Boolean))];
    if (bottleneckZones.length > 0) {
      recs.push(`Bottlenecks concentrated in zone${bottleneckZones.length > 1 ? 's' : ''} ${bottleneckZones.join(', ')} — investigate zone-specific constraints`);
    }

    if (health.overall_health > 0.85 && recs.length === 0) {
      recs.push('Swarm health is excellent — no immediate operational changes recommended');
    }

    return recs;
  }

  private computeOutcome(
    health: SwarmHealthReport,
    isComplete: boolean
  ): ExecutiveSummary['outcome'] {
    if (!isComplete) return 'ongoing';
    if (health.health_label === 'failed') return 'failure';
    if (health.overall_health < 0.6) return 'partial';
    return 'success';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findPeakDensityOffset(events: { offset_ms: number }[]): number {
  if (!events.length) return 0;
  const BUCKET_MS = 5000;
  const buckets = new Map<number, number>();
  for (const e of events) {
    const b = Math.floor(e.offset_ms / BUCKET_MS);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  let maxBucket = 0, maxCount = 0;
  for (const [b, c] of buckets) {
    if (c > maxCount) { maxCount = c; maxBucket = b; }
  }
  return maxBucket * BUCKET_MS;
}

function bottleneckHeadline(kind: string): string {
  const map: Record<string, string> = {
    retry_loop:             'Retry loop detected',
    queue_buildup:          'Queue buildup spike',
    slow_agent:             'Slow agent identified',
    handoff_delay:          'Handoff delay',
    anomaly_concentration:  'Anomaly cluster',
    stalled_orchestration:  'Agent stalled',
  };
  return map[kind] ?? 'Operational bottleneck';
}

function incidentHeadline(kind: string): string {
  const map: Record<string, string> = {
    retry_storm:               'Retry storm',
    swarm_degradation:         'Swarm degrading',
    anomaly_cascade:           'Anomaly cascade',
    throughput_collapse:       'Throughput collapse',
    orchestration_instability: 'Orchestration instability',
    agent_exhaustion:          'Agent exhaustion',
  };
  return map[kind] ?? 'Incident detected';
}
