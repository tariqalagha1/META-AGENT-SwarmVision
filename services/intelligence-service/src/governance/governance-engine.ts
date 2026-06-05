import { v4 as uuidv4 } from 'uuid';
import {
  GovernanceAction, GovernanceActionKind, GovernanceTrigger,
  GovernanceDecision, RetryPolicy, ThrottlePolicy,
} from './types';
import { SwarmHealthReport, AgentEfficiencyScore, DetectedIncident, Bottleneck } from '../types';

// ─── Governance thresholds ────────────────────────────────────────────────────

const MIN_CONFIDENCE_TO_ACT    = 0.55;
const RETRY_PRESSURE_TRIGGER   = 0.35;   // retry_pressure below this → suppress retries
const ANOMALY_SEVERITY_TRIGGER = 0.45;   // anomaly_severity below this → quarantine
const AGENT_EFFICIENCY_FLOOR   = 0.30;   // agent efficiency → isolate
const THROUGHPUT_FLOOR         = 0.40;   // throughput_stability → throttle
const BALANCE_FLOOR            = 0.45;   // agent_balance → redistribute
const HEALTH_EMERGENCY         = 0.30;   // overall_health → cool_swarm

// Active governance state — retry and throttle policies in effect
const activeRetryPolicies   = new Map<string, RetryPolicy>();    // agent_id
const activeThrottlePolicies = new Map<string, ThrottlePolicy>(); // agent_id
const recentActions         = new Map<string, number>();          // kind|target → last_issued_ms
const ACTION_COOLDOWN_MS    = 30_000;  // same action/target can't fire more than once per 30s

// ─── GovernanceEngine ─────────────────────────────────────────────────────────

export class GovernanceEngine {

  decide(health: SwarmHealthReport): GovernanceDecision {
    const actions: GovernanceAction[] = [];
    let suppressed = 0;

    const candidate = (action: Omit<GovernanceAction,
      'id' | 'issued_at_ms' | 'expires_at_ms' | 'status' | 'outcome_health_delta'>) => {
      if (action.confidence < MIN_CONFIDENCE_TO_ACT) { suppressed++; return; }
      if (this.isOnCooldown(action.kind, action.target_id)) return;
      const full: GovernanceAction = {
        ...action,
        id:           uuidv4(),
        issued_at_ms: Date.now(),
        expires_at_ms: Date.now() + 120_000,
        status:       'pending',
        outcome_health_delta: null,
      };
      actions.push(full);
      this.setCooldown(action.kind, action.target_id);
    };

    // ── Emergency stop ────────────────────────────────────────────────────────
    if (health.overall_health < HEALTH_EMERGENCY) {
      const criticalInc = health.incidents.find(i => i.risk === 'critical');
      if (criticalInc) {
        candidate({
          kind:       'cool_swarm',
          trigger:    'swarm_degradation',
          swarm_id:   health.swarm_id,
          target_id:  health.swarm_id,
          confidence: 0.85,
          urgency:    'critical',
          rationale:  `Overall health ${(health.overall_health * 100).toFixed(0)}% — emergency swarm cooling required`,
          parameters: { cool_duration_ms: 10000, reduce_rate: 0.5 },
        });
      }
    }

    // ── Retry suppression ─────────────────────────────────────────────────────
    if (health.retry_pressure < RETRY_PRESSURE_TRIGGER) {
      const retryIncident = health.incidents.find(i => i.kind === 'retry_storm');
      const affectedAgents = retryIncident?.affected_agents ?? health.agent_scores
        .filter(a => a.retry_count / Math.max(a.event_count, 1) > 0.3)
        .map(a => a.agent_id);

      for (const agent_id of affectedAgents.slice(0, 3)) {
        const ratio = getAgentRetryRatio(health.agent_scores, agent_id);
        candidate({
          kind:       'suppress_retries',
          trigger:    'retry_pressure_threshold',
          swarm_id:   health.swarm_id,
          target_id:  agent_id,
          confidence: Math.min(0.6 + ratio, 0.95),
          urgency:    health.retry_pressure < 0.2 ? 'high' : 'medium',
          rationale:  `Agent ${agent_id} retry ratio ${(ratio * 100).toFixed(0)}% — suppressing retries with backoff adjustment`,
          parameters: buildRetrySuppressionParams(health.agent_scores, agent_id),
        });
      }
    }

    // ── Anomaly quarantine ────────────────────────────────────────────────────
    if (health.anomaly_severity < ANOMALY_SEVERITY_TRIGGER) {
      const cascadeInc = health.incidents.find(i => i.kind === 'anomaly_cascade');
      if (cascadeInc) {
        for (const agent_id of cascadeInc.affected_agents.slice(0, 2)) {
          candidate({
            kind:       'quarantine_anomaly',
            trigger:    'anomaly_cascade_detected',
            swarm_id:   health.swarm_id,
            target_id:  agent_id,
            confidence: Math.min(0.5 + cascadeInc.probability, 0.95),
            urgency:    cascadeInc.risk === 'critical' ? 'critical' : 'high',
            rationale:  `Anomaly cascade at ${agent_id} — quarantining event flow`,
            parameters: { block_event_types: ['ANOMALY_DETECTED', 'CIRCUIT_BREAKER_OPEN'], duration_ms: 15000 },
          });
        }
      }

      // Zone-level containment
      const concentrations = health.bottlenecks.filter(b => b.kind === 'anomaly_concentration');
      for (const b of concentrations.slice(0, 2)) {
        if (b.zone_id) {
          candidate({
            kind:       'stabilize_orchestration',
            trigger:    'anomaly_cascade_detected',
            swarm_id:   health.swarm_id,
            target_id:  b.zone_id,
            confidence: b.severity * 0.9,
            urgency:    b.severity > 0.7 ? 'high' : 'medium',
            rationale:  `${b.description} — stabilizing zone ${b.zone_id}`,
            parameters: { zone_id: b.zone_id, reduce_throughput: 0.6 },
          });
        }
      }
    }

    // ── Throughput throttling ─────────────────────────────────────────────────
    if (health.throughput_stability < THROUGHPUT_FLOOR) {
      const queueB = health.bottlenecks.find(b => b.kind === 'queue_buildup');
      if (queueB) {
        candidate({
          kind:       'throttle_agent',
          trigger:    'throughput_collapse',
          swarm_id:   health.swarm_id,
          target_id:  queueB.agent_id ?? health.swarm_id,
          confidence: queueB.severity * 0.85,
          urgency:    queueB.severity > 0.7 ? 'high' : 'medium',
          rationale:  `${queueB.description} — throttling to reduce queue buildup`,
          parameters: buildThrottleParams(queueB.severity),
        });
      }
    }

    // ── Workload redistribution ───────────────────────────────────────────────
    if (health.agent_balance < BALANCE_FLOOR && health.agent_scores.length > 1) {
      const sorted  = [...health.agent_scores].sort((a, b) => b.event_count - a.event_count);
      const busiest = sorted[0];
      const lightest = sorted[sorted.length - 1];
      if (busiest.workload_share - lightest.workload_share > 0.4) {
        candidate({
          kind:       'redistribute_load',
          trigger:    'swarm_degradation',
          swarm_id:   health.swarm_id,
          target_id:  health.swarm_id,
          confidence: Math.min(1 - health.agent_balance, 0.9),
          urgency:    'medium',
          rationale:  `Workload skew: ${busiest.agent_id} at ${(busiest.workload_share * 100).toFixed(0)}% vs ${lightest.agent_id} at ${(lightest.workload_share * 100).toFixed(0)}%`,
          parameters: {
            from_agent: busiest.agent_id,
            to_agent:   lightest.agent_id,
            shift_ratio: 0.25,
          },
        });
      }
    }

    // ── Agent isolation ───────────────────────────────────────────────────────
    const exhaustedAgents = health.agent_scores.filter(
      a => a.efficiency < AGENT_EFFICIENCY_FLOOR && a.event_count > 5
    );
    for (const agent of exhaustedAgents.slice(0, 2)) {
      candidate({
        kind:       'isolate_agent',
        trigger:    'agent_exhaustion',
        swarm_id:   health.swarm_id,
        target_id:  agent.agent_id,
        confidence: Math.min(1 - agent.efficiency + 0.3, 0.92),
        urgency:    agent.efficiency < 0.15 ? 'critical' : 'high',
        rationale:  `Agent ${agent.agent_id} efficiency ${(agent.efficiency * 100).toFixed(0)}% — isolating for recovery`,
        parameters: { allow_readonly: true, recovery_check_interval_ms: 10000 },
      });
    }

    // ── Stall resolution ──────────────────────────────────────────────────────
    const stallBn = health.bottlenecks.filter(b => b.kind === 'stalled_orchestration');
    for (const s of stallBn.slice(0, 2)) {
      if (s.agent_id) {
        candidate({
          kind:       'reroute_task',
          trigger:    'swarm_degradation',
          swarm_id:   health.swarm_id,
          target_id:  s.agent_id,
          confidence: s.severity * 0.8,
          urgency:    s.severity > 0.6 ? 'high' : 'medium',
          rationale:  s.description,
          parameters: { reroute_to: 'next_available', preserve_state: true },
        });
      }
    }

    return {
      swarm_id:            health.swarm_id,
      decided_at_ms:       Date.now(),
      health_at_decision:  health.overall_health,
      actions:             actions.sort((a, b) => urgencyValue(b.urgency) - urgencyValue(a.urgency)),
      suppressed_count:    suppressed,
    };
  }

  // ── Policy management ──────────────────────────────────────────────────────

  buildRetryPolicy(agent_id: string, action: GovernanceAction): RetryPolicy {
    const params = action.parameters as {
      max_retries?: number;
      base_backoff_ms?: number;
      backoff_multiplier?: number;
      jitter_ms?: number;
    };
    const existing = activeRetryPolicies.get(agent_id);
    const policy: RetryPolicy = {
      agent_id,
      max_retries:               params.max_retries ?? 3,
      base_backoff_ms:           params.base_backoff_ms ?? 1000,
      backoff_multiplier:        params.backoff_multiplier ?? 2.0,
      jitter_ms:                 params.jitter_ms ?? 500,
      circuit_breaker_threshold: existing?.circuit_breaker_threshold ?? 5,
      cooldown_ms:               existing?.cooldown_ms ?? 10000,
      last_updated_ms:           Date.now(),
      source:                    'governed',
    };
    activeRetryPolicies.set(agent_id, policy);
    return policy;
  }

  buildThrottlePolicy(agent_id: string, action: GovernanceAction): ThrottlePolicy {
    const params = action.parameters as { max_events_per_s?: number; burst?: number; duration_ms?: number };
    const policy: ThrottlePolicy = {
      agent_id,
      max_events_per_s: params.max_events_per_s ?? 2,
      burst_allowance:  params.burst ?? 5,
      active_until_ms:  Date.now() + (params.duration_ms ?? 30000),
      reason:           action.rationale,
    };
    activeThrottlePolicies.set(agent_id, policy);
    return policy;
  }

  getActiveRetryPolicies():   RetryPolicy[]   { return [...activeRetryPolicies.values()]; }
  getActiveThrottlePolicies(): ThrottlePolicy[] { return [...activeThrottlePolicies.values()]; }

  recordOutcome(action_id: string, health_delta: number, actions: GovernanceAction[]): void {
    const action = actions.find(a => a.id === action_id);
    if (action) action.outcome_health_delta = health_delta;
  }

  private isOnCooldown(kind: GovernanceActionKind, target_id: string): boolean {
    const key  = `${kind}|${target_id}`;
    const last = recentActions.get(key);
    return last !== undefined && Date.now() - last < ACTION_COOLDOWN_MS;
  }

  private setCooldown(kind: GovernanceActionKind, target_id: string): void {
    recentActions.set(`${kind}|${target_id}`, Date.now());
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAgentRetryRatio(scores: AgentEfficiencyScore[], agent_id: string): number {
  const a = scores.find(s => s.agent_id === agent_id);
  if (!a) return 0;
  return a.retry_count / Math.max(a.event_count, 1);
}

function buildRetrySuppressionParams(
  scores: AgentEfficiencyScore[],
  agent_id: string
): Record<string, unknown> {
  const ratio = getAgentRetryRatio(scores, agent_id);
  // Exponentially increase backoff based on observed retry ratio
  const multiplier = 1 + ratio * 4;
  return {
    max_retries:        2,
    base_backoff_ms:    Math.round(500 * multiplier),
    backoff_multiplier: Math.min(2 + ratio * 2, 6),
    jitter_ms:          Math.round(200 * multiplier),
  };
}

function buildThrottleParams(severity: number): Record<string, unknown> {
  return {
    max_events_per_s: Math.max(1, Math.round(5 * (1 - severity))),
    burst:            Math.max(2, Math.round(10 * (1 - severity))),
    duration_ms:      Math.round(20000 + severity * 30000),
  };
}

function urgencyValue(u: GovernanceAction['urgency']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[u];
}
