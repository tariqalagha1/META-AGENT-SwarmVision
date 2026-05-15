import { v4 as uuidv4 } from 'uuid';
import {
  SimulationBranch, SimulationMutation, SimulationResult,
} from '../governance/types';
import { ScoringWindow, ScoringEvent, SwarmHealthScorer } from '../scoring/health-scorer';

const scorer = new SwarmHealthScorer();

// ─── DigitalTwin ──────────────────────────────────────────────────────────────
//
// Takes a baseline ScoringWindow and a set of mutations, simulates the altered
// event stream, scores the result, and returns a predicted outcome.
//
// Mutations operate on the event stream before rescoring — no external calls,
// no live system interaction. Pure functional simulation.

export class DigitalTwin {

  createBranch(
    baseline: ScoringWindow,
    mutations: SimulationMutation[],
    label: string
  ): SimulationBranch {
    const baselineHealth = scorer.score(baseline).overall_health;

    const mutated    = this.applyMutations(baseline, mutations);
    const mutHealth  = scorer.score(mutated);

    const efficiency_gain = mutHealth.orchestration_efficiency -
      scorer.score(baseline).orchestration_efficiency;

    const retry_reduction = scorer.score(baseline).retry_pressure - mutHealth.retry_pressure;

    const risk_level = efficiency_gain < -0.1 ? 'high'
                     : efficiency_gain < 0    ? 'medium'
                     : 'low';

    const recommendation = this.buildRecommendation(
      mutations, baselineHealth, mutHealth.overall_health
    );

    return {
      branch_id:                 uuidv4(),
      swarm_id:                  baseline.swarm_id,
      label,
      created_at_ms:             Date.now(),
      mutations,
      baseline_health:           baselineHealth,
      predicted_health:          mutHealth.overall_health,
      predicted_efficiency:      mutHealth.orchestration_efficiency,
      predicted_retry_reduction: Math.max(0, retry_reduction),
      risk_level,
      recommendation,
    };
  }

  simulate(baseline: ScoringWindow, branch: SimulationBranch): SimulationResult {
    const mutated = this.applyMutations(baseline, branch.mutations);
    const mutHealth = scorer.score(mutated);
    const baseHealth = scorer.score(baseline);

    // Health trajectory: score in 5-second windows
    const trajectory: { offset_ms: number; health: number }[] = [];
    const WINDOW_MS = 5000;
    const total = mutated.window_end_ms - mutated.window_start_ms;
    const steps = Math.min(Math.ceil(total / WINDOW_MS), 30);

    for (let i = 0; i <= steps; i++) {
      const wStart = mutated.window_start_ms + i * WINDOW_MS;
      const wEnd   = wStart + WINDOW_MS;
      const slice  = mutated.events.filter(
        e => e.offset_ms >= (wStart - mutated.window_start_ms) &&
             e.offset_ms <  (wEnd   - mutated.window_start_ms)
      );
      if (slice.length === 0) continue;

      const subWindow: ScoringWindow = {
        ...mutated,
        window_start_ms: wStart,
        window_end_ms:   wEnd,
        events:          slice,
      };
      const h = scorer.score(subWindow).overall_health;
      trajectory.push({ offset_ms: i * WINDOW_MS, health: h });
    }

    // Identify removed bottlenecks
    const baseBottlenecks = scorer.score(baseline).bottlenecks.map(b => b.kind);
    const mutBottlenecks  = new Set(mutHealth.bottlenecks.map(b => b.kind));
    const bottlenecks_removed = baseBottlenecks.filter(k => !mutBottlenecks.has(k));

    // Identify prevented incidents
    const baseIncidents = scorer.score(baseline).incidents.map(i => i.kind);
    const mutIncidents  = new Set(mutHealth.incidents.map(i => i.kind));
    const incidents_prevented = baseIncidents.filter(k => !mutIncidents.has(k));

    const efficiency_gain = mutHealth.orchestration_efficiency -
      baseHealth.orchestration_efficiency;

    const summary = this.buildSimulationSummary(
      branch, baseHealth.overall_health, mutHealth.overall_health,
      bottlenecks_removed, incidents_prevented, efficiency_gain
    );

    return {
      branch_id:           branch.branch_id,
      events_simulated:    mutated.events.length,
      health_trajectory:   trajectory,
      bottlenecks_removed,
      incidents_prevented,
      efficiency_gain,
      summary,
    };
  }

  // ── Mutation application ───────────────────────────────────────────────────

  private applyMutations(
    window: ScoringWindow,
    mutations: SimulationMutation[]
  ): ScoringWindow {
    let events = [...window.events];

    for (const mutation of mutations) {
      events = this.applyMutation(events, mutation, window);
    }

    return { ...window, events };
  }

  private applyMutation(
    events: ScoringEvent[],
    mutation: SimulationMutation,
    window: ScoringWindow
  ): ScoringEvent[] {
    switch (mutation.kind) {

      case 'alter_retry_policy': {
        // Reduce retry events after applied_at_offset_ms based on max_retries parameter
        const maxRetries = (mutation.parameters.max_retries as number) ?? 2;
        const retryCountPerAgent = new Map<string, number>();
        return events.filter(e => {
          if (e.offset_ms < mutation.applied_at_offset_ms) return true;
          if (e.agent_id !== mutation.target_id && mutation.target_id !== '*') return true;
          const isRetry = ['TASK_RETRY', 'AGENT_RETRY', 'CIRCUIT_BREAKER_HALF_OPEN'].includes(e.event_type);
          if (!isRetry) return true;
          const count = (retryCountPerAgent.get(e.agent_id) ?? 0) + 1;
          retryCountPerAgent.set(e.agent_id, count);
          return count <= maxRetries;
        });
      }

      case 'reroute_agent': {
        // Change zone_id for all events of target agent after onset
        const newZone = (mutation.parameters.to_zone as string) ?? 'zone_rerouted';
        return events.map(e => {
          if (e.agent_id !== mutation.target_id) return e;
          if (e.offset_ms < mutation.applied_at_offset_ms) return e;
          return { ...e, zone_id: newZone };
        });
      }

      case 'inject_anomaly': {
        // Inject synthetic anomaly events
        const count = (mutation.parameters.count as number) ?? 3;
        const injected: ScoringEvent[] = [];
        for (let i = 0; i < count; i++) {
          injected.push({
            id:         `sim-anomaly-${i}-${Date.now()}`,
            event_type: 'ANOMALY_DETECTED',
            agent_id:   mutation.target_id,
            zone_id:    (mutation.parameters.zone_id as string) ?? 'unknown',
            offset_ms:  mutation.applied_at_offset_ms + i * 2000,
            priority:   0,
            data:       { severity: 'high', simulated: true },
          });
        }
        return [...events, ...injected].sort((a, b) => a.offset_ms - b.offset_ms);
      }

      case 'remove_agent': {
        // Remove all events from agent after onset
        return events.filter(e =>
          e.agent_id !== mutation.target_id ||
          e.offset_ms < mutation.applied_at_offset_ms
        );
      }

      case 'add_capacity': {
        // Duplicate events of an existing agent under a new agent_id (simulates adding a clone)
        const sourceAgent = mutation.target_id;
        const newAgentId  = (mutation.parameters.new_agent_id as string) ?? `${sourceAgent}-clone`;
        const cloned = events
          .filter(e => e.agent_id === sourceAgent && e.offset_ms >= mutation.applied_at_offset_ms)
          .map(e => ({
            ...e,
            id:       `clone-${e.id}`,
            agent_id: newAgentId,
          }));
        return [...events, ...cloned].sort((a, b) => a.offset_ms - b.offset_ms);
      }

      case 'change_throughput': {
        // Scale event timestamps to simulate faster/slower throughput
        const factor = (mutation.parameters.factor as number) ?? 0.8;
        const onset  = mutation.applied_at_offset_ms;
        return events.map(e => {
          if (e.offset_ms < onset) return e;
          const delta = e.offset_ms - onset;
          return { ...e, offset_ms: Math.round(onset + delta * factor) };
        });
      }

      case 'apply_governance': {
        // Apply a governance action inline — suppress retries or throttle
        const kind = mutation.parameters.action_kind as string;
        if (kind === 'suppress_retries') {
          const RETRY_TYPES = new Set(['TASK_RETRY', 'AGENT_RETRY']);
          const counters = new Map<string, number>();
          const maxRetries = 2;
          return events.filter(e => {
            if (e.offset_ms < mutation.applied_at_offset_ms) return true;
            if (!RETRY_TYPES.has(e.event_type)) return true;
            const c = (counters.get(e.agent_id) ?? 0) + 1;
            counters.set(e.agent_id, c);
            return c <= maxRetries;
          });
        }
        return events;
      }

      default:
        return events;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildRecommendation(
    mutations: SimulationMutation[],
    baselineHealth: number,
    predictedHealth: number
  ): string {
    const delta = predictedHealth - baselineHealth;
    const pct   = Math.abs(Math.round(delta * 100));
    const verb  = delta >= 0 ? 'improves' : 'reduces';
    const kinds = [...new Set(mutations.map(m => m.kind))].join(', ');

    if (Math.abs(delta) < 0.02) {
      return `Mutations (${kinds}) have negligible health impact — proceed with caution`;
    }
    return `Applying ${kinds} ${verb} predicted health by ${pct}% (${(baselineHealth * 100).toFixed(0)}% → ${(predictedHealth * 100).toFixed(0)}%)`;
  }

  private buildSimulationSummary(
    branch: SimulationBranch,
    baseline: number,
    predicted: number,
    removed: string[],
    prevented: string[],
    effGain: number
  ): string {
    const parts: string[] = [];
    const delta = predicted - baseline;
    parts.push(`Branch "${branch.label}": health ${(baseline * 100).toFixed(0)}% → ${(predicted * 100).toFixed(0)}% (${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%)`);
    if (removed.length)   parts.push(`${removed.length} bottleneck type${removed.length > 1 ? 's' : ''} resolved`);
    if (prevented.length) parts.push(`${prevented.length} incident type${prevented.length > 1 ? 's' : ''} prevented`);
    if (Math.abs(effGain) > 0.02) {
      parts.push(`efficiency ${effGain >= 0 ? '+' : ''}${(effGain * 100).toFixed(0)}%`);
    }
    return parts.join(' — ');
  }
}
