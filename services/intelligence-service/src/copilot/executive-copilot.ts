import { v4 as uuidv4 } from 'uuid';
import {
  CopilotQuery, CopilotResponse, CopilotQueryIntent,
} from '../governance/types';
import { SwarmHealthReport } from '../scoring/health-scorer';
import { SwarmHistoryRecord, OperationalTrend, ExecutiveSummary } from '../types';
import { SwarmTemperament, StrategicRecommendation } from '../governance/types';

// ─── ExecutiveCopilot ─────────────────────────────────────────────────────────
//
// Natural-language AI operations advisor. Answers structured queries by
// combining live health data, historical records, trend analysis, temperament
// models, and strategic recommendations into coherent natural language responses.
//
// This is deterministic rule-based synthesis — not an LLM call — so it runs
// at zero marginal cost and zero latency with no external dependencies.
// It produces fluent structured responses from pattern matching on intent.

export class ExecutiveCopilot {

  answer(
    query:          CopilotQuery,
    health:         SwarmHealthReport | null,
    history:        SwarmHistoryRecord[],
    trends:         OperationalTrend[],
    summary:        ExecutiveSummary | null,
    temperament:    SwarmTemperament | null,
    recommendations: StrategicRecommendation[]
  ): CopilotResponse {
    const intent = query.intent ?? this.inferIntent(query.text);

    switch (intent) {
      case 'health_query':         return this.answerHealth(query, health);
      case 'anomaly_explanation':  return this.answerAnomalyExplanation(query, health, history);
      case 'historical_comparison': return this.answerHistoricalComparison(query, history, trends);
      case 'strategy_request':     return this.answerStrategy(query, recommendations, temperament);
      case 'simulation_request':   return this.answerSimulation(query, health);
      case 'trend_query':          return this.answerTrend(query, trends, history);
      case 'intervention_query':   return this.answerIntervention(query, health, recommendations);
      default:                     return this.answerGeneral(query, health, summary);
    }
  }

  // ── Intent inference ──────────────────────────────────────────────────────

  private inferIntent(text: string): CopilotQueryIntent {
    const t = text.toLowerCase();
    if (/\bhow.*(doing|performing|health|status)\b/.test(t)) return 'health_query';
    if (/\b(anomal|incident|failure|error|why|cause)\b/.test(t)) return 'anomaly_explanation';
    if (/\b(compare|previous|history|trend|vs\.?|versus|last time)\b/.test(t)) return 'historical_comparison';
    if (/\b(recommend|suggest|improve|optimiz|should|advice|strategy)\b/.test(t)) return 'strategy_request';
    if (/\b(simulat|what if|hypothetical|branch|test|alternate)\b/.test(t)) return 'simulation_request';
    if (/\b(trend|over time|drift|changing|direction|trajectory)\b/.test(t)) return 'trend_query';
    if (/\b(intervene|stop|pause|isolate|reroute|action|command)\b/.test(t)) return 'intervention_query';
    return 'health_query';
  }

  // ── Health query ──────────────────────────────────────────────────────────

  private answerHealth(
    query: CopilotQuery,
    health: SwarmHealthReport | null
  ): CopilotResponse {
    if (!health) {
      return this.response(query, 'No live health data is available for this swarm yet. ' +
        'Once events begin flowing, health scoring will begin automatically.',
        {}, 0.5, [
          'How does this swarm compare to historical runs?',
          'What retry policy is currently in effect?',
        ]);
    }

    const pct    = Math.round(health.overall_health * 100);
    const trend  = health.health_trend;
    const label  = health.health_label;

    let answer = `The swarm is currently **${label}** at **${pct}% overall health** (${trend} trend). `;

    answer += `Orchestration efficiency: ${(health.orchestration_efficiency * 100).toFixed(0)}%. `;

    if (health.retry_pressure < 0.6) {
      answer += `⚠ Retry pressure is elevated — ${health.incidents.find(i => i.kind === 'retry_storm') ? 'a retry storm is active' : 'retry rate is high'}. `;
    }

    if (health.incidents.length > 0) {
      const top = health.incidents[0];
      answer += `The most significant active incident is **${top.kind.replace(/_/g, ' ')}** ` +
        `(${top.risk} risk, ${(top.probability * 100).toFixed(0)}% probability): ${top.description}.`;
    } else {
      answer += `No active incidents detected.`;
    }

    const followUps = [
      health.bottlenecks.length > 0 ? 'What bottlenecks are present and how severe are they?' : null,
      health.incidents.length > 0   ? `What caused the ${health.incidents[0]?.kind.replace(/_/g, ' ')}?` : null,
      'What is the recommended intervention for the current state?',
      'How does this compare to the last 10 runs?',
    ].filter(Boolean) as string[];

    return this.response(query, answer, {
      overall_health:            health.overall_health,
      orchestration_efficiency:  health.orchestration_efficiency,
      health_label:              health.health_label,
      health_trend:              health.health_trend,
      active_incidents:          health.incidents.length,
      active_bottlenecks:        health.bottlenecks.length,
    }, 0.92, followUps);
  }

  // ── Anomaly explanation ───────────────────────────────────────────────────

  private answerAnomalyExplanation(
    query: CopilotQuery,
    health: SwarmHealthReport | null,
    history: SwarmHistoryRecord[]
  ): CopilotResponse {
    if (!health) {
      return this.response(query, 'No current health data available to explain anomalies.', {}, 0.3, []);
    }

    const anomalyInc = health.incidents.find(i =>
      i.kind === 'anomaly_cascade' || i.kind === 'swarm_degradation'
    );
    const retryInc   = health.incidents.find(i => i.kind === 'retry_storm');
    const topBn      = health.bottlenecks[0];

    let answer = '';

    if (anomalyInc) {
      answer += `**Root cause analysis:** The current anomaly pattern (${anomalyInc.description}) `;
      const historicalFreq = history.filter(r => r.incident_kinds.includes(anomalyInc.kind)).length;
      if (historicalFreq > 2) {
        answer += `is a **recurring pattern** — seen in ${historicalFreq} of ${history.length} historical runs. `;
        answer += `This suggests a systemic rather than transient issue. `;
      } else {
        answer += `appears to be a new pattern not commonly seen in this swarm's history. `;
      }
    }

    if (retryInc) {
      answer += `The retry storm affecting ${retryInc.affected_agents.join(', ')} is `;
      answer += retryInc.signals.map(s =>
        `driven by ${s.signal_type.replace(/_/g, ' ')} of ${s.value.toFixed(1)} ` +
        `(threshold: ${s.threshold})`
      ).join(' and ') + '. ';
    }

    if (topBn) {
      answer += `The primary bottleneck is **${topBn.kind.replace(/_/g, ' ')}**: ${topBn.description}.`;
    }

    if (!answer) {
      answer = `The swarm is at ${(health.anomaly_severity * 100).toFixed(0)}% anomaly clarity. ` +
        `No major anomaly root causes are currently active — the system is operating within normal parameters.`;
    }

    return this.response(query, answer, {
      incidents:    health.incidents,
      bottlenecks:  health.bottlenecks.slice(0, 3),
    }, 0.85, [
      'What governance actions should be taken?',
      'Is this anomaly pattern consistent with historical behavior?',
      'How long will this take to resolve?',
    ]);
  }

  // ── Historical comparison ─────────────────────────────────────────────────

  private answerHistoricalComparison(
    query: CopilotQuery,
    history: SwarmHistoryRecord[],
    trends: OperationalTrend[]
  ): CopilotResponse {
    if (history.length === 0) {
      return this.response(query, 'No historical data is available yet. ' +
        'Run history will accumulate as swarms complete.', {}, 0.4, []);
    }

    const n            = history.length;
    const avgHealth    = avg(history.map(r => r.overall_health));
    const avgEfficiency = avg(history.map(r => r.orchestration_efficiency));
    const totalRetries = history.reduce((s, r) => s + r.retry_count, 0);
    const totalFailures = history.reduce((s, r) => s + r.failure_count, 0);

    const healthTrend  = trends.find(t => t.metric === 'overall_health');
    const trendStr     = healthTrend
      ? `Health is currently **${healthTrend.direction}** (${healthTrend.change_pct >= 0 ? '+' : ''}${healthTrend.change_pct.toFixed(0)}% change over recent runs).`
      : 'Insufficient data for trend analysis.';

    const bestRun  = history.reduce((a, b) => a.overall_health > b.overall_health ? a : b);
    const worstRun = history.reduce((a, b) => a.overall_health < b.overall_health ? a : b);

    const answer = `Over **${n} historical run${n > 1 ? 's' : ''}**: ` +
      `average health **${(avgHealth * 100).toFixed(0)}%**, ` +
      `average efficiency **${(avgEfficiency * 100).toFixed(0)}%**. ` +
      `${trendStr} ` +
      `Best run: ${bestRun.swarm_id.slice(0, 12)} (${(bestRun.overall_health * 100).toFixed(0)}%). ` +
      `Worst run: ${worstRun.swarm_id.slice(0, 12)} (${(worstRun.overall_health * 100).toFixed(0)}%). ` +
      `Total retries across all runs: ${totalRetries}. ` +
      `Total failures: ${totalFailures}.`;

    return this.response(query, answer, {
      run_count:        n,
      avg_health:       avgHealth,
      avg_efficiency:   avgEfficiency,
      health_trend:     healthTrend?.direction ?? 'unknown',
      best_run_health:  bestRun.overall_health,
      worst_run_health: worstRun.overall_health,
    }, 0.90, [
      'What recurring issues appear across runs?',
      'What strategic improvements would have the highest impact?',
      'What is this swarm\'s temperament profile?',
    ]);
  }

  // ── Strategy request ──────────────────────────────────────────────────────

  private answerStrategy(
    query: CopilotQuery,
    recs: StrategicRecommendation[],
    temperament: SwarmTemperament | null
  ): CopilotResponse {
    if (recs.length === 0) {
      return this.response(query, 'No strategic recommendations are available yet. ' +
        'More operational history is needed to generate reliable strategic advice.', {}, 0.4, []);
    }

    const topRecs = recs.slice(0, 3);
    let answer = `**Top ${topRecs.length} strategic recommendation${topRecs.length > 1 ? 's' : ''}:**\n\n`;

    topRecs.forEach((r, i) => {
      answer += `**${i + 1}. [${r.priority.toUpperCase()}] ${r.headline}**\n`;
      answer += `${r.detail}\n`;
      answer += `Expected health improvement: +${(r.expected_health_gain * 100).toFixed(0)}% (confidence: ${(r.confidence * 100).toFixed(0)}%)\n\n`;
    });

    if (temperament) {
      answer += `Given this swarm's **${temperament.risk_profile} risk profile** and ${temperament.dominant_trait}, ` +
        `priority should be placed on ${topRecs[0].category.replace(/_/g, ' ')} improvements.`;
    }

    return this.response(query, answer, { recommendations: topRecs }, 0.88, [
      'Can you simulate what would happen if we applied the top recommendation?',
      'What governance actions are currently in effect?',
      recs.length > 3 ? 'Show me all recommendations' : null,
    ].filter(Boolean) as string[]);
  }

  // ── Simulation request ────────────────────────────────────────────────────

  private answerSimulation(
    query: CopilotQuery,
    health: SwarmHealthReport | null
  ): CopilotResponse {
    const answer = `To simulate a hypothetical scenario, use the **POST /simulate/branch** endpoint ` +
      `with your desired mutations. ` +
      (health ? `Current baseline health is ${(health.overall_health * 100).toFixed(0)}%. ` : '') +
      `Available mutation types: alter_retry_policy, reroute_agent, inject_anomaly, ` +
      `remove_agent, add_capacity, change_throughput, apply_governance. ` +
      `The digital twin will score the mutated event stream and return a predicted health trajectory ` +
      `without affecting the live swarm.`;

    return this.response(query, answer, {
      simulation_endpoint: 'POST /simulate/branch',
      available_mutations: [
        'alter_retry_policy', 'reroute_agent', 'inject_anomaly',
        'remove_agent', 'add_capacity', 'change_throughput', 'apply_governance',
      ],
    }, 0.95, [
      'What retry policy mutation would most improve health?',
      'Simulate adding an extra agent to the bottleneck zone',
    ]);
  }

  // ── Trend query ───────────────────────────────────────────────────────────

  private answerTrend(
    query: CopilotQuery,
    trends: OperationalTrend[],
    history: SwarmHistoryRecord[]
  ): CopilotResponse {
    if (trends.length === 0) {
      return this.response(query, 'Trend analysis requires at least 4 completed runs. ' +
        `Currently ${history.length} run${history.length !== 1 ? 's' : ''} in history.`, {}, 0.5, []);
    }

    let answer = `**Operational trend analysis** across ${history.length} runs:\n\n`;
    for (const t of trends) {
      const emoji = t.direction === 'improving' ? '📈' : t.direction === 'degrading' ? '📉' : '➡';
      const sign  = t.change_pct >= 0 ? '+' : '';
      answer += `${emoji} **${t.metric.replace(/_/g, ' ')}**: ${t.direction} (${sign}${t.change_pct.toFixed(0)}%)\n`;
    }

    const degrading = trends.filter(t => t.direction === 'degrading');
    if (degrading.length > 0) {
      answer += `\n⚠ **${degrading.length} metric${degrading.length > 1 ? 's' : ''} degrading** — ` +
        `recommend strategic review of ${degrading[0].metric.replace(/_/g, ' ')}.`;
    }

    return this.response(query, answer, { trends }, 0.87, [
      'What is driving the degradation in ' + (trends.find(t => t.direction === 'degrading')?.metric ?? 'efficiency') + '?',
      'What long-term strategy would reverse these trends?',
    ]);
  }

  // ── Intervention query ────────────────────────────────────────────────────

  private answerIntervention(
    query: CopilotQuery,
    health: SwarmHealthReport | null,
    recs: StrategicRecommendation[]
  ): CopilotResponse {
    if (!health) {
      return this.response(query, 'No live health data available to recommend interventions.', {}, 0.3, []);
    }

    const urgentRecs = recs.filter(r => r.priority === 'critical' || r.priority === 'high');
    const topIncident = health.incidents[0];

    let answer = '';
    if (topIncident && (topIncident.risk === 'critical' || topIncident.risk === 'high')) {
      answer += `**Immediate action recommended** for ${topIncident.kind.replace(/_/g, ' ')} ` +
        `(${topIncident.risk} risk). `;
      answer += `Affected agents: ${topIncident.affected_agents.join(', ')}. `;
      answer += `Use POST /command/intervene with kind="${sugggestIntervention(topIncident.kind)}" ` +
        `targeting these agents. `;
    }

    if (urgentRecs.length > 0) {
      answer += `**Strategic interventions:** ${urgentRecs[0].headline}. ` +
        `${urgentRecs[0].detail.split('.')[0]}.`;
    }

    if (!answer) {
      answer = `No urgent interventions required. Swarm health is ${health.health_label} ` +
        `at ${(health.overall_health * 100).toFixed(0)}%. ` +
        `Continue monitoring — governance engine is active.`;
    }

    return this.response(query, answer, {
      urgent_incident:  topIncident ?? null,
      recommended_kind: topIncident ? sugggestIntervention(topIncident.kind) : null,
    }, 0.86, [
      'What will happen if we don\'t intervene?',
      'What is the rollback plan if intervention makes things worse?',
    ]);
  }

  // ── General fallback ──────────────────────────────────────────────────────

  private answerGeneral(
    query: CopilotQuery,
    health: SwarmHealthReport | null,
    summary: ExecutiveSummary | null
  ): CopilotResponse {
    const answer = summary?.headline
      ? `Current operational status: ${summary.headline}. How can I help you analyze this further?`
      : health
        ? `The swarm is ${health.health_label} at ${(health.overall_health * 100).toFixed(0)}% health. What would you like to know?`
        : `I'm the SwarmVision Executive Copilot. I can help you understand swarm health, anomalies, historical trends, and recommend strategic improvements. What would you like to explore?`;

    return this.response(query, answer, {}, 0.70, [
      'How is the swarm performing right now?',
      'What anomalies have occurred recently?',
      'What strategic improvements do you recommend?',
      'How does this compare to historical runs?',
    ]);
  }

  // ── Response builder ──────────────────────────────────────────────────────

  private response(
    query: CopilotQuery,
    answer: string,
    data: Record<string, unknown>,
    confidence: number,
    follow_ups: string[]
  ): CopilotResponse {
    return {
      query_id:        query.query_id,
      answer,
      data,
      confidence,
      follow_ups,
      generated_at_ms: Date.now(),
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(vs: number[]): number {
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
}

function sugggestIntervention(incidentKind: string): string {
  const map: Record<string, string> = {
    retry_storm:               'suppress_retries',
    anomaly_cascade:           'quarantine_anomaly',
    throughput_collapse:       'throttle_agent',
    swarm_degradation:         'cool_swarm',
    orchestration_instability: 'stabilize_orchestration',
    agent_exhaustion:          'isolate_agent',
  };
  return map[incidentKind] ?? 'stabilize_orchestration';
}
