import { v4 as uuidv4 } from 'uuid';
import { OptimizationLearning, RetryPolicy } from './types';
import { SwarmHistoryRecord, OperationalTrend } from '../types';

// ─── SelfOptimizer ────────────────────────────────────────────────────────────
//
// Examines historical patterns and current trends to derive parameter
// improvements. These suggestions feed back into the governance engine
// as default-policy adjustments for future swarm runs.

const CORRELATION_WINDOW = 20;  // minimum runs needed to compute reliable correlations

export class SelfOptimizer {

  computeLearnings(
    history: SwarmHistoryRecord[],
    trends:  OperationalTrend[],
    currentPolicies: RetryPolicy[]
  ): OptimizationLearning[] {
    const learnings: OptimizationLearning[] = [];

    if (history.length < 4) return learnings;

    learnings.push(...this.optimizeRetryBackoff(history, currentPolicies));
    learnings.push(...this.optimizeCircuitBreakerThreshold(history, currentPolicies));
    learnings.push(...this.optimizeThroughputTarget(history, trends));
    learnings.push(...this.optimizeGovernanceSensitivity(history));

    return learnings.sort((a, b) => b.expected_improvement - a.expected_improvement);
  }

  // ── Retry backoff optimization ─────────────────────────────────────────────
  // If retry-heavy runs show worse health, increase backoff multiplier.

  private optimizeRetryBackoff(
    history:  SwarmHistoryRecord[],
    policies: RetryPolicy[]
  ): OptimizationLearning[] {
    const results: OptimizationLearning[] = [];

    // Find average health delta for runs with high vs low retry counts
    const sorted       = [...history].sort((a, b) => a.retry_count - b.retry_count);
    const lowRetryAvg  = avg(sorted.slice(0, Math.ceil(sorted.length / 2)).map(r => r.overall_health));
    const highRetryAvg = avg(sorted.slice(Math.floor(sorted.length / 2)).map(r => r.overall_health));
    const healthDelta  = lowRetryAvg - highRetryAvg;

    if (healthDelta > 0.08) {
      // High retries correlate with worse health — increase backoff
      for (const policy of policies) {
        const currentMultiplier   = policy.backoff_multiplier;
        const suggestedMultiplier = Math.min(currentMultiplier * (1 + healthDelta), 8.0);
        const improvement         = healthDelta * 0.6;

        if (suggestedMultiplier - currentMultiplier > 0.3) {
          results.push({
            swarm_id:             policy.agent_id,
            parameter:            'retry_backoff_multiplier',
            current_value:        currentMultiplier,
            suggested_value:      parseFloat(suggestedMultiplier.toFixed(2)),
            expected_improvement: improvement,
            confidence:           Math.min(0.5 + history.length / 40, 0.92),
            based_on_runs:        history.length,
            last_updated_ms:      Date.now(),
          });
        }
      }
    }

    return results;
  }

  // ── Circuit breaker threshold optimization ────────────────────────────────
  // Tune CB threshold based on anomaly count / health correlation.

  private optimizeCircuitBreakerThreshold(
    history:  SwarmHistoryRecord[],
    policies: RetryPolicy[]
  ): OptimizationLearning[] {
    const results: OptimizationLearning[] = [];

    const anomalyRuns = history.filter(r => r.anomaly_count > 0);
    if (anomalyRuns.length < 3) return results;

    const avgAnomalyHealth = avg(anomalyRuns.map(r => r.overall_health));
    const cleanHealth      = avg(history.filter(r => r.anomaly_count === 0).map(r => r.overall_health));
    const penalty          = cleanHealth - avgAnomalyHealth;

    if (penalty > 0.1) {
      // Lower CB threshold to trip faster — prevent anomaly accumulation
      for (const policy of policies) {
        const current   = policy.circuit_breaker_threshold;
        const suggested = Math.max(current - Math.round(penalty * 10), 2);
        if (suggested < current) {
          results.push({
            swarm_id:             policy.agent_id,
            parameter:            'circuit_breaker_threshold',
            current_value:        current,
            suggested_value:      suggested,
            expected_improvement: penalty * 0.5,
            confidence:           Math.min(0.45 + anomalyRuns.length / 20, 0.88),
            based_on_runs:        history.length,
            last_updated_ms:      Date.now(),
          });
        }
      }
    }

    return results;
  }

  // ── Throughput target optimization ────────────────────────────────────────
  // Identify whether recent runs have throughput instability trend.

  private optimizeThroughputTarget(
    history: SwarmHistoryRecord[],
    trends:  OperationalTrend[]
  ): OptimizationLearning[] {
    const retryTrend = trends.find(t => t.metric === 'retry_count');
    if (!retryTrend || retryTrend.direction !== 'degrading') return [];

    // Suggest queue batch-size reduction if retries are trending up
    const currentBatchSize  = 50;   // assumed default
    const suggestedBatchSize = 35;
    const improvement        = Math.min(retryTrend.change_pct / 200, 0.15);

    return [{
      swarm_id:             'global',
      parameter:            'queue_batch_size',
      current_value:        currentBatchSize,
      suggested_value:      suggestedBatchSize,
      expected_improvement: improvement,
      confidence:           0.62,
      based_on_runs:        history.length,
      last_updated_ms:      Date.now(),
    }];
  }

  // ── Governance sensitivity optimization ───────────────────────────────────
  // If governance actions have tracked outcome deltas, tune thresholds.

  private optimizeGovernanceSensitivity(
    history: SwarmHistoryRecord[]
  ): OptimizationLearning[] {
    if (history.length < CORRELATION_WINDOW) return [];

    const recentWindow = history.slice(0, CORRELATION_WINDOW);
    const recoveryRuns = recentWindow.filter(r =>
      r.incident_kinds.length > 0 && r.overall_health > 0.65
    );
    const recoveryRate = recoveryRuns.length / CORRELATION_WINDOW;

    if (recoveryRate > 0.7) {
      // High recovery rate suggests governance is working — can relax thresholds slightly
      return [{
        swarm_id:             'global',
        parameter:            'governance_min_confidence_threshold',
        current_value:        0.55,
        suggested_value:      0.50,
        expected_improvement: 0.05,
        confidence:           0.68,
        based_on_runs:        CORRELATION_WINDOW,
        last_updated_ms:      Date.now(),
      }];
    }

    if (recoveryRate < 0.3) {
      // Low recovery — tighten governance to act earlier
      return [{
        swarm_id:             'global',
        parameter:            'governance_min_confidence_threshold',
        current_value:        0.55,
        suggested_value:      0.65,
        expected_improvement: 0.08,
        confidence:           0.72,
        based_on_runs:        CORRELATION_WINDOW,
        last_updated_ms:      Date.now(),
      }];
    }

    return [];
  }
}

function avg(vs: number[]): number {
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
}
