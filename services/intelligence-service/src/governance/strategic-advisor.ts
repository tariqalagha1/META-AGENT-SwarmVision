import { v4 as uuidv4 } from 'uuid';
import {
  StrategicRecommendation, StrategyCategory, SwarmTemperament,
} from './types';
import { SwarmHealthReport } from '../scoring/health-scorer';
import { SwarmHistoryRecord, OperationalTrend } from '../types';

// ─── StrategicAdvisor ─────────────────────────────────────────────────────────
//
// Generates high-level strategic recommendations for operational improvement.
// Combines current health, historical patterns, temperament, and trends to
// produce a prioritized advisory output — the "AI operations analyst."

export class StrategicAdvisor {

  advise(
    health:      SwarmHealthReport,
    history:     SwarmHistoryRecord[],
    trends:      OperationalTrend[],
    temperament: SwarmTemperament | null
  ): StrategicRecommendation[] {
    const recs: StrategicRecommendation[] = [];

    recs.push(...this.retryPolicyAdvice(health, history, temperament));
    recs.push(...this.agentTopologyAdvice(health, history));
    recs.push(...this.workloadAdvice(health, history));
    recs.push(...this.anomalyMitigationAdvice(health, history, temperament));
    recs.push(...this.throughputAdvice(health, trends));
    recs.push(...this.governancePostureAdvice(health, temperament, trends));

    return recs
      .sort((a, b) => priorityValue(b.priority) - priorityValue(a.priority) ||
                      b.confidence - a.confidence)
      .slice(0, 8);  // top 8 strategic recommendations
  }

  // ── Retry policy advice ────────────────────────────────────────────────────

  private retryPolicyAdvice(
    health: SwarmHealthReport,
    history: SwarmHistoryRecord[],
    temperament: SwarmTemperament | null
  ): StrategicRecommendation[] {
    const recs: StrategicRecommendation[] = [];

    const retryIncidents = health.incidents.filter(i =>
      i.kind === 'retry_storm' || i.kind === 'orchestration_instability'
    );

    if (retryIncidents.length > 0 || health.retry_pressure < 0.5) {
      const isChronicRetrier = history.filter(r => r.retry_count / Math.max(r.event_count, 1) > 0.2).length
        / Math.max(history.length, 1);

      if (isChronicRetrier > 0.5) {
        recs.push(this.rec(
          'retry_policy', 'critical',
          'Implement adaptive exponential backoff with per-agent jitter',
          `Historical analysis shows ${Math.round(isChronicRetrier * 100)}% of runs encounter high retry rates. ` +
          `Current retry pressure ${(health.retry_pressure * 100).toFixed(0)}%. ` +
          `Recommend: base_backoff=1000ms, multiplier=3×, jitter=±500ms, circuit_breaker_threshold=4.`,
          0.18, Math.min(0.5 + isChronicRetrier, 0.95),
          history.slice(0, 5).map(r => r.swarm_id)
        ));
      } else {
        recs.push(this.rec(
          'retry_policy', 'high',
          'Tune retry backoff for current incident conditions',
          `Active retry storm detected across ${retryIncidents[0]?.affected_agents.length ?? 0} agents. ` +
          `Recommend increasing backoff multiplier to 4× and enabling per-agent circuit breakers.`,
          0.12, 0.82,
          [health.swarm_id]
        ));
      }
    }

    if (temperament?.retry_persistence && temperament.retry_persistence > 0.6) {
      recs.push(this.rec(
        'retry_policy', 'medium',
        'Introduce retry budget caps per orchestration cycle',
        `Swarm temperament shows persistent retry behavior (score: ${(temperament.retry_persistence * 100).toFixed(0)}%). ` +
        `Implement a per-cycle retry budget (max 10 total retries before forced cooling period) ` +
        `to prevent retry accumulation across agents.`,
        0.10, 0.74,
        []
      ));
    }

    return recs;
  }

  // ── Agent topology advice ─────────────────────────────────────────────────

  private agentTopologyAdvice(
    health: SwarmHealthReport,
    history: SwarmHistoryRecord[]
  ): StrategicRecommendation[] {
    const recs: StrategicRecommendation[] = [];

    const bottleneckAgents = health.agent_scores.filter(a => a.is_bottleneck);
    const exhaustedAgents  = health.agent_scores.filter(a => a.efficiency < 0.4);
    const avgAgentCount    = history.length > 0
      ? history.reduce((s, r) => s + r.agent_count, 0) / history.length
      : 0;

    if (bottleneckAgents.length > 0) {
      recs.push(this.rec(
        'agent_topology', 'high',
        `Deploy redundant agents alongside bottleneck agents`,
        `${bottleneckAgents.length} agent${bottleneckAgents.length > 1 ? 's' : ''} ` +
        `(${bottleneckAgents.map(a => a.agent_id).join(', ')}) are identified bottlenecks. ` +
        `Deploying shadow agents with identical capability and automatic failover would ` +
        `reduce single-agent dependency risk.`,
        0.14, 0.78,
        [health.swarm_id]
      ));
    }

    if (exhaustedAgents.length / Math.max(health.agent_scores.length, 1) > 0.4) {
      recs.push(this.rec(
        'agent_topology', 'high',
        'Increase agent pool size — current swarm is under-resourced',
        `${Math.round(exhaustedAgents.length / Math.max(health.agent_scores.length, 1) * 100)}% ` +
        `of agents are operating below 40% efficiency. Historical average: ${avgAgentCount.toFixed(1)} agents. ` +
        `Recommend adding ${Math.ceil(exhaustedAgents.length * 0.5)} additional agents to distribute load.`,
        0.20, 0.85,
        history.slice(0, 3).map(r => r.swarm_id)
      ));
    }

    return recs;
  }

  // ── Workload distribution advice ──────────────────────────────────────────

  private workloadAdvice(
    health: SwarmHealthReport,
    history: SwarmHistoryRecord[]
  ): StrategicRecommendation[] {
    const recs: StrategicRecommendation[] = [];

    if (health.agent_balance < 0.5) {
      const sorted   = [...health.agent_scores].sort((a, b) => b.workload_share - a.workload_share);
      const topAgent = sorted[0];
      recs.push(this.rec(
        'workload_distribution', 'medium',
        'Implement dynamic load balancing across agent pool',
        `Agent balance score ${(health.agent_balance * 100).toFixed(0)}%. ` +
        `${topAgent?.agent_id ?? 'Top agent'} handling ${((topAgent?.workload_share ?? 0) * 100).toFixed(0)}% of workload. ` +
        `Recommend weighted round-robin task assignment with real-time queue depth monitoring.`,
        0.12, 0.72,
        [health.swarm_id]
      ));
    }

    // Chronic imbalance across runs
    const chronicImbalance = history.filter(r => r.event_count > 0 && r.agent_count > 0 &&
      r.event_count / r.agent_count > 150
    ).length / Math.max(history.length, 1);

    if (chronicImbalance > 0.6) {
      recs.push(this.rec(
        'workload_distribution', 'medium',
        'Adopt queue-depth-aware task routing',
        `${Math.round(chronicImbalance * 100)}% of historical runs show high per-agent load. ` +
        `Current event/agent ratio exceeds optimal threshold. ` +
        `Implement queue-depth telemetry at routing layer to distribute tasks to lowest-load agents.`,
        0.09, 0.68,
        history.slice(0, 8).map(r => r.swarm_id)
      ));
    }

    return recs;
  }

  // ── Anomaly mitigation advice ─────────────────────────────────────────────

  private anomalyMitigationAdvice(
    health: SwarmHealthReport,
    history: SwarmHistoryRecord[],
    temperament: SwarmTemperament | null
  ): StrategicRecommendation[] {
    const recs: StrategicRecommendation[] = [];

    const cascadeInc = health.incidents.find(i => i.kind === 'anomaly_cascade');
    if (cascadeInc) {
      recs.push(this.rec(
        'anomaly_mitigation', 'critical',
        'Deploy anomaly circuit isolation at zone boundaries',
        `Active anomaly cascade detected across zones: ${cascadeInc.affected_zones.join(', ')}. ` +
        `Implement zone-boundary circuit breakers that isolate anomaly propagation paths. ` +
        `Cross-zone event forwarding should be gated on zone health score > 0.6.`,
        0.22, 0.89,
        [health.swarm_id]
      ));
    }

    if (temperament && temperament.anomaly_sensitivity > 0.6) {
      recs.push(this.rec(
        'anomaly_mitigation', 'medium',
        'Pre-configure anomaly containment zones for high-sensitivity swarm',
        `This swarm profile shows elevated anomaly sensitivity (${(temperament.anomaly_sensitivity * 100).toFixed(0)}%). ` +
        `Pre-provision dedicated quarantine zones and automatic rerouting paths ` +
        `so anomaly isolation is immediate rather than reactive.`,
        0.13, 0.71,
        []
      ));
    }

    return recs;
  }

  // ── Throughput advice ─────────────────────────────────────────────────────

  private throughputAdvice(
    health: SwarmHealthReport,
    trends: OperationalTrend[]
  ): StrategicRecommendation[] {
    const recs: StrategicRecommendation[] = [];

    if (health.throughput_stability < 0.5) {
      recs.push(this.rec(
        'throughput_tuning', 'medium',
        'Introduce event ingestion smoothing with token bucket rate limiter',
        `Throughput stability ${(health.throughput_stability * 100).toFixed(0)}%. ` +
        `Burst spikes create queue pressure and trigger retry cascades. ` +
        `Implement a token bucket at ingestion layer: fill_rate=20/s, burst_cap=80 events. ` +
        `This smooths bursts without reducing average throughput.`,
        0.11, 0.76,
        [health.swarm_id]
      ));
    }

    const throughputTrend = trends.find(t => t.metric === 'orchestration_efficiency');
    if (throughputTrend?.direction === 'degrading') {
      recs.push(this.rec(
        'throughput_tuning', 'high',
        'Investigate efficiency degradation trend — systematic root cause likely',
        `Orchestration efficiency declining across ${throughputTrend.samples.length} recent runs ` +
        `(${(throughputTrend.change_pct).toFixed(0)}% change). ` +
        `This pattern suggests systemic rather than per-run variance. ` +
        `Audit recent deployment changes, external dependency latency, and agent configuration drift.`,
        0.16, 0.81,
        throughputTrend.samples.slice(-3).map(s => s.swarm_id)
      ));
    }

    return recs;
  }

  // ── Governance posture advice ─────────────────────────────────────────────

  private governancePostureAdvice(
    health: SwarmHealthReport,
    temperament: SwarmTemperament | null,
    trends: OperationalTrend[]
  ): StrategicRecommendation[] {
    const recs: StrategicRecommendation[] = [];

    if (!temperament) return recs;

    if (temperament.risk_profile === 'aggressive' && health.overall_health < 0.7) {
      recs.push(this.rec(
        'governance_posture', 'high',
        'Shift to proactive governance stance for aggressive swarm profile',
        `Swarm risk profile: ${temperament.risk_profile}. Predicted failure risk: ${(temperament.predicted_failure_risk * 100).toFixed(0)}%. ` +
        `Current reactive governance is insufficient. ` +
        `Recommend lowering governance action confidence threshold to 0.45 and enabling ` +
        `pre-emptive retry suppression when retry rate exceeds 10% (current: 20% threshold).`,
        0.15, 0.77,
        []
      ));
    }

    if (temperament.resilience > 0.75 && temperament.stability > 0.70) {
      recs.push(this.rec(
        'governance_posture', 'low',
        'Loosen governance intervention thresholds for high-resilience swarm',
        `Swarm demonstrates excellent stability (${(temperament.stability * 100).toFixed(0)}%) and resilience (${(temperament.resilience * 100).toFixed(0)}%). ` +
        `Raising the governance confidence threshold to 0.70 would reduce unnecessary ` +
        `interventions while trusting the swarm's self-correction capability.`,
        0.06, 0.65,
        []
      ));
    }

    return recs;
  }

  // ── Builder helper ────────────────────────────────────────────────────────

  private rec(
    category: StrategyCategory,
    priority: StrategicRecommendation['priority'],
    headline: string,
    detail: string,
    health_gain: number,
    confidence: number,
    based_on: string[]
  ): StrategicRecommendation {
    return {
      id:                     uuidv4(),
      category,
      priority,
      headline,
      detail,
      expected_health_gain:   health_gain,
      confidence,
      based_on,
      generated_at_ms:        Date.now(),
    };
  }
}

function priorityValue(p: StrategicRecommendation['priority']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[p];
}
