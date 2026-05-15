import { SwarmEvent } from "../types";
import { SwarmHealthScorer } from "../scoring/health-scorer";
import {
  MutationKind,
  OrchestrationGenome,
  EvolutionResult,
} from "../emergence/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const POPULATION_SIZE    = 6;
const MAX_GENERATIONS    = 8;
const ELITISM_COUNT      = 2;       // top N survive unchanged
const CONVERGENCE_DELTA  = 0.01;    // fitness improvement threshold
const CONVERGENCE_WINDOW = 3;       // generations without improvement = converged

const ALL_MUTATIONS: MutationKind[] = [
  "adjust_retry_policy",
  "reorder_pipeline",
  "merge_agents",
  "split_agent",
  "shift_governance_threshold",
  "change_priority_weights",
  "introduce_buffer_agent",
];

// ─── Public API ───────────────────────────────────────────────────────────────

export function evolveOrchestration(
  swarmId: string,
  events: SwarmEvent[],
  windowMs: number,
): EvolutionResult {
  const scorer = new SwarmHealthScorer();
  const baseline = evaluateBaseline(scorer, swarmId, events, windowMs);
  const now = Date.now();

  // Initial population: baseline + 5 random single-mutation genomes
  let population: OrchestrationGenome[] = [baseline];
  for (let i = 1; i < POPULATION_SIZE; i++) {
    const mutation = ALL_MUTATIONS[i % ALL_MUTATIONS.length];
    const genome   = applyMutationToGenome(baseline, mutation, now);
    genome.fitness_score = evaluateFitness(scorer, swarmId, events, windowMs, genome);
    population.push(genome);
  }

  const allGenerations: OrchestrationGenome[] = [...population];
  const fitnessTrend: number[] = [avgFitness(population)];
  let noImproveCount = 0;
  let convergedGen: number | null = null;

  // Evolve
  for (let gen = 1; gen < MAX_GENERATIONS; gen++) {
    // Sort by fitness
    population.sort((a, b) => b.fitness_score - a.fitness_score);

    const prevBest = population[0].fitness_score;

    // Elitism: keep top N
    const nextGen: OrchestrationGenome[] = population.slice(0, ELITISM_COUNT).map(g => ({
      ...g,
      generation: gen,
    }));

    // Fill rest with mutations of top performers
    while (nextGen.length < POPULATION_SIZE) {
      const parent  = population[Math.floor(Math.random() * ELITISM_COUNT)];
      const mutation = ALL_MUTATIONS[Math.floor(Math.random() * ALL_MUTATIONS.length)];
      const child    = applyMutationToGenome(parent, mutation, now);
      child.generation  = gen;
      child.fitness_score = evaluateFitness(scorer, swarmId, events, windowMs, child);
      nextGen.push(child);
    }

    population = nextGen;
    allGenerations.push(...population);

    const newBest = Math.max(...population.map(g => g.fitness_score));
    fitnessTrend.push(avgFitness(population));

    if (newBest - prevBest < CONVERGENCE_DELTA) {
      noImproveCount++;
      if (noImproveCount >= CONVERGENCE_WINDOW) {
        convergedGen = gen;
        break;
      }
    } else {
      noImproveCount = 0;
    }
  }

  population.sort((a, b) => b.fitness_score - a.fitness_score);
  allGenerations.sort((a, b) => b.fitness_score - a.fitness_score);

  const best  = population[0];
  const worst = population[population.length - 1];

  // Dominant mutations: present in top 20% of all evaluated genomes
  const topCutoff = Math.max(1, Math.floor(allGenerations.length * 0.2));
  const topGenomes = allGenerations.slice(0, topCutoff);
  const mutationCounts = new Map<MutationKind, number>();
  for (const g of topGenomes) {
    if (g.mutation_applied) {
      mutationCounts.set(g.mutation_applied, (mutationCounts.get(g.mutation_applied) ?? 0) + 1);
    }
  }
  const dominantMutations = [...mutationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return {
    swarm_id:              swarmId,
    generations:           deduplicateGenomes(allGenerations),
    best_genome:           best,
    worst_genome:          worst,
    fitness_trend:         fitnessTrend,
    converged:             convergedGen !== null,
    convergence_generation: convergedGen,
    dominant_mutations:    dominantMutations,
    evolution_insights:    buildInsights(best, worst, dominantMutations, fitnessTrend),
  };
}

// ─── Genome operations ────────────────────────────────────────────────────────

function evaluateBaseline(
  scorer: SwarmHealthScorer,
  swarmId: string,
  events: SwarmEvent[],
  windowMs: number,
): OrchestrationGenome {
  const report = scorer.score({ swarm_id: swarmId, started_at_ms: 0, window_start_ms: 0, window_end_ms: windowMs, events });
  return {
    generation: 0,
    genome_id: `g0_baseline_${Date.now()}`,
    parent_id: null,
    mutation_applied: null,
    mutation_params: {},
    fitness_score: report.overall_health,
    evaluated_at_ms: Date.now(),
  };
}

function applyMutationToGenome(
  parent: OrchestrationGenome,
  mutation: MutationKind,
  now: number,
): OrchestrationGenome {
  const params = buildMutationParams(mutation, parent);
  return {
    generation:      parent.generation + 1,
    genome_id:       `g${parent.generation + 1}_${mutation}_${now}_${Math.random().toString(36).slice(2, 6)}`,
    parent_id:       parent.genome_id,
    mutation_applied: mutation,
    mutation_params: params,
    fitness_score:   0,
    evaluated_at_ms: now,
  };
}

function buildMutationParams(mutation: MutationKind, parent: OrchestrationGenome): Record<string, number | string> {
  const prevRetryMax = (parent.mutation_params.retry_max as number) ?? 3;
  const prevThreshold = (parent.mutation_params.governance_threshold as number) ?? 0.55;

  switch (mutation) {
    case "adjust_retry_policy":
      return { retry_max: Math.max(1, prevRetryMax - 1), backoff_multiplier: 2.0 };
    case "reorder_pipeline":
      return { reorder_priority: "validate_before_process" };
    case "merge_agents":
      return { merge_target: "agent_process+agent_validate", capacity_boost: 1.5 };
    case "split_agent":
      return { split_target: "agent_ingest", new_agent_suffix: "_b", load_split: 0.5 };
    case "shift_governance_threshold":
      return { governance_threshold: Math.max(0.30, prevThreshold - 0.10) };
    case "change_priority_weights":
      return { retry_weight: 0.40, health_weight: 0.60 };
    case "introduce_buffer_agent":
      return { buffer_zone: "corridor", buffer_capacity: 5 };
  }
}

function evaluateFitness(
  scorer: SwarmHealthScorer,
  swarmId: string,
  events: SwarmEvent[],
  windowMs: number,
  genome: OrchestrationGenome,
): number {
  // Apply genome mutation to event stream and rescore
  const mutated = applyGenomeMutation(events, genome);
  const report  = scorer.score({
    swarm_id: swarmId,
    started_at_ms: 0,
    window_start_ms: 0,
    window_end_ms: windowMs,
    events: mutated,
  });
  return report.overall_health;
}

// ─── Genome → event stream transformation ────────────────────────────────────

function applyGenomeMutation(events: SwarmEvent[], genome: OrchestrationGenome): SwarmEvent[] {
  if (!genome.mutation_applied) return events;
  const p = genome.mutation_params;

  switch (genome.mutation_applied) {
    case "adjust_retry_policy": {
      // Remove excess retries beyond retry_max per agent per task
      const retryMax = (p.retry_max as number) ?? 2;
      const retryCounts = new Map<string, number>();
      return events.filter(ev => {
        if (ev.event_type !== "TASK_RETRY") return true;
        const key = `${ev.agent_id}::${ev.data?.task_id ?? ""}`;
        const c = retryCounts.get(key) ?? 0;
        if (c >= retryMax) return false;
        retryCounts.set(key, c + 1);
        return true;
      });
    }

    case "shift_governance_threshold": {
      // Simulate earlier governance firing: remove some anomaly events (they were prevented)
      const threshold = (p.governance_threshold as number) ?? 0.45;
      let anomalyBudget = Math.floor(events.length * threshold * 0.1);
      return events.filter(ev => {
        if (ev.event_type === "ANOMALY_DETECTED" && anomalyBudget > 0) {
          anomalyBudget--;
          return false;
        }
        return true;
      });
    }

    case "introduce_buffer_agent": {
      // Add synthetic buffer completions to smooth throughput
      const bufferZone = (p.buffer_zone as string) ?? "corridor";
      const extras: SwarmEvent[] = [];
      for (let i = 0; i < Math.min(3, events.length); i++) {
        const ref = events[Math.floor(Math.random() * events.length)];
        extras.push({
          ...ref,
          event_id:   `buf_${i}_${Date.now()}`,
          event_type: "TASK_COMPLETED",
          agent_id:   "agent_buffer",
          channel:    bufferZone,
          data:       { task_id: `buf_t${i}`, quality_score: "0.85" },
        });
      }
      return [...events, ...extras];
    }

    case "merge_agents": {
      // Collapse two agents' events into one (simulates merged capacity)
      const split = String(p.merge_target ?? "").split("+");
      const [a, b] = split.length === 2 ? split : ["agent_process", "agent_validate"];
      return events.map(ev =>
        ev.agent_id === b ? { ...ev, agent_id: a } : ev,
      );
    }

    default:
      return events;
  }
}

// ─── Insights ─────────────────────────────────────────────────────────────────

function buildInsights(
  best: OrchestrationGenome,
  worst: OrchestrationGenome,
  dominant: MutationKind[],
  trend: number[],
): string[] {
  const out: string[] = [];
  const improvement = round2((best.fitness_score - worst.fitness_score) * 100);
  out.push(`Best genome fitness: ${Math.round(best.fitness_score * 100)}% (${improvement}% improvement over worst)`);
  if (best.mutation_applied) {
    out.push(`Top mutation: ${best.mutation_applied} (params: ${JSON.stringify(best.mutation_params)})`);
  }
  if (dominant.length > 0) {
    out.push(`Dominant mutations in top 20%: ${dominant.join(", ")}`);
  }
  if (trend.length > 2) {
    const firstFitness = trend[0];
    const lastFitness  = trend[trend.length - 1];
    if (lastFitness > firstFitness + 0.01) {
      out.push(`Fitness improved across ${trend.length} generations`);
    } else {
      out.push("Fitness plateau reached — orchestration near local optimum");
    }
  }
  return out;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function avgFitness(pop: OrchestrationGenome[]): number {
  return round2(pop.reduce((s, g) => s + g.fitness_score, 0) / Math.max(pop.length, 1));
}

function deduplicateGenomes(genomes: OrchestrationGenome[]): OrchestrationGenome[] {
  const seen = new Set<string>();
  return genomes.filter(g => {
    if (seen.has(g.genome_id)) return false;
    seen.add(g.genome_id);
    return true;
  });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
