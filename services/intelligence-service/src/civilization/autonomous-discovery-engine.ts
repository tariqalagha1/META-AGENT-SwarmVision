import { v4 as uuidv4 } from 'uuid';
import { ScoringEvent, SwarmHealthReport } from '../scoring/health-scorer';
import { EmergentBehaviorReport } from '../emergence/types';
import { SwarmCoherenceReport } from '../emergence/types';
import { EvolutionResult } from '../emergence/types';
import {
  DiscoveredPattern, DiscoveryKind, DiscoveryReport,
} from './types';
import { CivilizationalMemoryState } from './types';

// ── Discovery engines ─────────────────────────────────────────────────────────

function discoverTopologyInnovations(
  events: ScoringEvent[],
  emergent: EmergentBehaviorReport,
  health: SwarmHealthReport,
): DiscoveredPattern[] {
  const discoveries: DiscoveredPattern[] = [];
  const agentSet = new Set(events.map(e => e.agent_id));
  const N = agentSet.size;
  if (N < 2) return discoveries;

  // Detect ring topology: each agent appears as both source and target exactly once
  const handoffs = events.filter(e => e.event_type === 'TASK_HANDOFF');
  const outDeg = new Map<string, number>();
  const inDeg  = new Map<string, number>();
  for (const e of handoffs) {
    outDeg.set(e.agent_id, (outDeg.get(e.agent_id) ?? 0) + 1);
    const to = (e.data as Record<string,unknown>)?.to_agent as string | undefined;
    if (to) inDeg.set(to, (inDeg.get(to) ?? 0) + 1);
  }
  const allInOne  = Array.from(outDeg.values()).every(v => v === 1);
  const allOutOne = Array.from(inDeg.values()).every(v => v === 1);
  if (allInOne && allOutOne && outDeg.size >= 3) {
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'topology_innovation',
      description:        'Ring topology detected: circular handoff chain with no bottleneck node',
      conditions_required: ['N >= 3 agents', 'each agent exactly 1 in + 1 out handoff'],
      expected_gain:      0.12,
      confidence:         0.72,
      novelty_score:      0.65,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `TASK_HANDOFF pattern analysis across ${N} agents`,
    });
  }

  // Detect star-burst: single agent fans out to all others
  const maxOut = Math.max(...Array.from(outDeg.values()));
  if (maxOut >= N - 1 && N >= 4) {
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'topology_innovation',
      description:        'Star-burst topology: single agent distributes work to all peers simultaneously',
      conditions_required: [`1 agent with out-degree >= N-1`, 'N >= 4 agents'],
      expected_gain:      0.18,
      confidence:         0.80,
      novelty_score:      0.55,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `Out-degree analysis: max out-degree ${maxOut} of ${N} agents`,
    });
  }

  return discoveries;
}

function discoverGovernanceMutations(
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  evolution: EvolutionResult | null,
): DiscoveredPattern[] {
  const discoveries: DiscoveredPattern[] = [];

  // Pressure-release valve: temporarily loosening governance during anomaly storms
  if (emergent.anomaly_propagation.kind === 'epidemic' ||
      emergent.emergent_retry_pattern.kind === 'storm') {
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'governance_mutation',
      description:        'Pressure-release governance: temporarily suspend retry limits during storm to allow system to self-drain',
      conditions_required: ['anomaly propagation = epidemic OR retry_pattern = storm'],
      expected_gain:      0.14,
      confidence:         0.68,
      novelty_score:      0.58,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `Anomaly pattern: ${emergent.anomaly_propagation.kind}, retry: ${emergent.emergent_retry_pattern.kind}`,
    });
  }

  // Entropy-controlled governance: dynamically adjusting thresholds by coordination entropy
  if (coherence.coordination_entropy > 0.50 && coherence.collective_stress < 0.40) {
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'governance_mutation',
      description:        'Entropy-adaptive governance: use coordination entropy as a real-time governance threshold scaler',
      conditions_required: ['coordination_entropy > 0.50', 'collective_stress < 0.40'],
      expected_gain:      0.10,
      confidence:         0.62,
      novelty_score:      0.72,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `Entropy ${coherence.coordination_entropy.toFixed(2)} with manageable stress ${coherence.collective_stress.toFixed(2)}`,
    });
  }

  // Elite preservation: genome elitism extended across federation boundaries
  if (evolution && evolution.dominant_mutations.length >= 3) {
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'governance_mutation',
      description:        `Cross-generation genome elitism: preserve ${evolution.dominant_mutations.slice(0, 2).join(' + ')} mutations as constitutional governance invariants`,
      conditions_required: ['evolution converged', 'dominant_mutations >= 3'],
      expected_gain:      0.16,
      confidence:         0.75,
      novelty_score:      0.60,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `Dominant mutations: ${evolution.dominant_mutations.join(', ')}`,
    });
  }

  return discoveries;
}

function discoverCoordinationModels(
  events: ScoringEvent[],
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
): DiscoveredPattern[] {
  const discoveries: DiscoveredPattern[] = [];

  // Resonance coordination: agents naturally synchronizing without explicit handoff signals
  if (emergent.synchronization_quality > 0.65 &&
      coherence.coordination_entropy < 0.35) {
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'coordination_model',
      description:        'Resonance coordination: emergent timing synchrony without explicit signals — agents phase-lock through shared task timing',
      conditions_required: ['sync_quality > 0.65', 'coordination_entropy < 0.35'],
      expected_gain:      0.20,
      confidence:         0.78,
      novelty_score:      0.82,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `Sync quality ${emergent.synchronization_quality.toFixed(2)}, entropy ${coherence.coordination_entropy.toFixed(2)}`,
    });
  }

  // Asymmetric load-based swarming: agents dynamically shift to overloaded peers
  const completions = events.filter(e => e.event_type === 'TASK_COMPLETED');
  const agentCounts = new Map<string, number>();
  for (const e of completions) agentCounts.set(e.agent_id, (agentCounts.get(e.agent_id) ?? 0) + 1);
  const counts = Array.from(agentCounts.values());
  const mean = counts.reduce((s, v) => s + v, 0) / Math.max(counts.length, 1);
  const variance = counts.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(counts.length, 1);
  const cv = counts.length > 0 ? Math.sqrt(variance) / mean : 0;

  if (cv > 0.40 && coherence.operational_cohesion > 0.50) {
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'coordination_model',
      description:        'Asymmetric swarming: high coefficient-of-variation in agent completion counts suggests spontaneous load-specialization',
      conditions_required: ['task completion CV > 0.40', 'operational_cohesion > 0.50'],
      expected_gain:      0.13,
      confidence:         0.65,
      novelty_score:      0.68,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `Completion CV: ${cv.toFixed(2)}, ${counts.length} active agents`,
    });
  }

  return discoveries;
}

function discoverDoctrines(
  civMemory: CivilizationalMemoryState,
  health: SwarmHealthReport,
): DiscoveredPattern[] {
  const discoveries: DiscoveredPattern[] = [];

  // Phoenix doctrine: deliberately enter decline to accelerate renaissance
  const declineEras = civMemory.era_history.filter(e => e.kind === 'decline');
  const renaissanceEras = civMemory.era_history.filter(e => e.kind === 'renaissance');
  if (declineEras.length > 0 && renaissanceEras.length >= declineEras.length * 0.6) {
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'doctrine_invention',
      description:        'Phoenix Doctrine: historical evidence that decline eras reliably precede renaissance — consider controlled decline as a growth strategy',
      conditions_required: ['decline era count > 0', 'renaissance/decline ratio >= 0.60'],
      expected_gain:      0.22,
      confidence:         0.70,
      novelty_score:      0.90,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `${declineEras.length} decline eras → ${renaissanceEras.length} renaissance eras in civilizational history`,
    });
  }

  // Wisdom compounding doctrine: exponential gains from multi-era pattern recognition
  if (civMemory.civilizational_wisdom > 0.40 && civMemory.successful_patterns.length >= 2) {
    const totalRecurrence = civMemory.successful_patterns.reduce((s, p) => s + p.recurrence_count, 0);
    discoveries.push({
      discovery_id:       uuidv4(),
      kind:               'doctrine_invention',
      description:        `Wisdom Compounding Doctrine: ${civMemory.successful_patterns.length} confirmed success patterns (${totalRecurrence} recurrences) provide governance leverage — apply proactively`,
      conditions_required: ['civilizational_wisdom > 0.40', 'successful_patterns >= 2'],
      expected_gain:      0.18,
      confidence:         civMemory.civilizational_wisdom,
      novelty_score:      0.75,
      discovered_at_ms:   Date.now(),
      experiment_basis:   `Wisdom: ${civMemory.civilizational_wisdom.toFixed(2)}, patterns: ${civMemory.successful_patterns.length}`,
    });
  }

  return discoveries;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function runAutonomousDiscovery(
  swarmId: string,
  events: ScoringEvent[],
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  evolution: EvolutionResult | null,
  civMemory: CivilizationalMemoryState,
): DiscoveryReport {
  const now = Date.now();

  const allDiscoveries: DiscoveredPattern[] = [
    ...discoverTopologyInnovations(events, emergent, health),
    ...discoverGovernanceMutations(emergent, coherence, evolution),
    ...discoverCoordinationModels(events, emergent, coherence),
    ...discoverDoctrines(civMemory, health),
  ];

  // Sort by novelty_score * confidence
  allDiscoveries.sort((a, b) =>
    (b.novelty_score * b.confidence) - (a.novelty_score * a.confidence)
  );

  const topK = allDiscoveries.slice(0, 6);

  const totalExplored = events.length * 3;  // rough estimate: 3 analysis passes per event
  const noveltyFrontier = topK.length > 0
    ? topK.reduce((s, d) => s + d.novelty_score, 0) / topK.length
    : 0;

  const experiments: string[] = [];
  if (topK.some(d => d.kind === 'topology_innovation')) {
    experiments.push('Deploy ring topology in isolated sub-stream — measure latency vs hub-spoke baseline');
  }
  if (topK.some(d => d.kind === 'governance_mutation')) {
    experiments.push('Run shadow governance with discovered mutation for 2 generations — A/B fitness comparison');
  }
  if (topK.some(d => d.kind === 'coordination_model')) {
    experiments.push('Enforce resonance coordination conditions on 3 agents — measure sync quality improvement');
  }
  if (topK.some(d => d.kind === 'doctrine_invention')) {
    experiments.push('Encode discovered doctrine as candidate constitutional rule — evaluate over 5 generations');
  }

  const directions: string[] = [
    'Explore higher-dimensional coordination entropy spaces (N > 8 agents)',
    'Map cross-era pattern correlations for predictive governance switching',
    'Investigate emergent role specialization under antifragile growth philosophy',
  ];
  if (civMemory.failed_patterns.length > 2) {
    directions.push(`Analyze ${civMemory.failed_patterns.length} failure patterns for anti-doctrine synthesis`);
  }

  return {
    swarm_id:                 swarmId,
    generated_at_ms:          now,
    discoveries:              topK,
    total_patterns_explored:  totalExplored,
    novelty_frontier:         noveltyFrontier,
    recommended_experiments:  experiments,
    research_directions:      directions,
  };
}
