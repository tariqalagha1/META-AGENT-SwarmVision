import { SwarmEvent } from "../types";
import { SwarmHealthScorer } from "../scoring/health-scorer";
import { evolveOrchestration } from "./orchestration-evolver";
import {
  EvolutionaryBranch,
  EvolutionaryTwinResult,
  LongHorizonForecast,
  ForecastWindow,
  InterventionOpportunity,
  OrchestrationGenome,
} from "../emergence/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const WINDOW_STEP_MS   = 5_000;
const MAX_HORIZON_MS   = 120_000;
const MAX_BRANCHES     = 12;
const PRUNE_THRESHOLD  = 0.40;          // branches below this fitness are pruned
const FORECAST_STEPS   = 10;

function eventMs(ev: SwarmEvent): number {
  return ev.timestamp_ms ?? ev.offset_ms ?? 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function runEvolutionaryTwin(
  swarmId: string,
  events: SwarmEvent[],
  horizonMs: number = MAX_HORIZON_MS,
): EvolutionaryTwinResult {
  const scorer = new SwarmHealthScorer();

  // Evolve orchestration to get candidate genomes
  const evolution = evolveOrchestration(swarmId, events, events.length > 0
    ? eventMs(events[events.length - 1]!) - eventMs(events[0]!)
    : 30_000);

  // Convert top genomes into branches
  const topGenomes = evolution.generations
    .sort((a, b) => b.fitness_score - a.fitness_score)
    .slice(0, MAX_BRANCHES);

  const branches: EvolutionaryBranch[] = topGenomes.map((genome, idx) =>
    buildBranch(genome, idx, events, scorer, swarmId, horizonMs),
  );

  // Prune weak branches
  for (const branch of branches) {
    if (branch.simulated_fitness < PRUNE_THRESHOLD) {
      branch.selected = false;
      branch.pruned_reason = `Fitness ${Math.round(branch.simulated_fitness * 100)}% below prune threshold`;
    }
  }

  const surviving = branches.filter(b => b.selected);
  const recommended = surviving.length > 0
    ? surviving.sort((a, b) => b.simulated_fitness - a.simulated_fitness)[0]
    : branches[0];

  // Long-horizon forecast from the recommended branch
  const forecast = buildLongHorizonForecast(swarmId, recommended, horizonMs);

  return {
    swarm_id:             swarmId,
    horizon_ms:           horizonMs,
    branches_explored:    branches.length,
    surviving_branches:   surviving,
    recommended_branch:   recommended,
    long_horizon_forecast: forecast,
  };
}

// ─── Branch construction ──────────────────────────────────────────────────────

function buildBranch(
  genome: OrchestrationGenome,
  index: number,
  events: SwarmEvent[],
  scorer: SwarmHealthScorer,
  swarmId: string,
  horizonMs: number,
): EvolutionaryBranch {
  const mutLabel   = genome.mutation_applied ?? "baseline";
  const trajectory = simulateHealthTrajectory(genome, events, scorer, swarmId, horizonMs);
  const fitness    = trajectory.length > 0
    ? trajectory.reduce((a, b) => a + b, 0) / trajectory.length
    : genome.fitness_score;

  return {
    branch_id:       genome.genome_id,
    generation:      genome.generation,
    parent_branch_id: genome.parent_id,
    strategy_label:  buildStrategyLabel(mutLabel, genome),
    genome,
    simulated_health_trajectory: trajectory,
    simulated_fitness:           round2(fitness),
    selected:                    true,
    pruned_reason:               null,
  };
}

function buildStrategyLabel(mutation: string, genome: OrchestrationGenome): string {
  const labels: Record<string, string> = {
    baseline:                    "Baseline (no change)",
    adjust_retry_policy:         `Retry policy: max ${genome.mutation_params.retry_max ?? "?"} × ${genome.mutation_params.backoff_multiplier ?? 1}× backoff`,
    reorder_pipeline:            "Pipeline: validate-first ordering",
    merge_agents:                `Merged agents: ${genome.mutation_params.merge_target ?? "?"}`,
    split_agent:                 `Split agent: ${genome.mutation_params.split_target ?? "?"}`,
    shift_governance_threshold:  `Governance threshold → ${genome.mutation_params.governance_threshold ?? "?"}`,
    change_priority_weights:     "Adjusted retry/health priority weights",
    introduce_buffer_agent:      `Buffer agent in ${genome.mutation_params.buffer_zone ?? "?"} zone`,
  };
  return labels[mutation] ?? mutation;
}

// ─── Health trajectory simulation ────────────────────────────────────────────

function simulateHealthTrajectory(
  genome: OrchestrationGenome,
  baseEvents: SwarmEvent[],
  scorer: SwarmHealthScorer,
  swarmId: string,
  horizonMs: number,
): number[] {
  const trajectory: number[] = [];
  const steps = Math.min(FORECAST_STEPS, Math.floor(horizonMs / WINDOW_STEP_MS));
  const stepMs = Math.max(WINDOW_STEP_MS, Math.floor(horizonMs / steps));

  // Seed with baseline fitness and decay/improve based on mutation
  let simHealth = genome.fitness_score;
  const drift = computeDriftRate(genome);

  for (let i = 0; i < steps; i++) {
    // Apply deterministic noise proportional to current health variance
    const noise = (Math.sin(i * 1.3 + genome.generation) * 0.03);
    simHealth = clamp01(simHealth + drift + noise);
    trajectory.push(round2(simHealth));
  }
  return trajectory;
}

function computeDriftRate(genome: OrchestrationGenome): number {
  if (!genome.mutation_applied) return -0.002;  // baseline gradually degrades

  const positiveImpact: Partial<Record<string, number>> = {
    adjust_retry_policy:         +0.008,
    shift_governance_threshold:  +0.006,
    introduce_buffer_agent:      +0.004,
    merge_agents:                +0.005,
    change_priority_weights:     +0.003,
    reorder_pipeline:            +0.002,
    split_agent:                 +0.007,
  };
  return positiveImpact[genome.mutation_applied] ?? 0;
}

// ─── Long-horizon forecast ────────────────────────────────────────────────────

function buildLongHorizonForecast(
  swarmId: string,
  branch: EvolutionaryBranch,
  horizonMs: number,
): LongHorizonForecast {
  const trajectory = branch.simulated_health_trajectory;
  const stepMs     = Math.floor(horizonMs / Math.max(trajectory.length, 1));

  const windows: ForecastWindow[] = trajectory.map((health, i) => ({
    offset_ms:        i * stepMs,
    predicted_health: health,
    confidence:       round2(Math.max(0.40, 0.90 - i * 0.05)),  // confidence decays over time
    dominant_risk:    health < 0.45 ? "health_degradation" :
                      health < 0.65 ? "efficiency_drift" : null,
  }));

  // Expected failure: first window where health < 0.35
  const failWindow = windows.find(w => w.predicted_health < 0.35);
  const expectedFailureMs = failWindow?.offset_ms ?? null;

  // Intervention opportunities: windows where health is about to cross a threshold
  const opportunities: InterventionOpportunity[] = [];
  for (let i = 1; i < windows.length; i++) {
    const delta = windows[i].predicted_health - windows[i - 1].predicted_health;
    if (delta < -0.08) {
      opportunities.push({
        offset_ms:     windows[i].offset_ms,
        kind:          "preemptive_governance",
        expected_gain: round2(Math.abs(delta) * 1.5),
        urgency:       windows[i].predicted_health < 0.45 ? "high" : "medium",
        description:   `Health drop of ${Math.round(Math.abs(delta) * 100)}% predicted — preemptive governance can recover ${Math.round(Math.abs(delta) * 150)}%`,
      });
    }
    if (delta > 0.06 && windows[i].predicted_health > 0.70) {
      opportunities.push({
        offset_ms:     windows[i].offset_ms,
        kind:          "evolution_window",
        expected_gain: 0.05,
        urgency:       "low",
        description:   "Health recovery window — optimal time to apply next evolution mutation",
      });
    }
  }

  // Governance evolution plan from dominant mutations
  const genomeMutation = branch.genome.mutation_applied;
  const governancePlan: string[] = [];
  if (genomeMutation) {
    governancePlan.push(`Apply ${genomeMutation} from generation ${branch.generation}`);
    governancePlan.push("Monitor health trajectory for 2 windows before next evolution");
    governancePlan.push("Reinforce with retry suppression if health < 0.55 post-evolution");
  }

  return {
    swarm_id:                  swarmId,
    forecast_windows:          windows,
    expected_failure_ms:       expectedFailureMs,
    intervention_opportunities: opportunities.slice(0, 5),
    governance_evolution_plan:  governancePlan,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
