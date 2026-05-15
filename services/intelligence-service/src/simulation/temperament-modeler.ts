import { SwarmTemperament } from '../governance/types';
import { SwarmHistoryRecord } from '../types';

// ─── TemperamentModeler ───────────────────────────────────────────────────────
//
// Derives a behavioral "personality" model for the swarm from its history.
// Used by the governance engine to calibrate thresholds and by the copilot
// to provide contextual characterizations like "this swarm is highly resilient
// but tends toward aggressive retry behavior."

export class TemperamentModeler {

  compute(swarm_id: string, history: SwarmHistoryRecord[]): SwarmTemperament {
    const relevant = history.filter(r =>
      r.swarm_id.startsWith(swarm_id.split('-')[0]) && r.overall_health !== null
    );

    if (relevant.length === 0) {
      return this.defaultTemperament(swarm_id);
    }

    const n = relevant.length;

    // ── Stability: std-dev inverse of overall_health ──────────────────────────
    const healthValues = relevant.map(r => r.overall_health);
    const stability    = clamp(1 - stdDev(healthValues) * 3);

    // ── Resilience: health after incidents vs baseline ────────────────────────
    // Proxy: runs with incidents but good final health → resilient
    const incidentRuns = relevant.filter(r => r.incident_kinds.length > 0);
    const resilience   = incidentRuns.length > 0
      ? clamp(avg(incidentRuns.map(r => r.overall_health)) + 0.2)
      : 0.7;

    // ── Aggression: average retry_count / event_count ─────────────────────────
    const retryRatios  = relevant.map(r => r.retry_count / Math.max(r.event_count, 1));
    const aggression   = clamp(avg(retryRatios) * 5);

    // ── Anomaly sensitivity: average anomaly_count / event_count ─────────────
    const anomalyRatios      = relevant.map(r => r.anomaly_count / Math.max(r.event_count, 1));
    const anomaly_sensitivity = clamp(avg(anomalyRatios) * 8);

    // ── Retry persistence: fraction of runs with retry incidents ─────────────
    const retryIncidentRuns = relevant.filter(r =>
      r.incident_kinds.includes('retry_storm') ||
      r.incident_kinds.includes('orchestration_instability')
    );
    const retry_persistence = clamp(retryIncidentRuns.length / Math.max(n, 1) * 2);

    // ── Recovery speed: avg duration from incident to healthy health ──────────
    // Proxy: runs with incidents — shorter duration_ms with good health → fast recovery
    const recoveryProxy = incidentRuns.length > 0
      ? incidentRuns.filter(r => r.overall_health > 0.6).length / Math.max(incidentRuns.length, 1)
      : 0.5;
    const recovery_speed = clamp(recoveryProxy);

    // ── Dominant trait ────────────────────────────────────────────────────────
    const traits = [
      { label: 'highly stable',      value: stability,           threshold: 0.75 },
      { label: 'resilient',           value: resilience,          threshold: 0.70 },
      { label: 'aggressive',          value: aggression,          threshold: 0.55 },
      { label: 'anomaly-prone',       value: anomaly_sensitivity, threshold: 0.50 },
      { label: 'retry-persistent',    value: retry_persistence,   threshold: 0.50 },
      { label: 'fast-recovering',     value: recovery_speed,      threshold: 0.70 },
    ].filter(t => t.value >= t.threshold);

    const dominant_trait = traits.length > 0
      ? traits.sort((a, b) => b.value - a.value).slice(0, 2).map(t => t.label).join(', ')
      : 'balanced operational profile';

    // ── Risk profile ──────────────────────────────────────────────────────────
    const risk_profile: SwarmTemperament['risk_profile'] =
      aggression > 0.65 || retry_persistence > 0.65 ? 'aggressive'
    : aggression < 0.3  && anomaly_sensitivity < 0.3  ? 'conservative'
    : 'moderate';

    // ── Predicted failure risk ────────────────────────────────────────────────
    // Based on trend: recent runs worse than historical average
    const sortedByTime = [...relevant].sort((a, b) => a.completed_at_ms - b.completed_at_ms);
    const recentHalf   = sortedByTime.slice(Math.floor(n / 2));
    const recentHealth = avg(recentHalf.map(r => r.overall_health));
    const trend_risk   = recentHealth < avg(healthValues) - 0.1 ? 0.3 : 0;

    const predicted_failure_risk = clamp(
      aggression * 0.25 +
      anomaly_sensitivity * 0.25 +
      (1 - resilience) * 0.20 +
      (1 - stability)  * 0.20 +
      trend_risk
    );

    return {
      swarm_id,
      computed_at_ms:       Date.now(),
      sample_count:         n,
      stability,
      resilience,
      aggression,
      anomaly_sensitivity,
      retry_persistence,
      recovery_speed,
      dominant_trait,
      risk_profile,
      predicted_failure_risk,
    };
  }

  private defaultTemperament(swarm_id: string): SwarmTemperament {
    return {
      swarm_id,
      computed_at_ms:          Date.now(),
      sample_count:            0,
      stability:               0.5,
      resilience:              0.5,
      aggression:              0.5,
      anomaly_sensitivity:     0.5,
      retry_persistence:       0.5,
      recovery_speed:          0.5,
      dominant_trait:          'insufficient history — default profile',
      risk_profile:            'moderate',
      predicted_failure_risk:  0.3,
    };
  }
}

function clamp(v: number): number { return Math.max(0, Math.min(1, v)); }
function avg(vs: number[]): number { return vs.length ? vs.reduce((a,b)=>a+b,0)/vs.length : 0; }
function stdDev(vs: number[]): number {
  if (vs.length < 2) return 0;
  const m = avg(vs);
  return Math.sqrt(vs.reduce((s,v) => s+(v-m)**2, 0) / vs.length);
}
