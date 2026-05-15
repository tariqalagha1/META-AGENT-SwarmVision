import {
  NarrativeState, NarrativePhase, RecommendedShot,
  SwarmHealthReport, DetectedIncident,
} from '../types';
import { ScoringWindow } from '../scoring/health-scorer';

// ─── NarrativeEngine ──────────────────────────────────────────────────────────
//
// Translates live operational data into a cinematically-aware narrative state.
// The ACinematicDirector in UE5 polls this (via intelligence-service API) to
// make semantically-informed shot selection decisions instead of purely
// event-reactive cuts.

export class NarrativeEngine {

  compute(
    window: ScoringWindow,
    health: SwarmHealthReport,
    elapsedMs: number,
  ): NarrativeState {
    const phase       = this.computePhase(health, elapsedMs, window);
    const tension     = this.computeTension(health, phase);
    const pacing      = this.computePacing(tension, phase);
    const focusAgent  = this.selectFocusAgent(health, window);
    const focusZone   = this.selectFocusZone(health);
    const story_beat  = this.buildStoryBeat(health, phase, focusAgent, focusZone);
    const shots       = this.buildRecommendedShots(health, phase, focusAgent, focusZone, tension);

    return { phase, tension, pacing, focus_agent: focusAgent, focus_zone: focusZone, story_beat, recommended_shots: shots };
  }

  // ── Phase computation ─────────────────────────────────────────────────────────

  private computePhase(
    health: SwarmHealthReport,
    elapsedMs: number,
    window: ScoringWindow
  ): NarrativePhase {
    const hasCriticalIncident = health.incidents.some(
      i => i.risk === 'critical' || i.risk === 'high'
    );
    const isRecovering = health.health_trend === 'improving' && health.overall_health < 0.7;
    const isComplete   = window.events.some(e => e.event_type === 'SWARM_COMPLETED');
    const isFailed     = window.events.some(e => e.event_type === 'SWARM_FAILED');

    if (isFailed)                           return 'resolution';
    if (isComplete)                         return 'epilogue';
    if (isRecovering)                       return 'recovery';
    if (hasCriticalIncident)                return 'incident';
    if (elapsedMs < 8000)                   return 'activation';
    if (elapsedMs < 20000)                  return 'ramp';
    if (health.overall_health > 0.75)       return 'peak_operation';
    if (health.overall_health < 0.4)        return 'incident';
    return 'peak_operation';
  }

  // ── Tension: 0 (calm) → 1 (crisis) ───────────────────────────────────────────

  private computeTension(health: SwarmHealthReport, phase: NarrativePhase): number {
    let tension = 0;

    // Base from health inversion
    tension += (1 - health.overall_health) * 0.4;

    // Retry pressure contributes directly
    tension += (1 - health.retry_pressure) * 0.25;

    // Active critical incidents add a burst
    const criticals = health.incidents.filter(i => i.risk === 'critical').length;
    tension += Math.min(criticals * 0.2, 0.3);

    // Phase modulation
    const phaseBoost: Record<NarrativePhase, number> = {
      dormant:         0,
      activation:      0,
      ramp:            0.05,
      peak_operation:  0.05,
      incident:        0.3,
      recovery:        0.1,
      resolution:      0.05,
      epilogue:        0,
    };
    tension += phaseBoost[phase] ?? 0;

    return Math.max(0, Math.min(1, tension));
  }

  // ── Pacing ────────────────────────────────────────────────────────────────────

  private computePacing(
    tension: number,
    phase: NarrativePhase
  ): NarrativeState['pacing'] {
    if (phase === 'incident' || tension > 0.75) return 'urgent';
    if (tension > 0.45)                         return 'fast';
    if (phase === 'activation' || phase === 'epilogue' || tension < 0.15) return 'slow';
    return 'medium';
  }

  // ── Focus selection ───────────────────────────────────────────────────────────

  private selectFocusAgent(
    health: SwarmHealthReport,
    window: ScoringWindow
  ): string | null {
    // Priority 1: agent in a critical incident
    for (const inc of health.incidents) {
      if ((inc.risk === 'critical' || inc.risk === 'high') && inc.affected_agents.length) {
        return inc.affected_agents[0];
      }
    }

    // Priority 2: highest-severity bottleneck agent
    const bottleneckAgent = health.bottlenecks.find(b => b.agent_id)?.agent_id;
    if (bottleneckAgent) return bottleneckAgent;

    // Priority 3: least efficient agent currently active
    const sorted = [...health.agent_scores].sort((a, b) => a.efficiency - b.efficiency);
    if (sorted.length && sorted[0].efficiency < 0.6) return sorted[0].agent_id;

    // Default: busiest agent
    const busiest = [...health.agent_scores].sort((a, b) => b.event_count - a.event_count);
    return busiest[0]?.agent_id ?? null;
  }

  private selectFocusZone(health: SwarmHealthReport): string | null {
    // Zone with highest-severity bottleneck
    const zoneBottleneck = health.bottlenecks
      .filter(b => b.zone_id)
      .sort((a, b) => b.severity - a.severity)[0];
    return zoneBottleneck?.zone_id ?? null;
  }

  // ── Story beat ────────────────────────────────────────────────────────────────

  private buildStoryBeat(
    health: SwarmHealthReport,
    phase: NarrativePhase,
    focusAgent: string | null,
    focusZone: string | null
  ): string {
    const activeInc = health.incidents.find(i => i.risk === 'critical' || i.risk === 'high');
    if (activeInc) return activeInc.description;

    const topBottleneck = health.bottlenecks[0];
    if (topBottleneck && topBottleneck.severity > 0.5) return topBottleneck.description;

    const phaseBeat: Record<NarrativePhase, string> = {
      dormant:         'Swarm systems standing by',
      activation:      'Agents coming online — initializing orchestration',
      ramp:            focusAgent ? `${focusAgent} entering active phase` : 'Swarm ramping to capacity',
      peak_operation:  focusZone  ? `Peak activity in ${focusZone}` : 'All systems operating at capacity',
      incident:        focusAgent ? `Critical event on ${focusAgent}` : 'Swarm under operational stress',
      recovery:        focusAgent ? `${focusAgent} recovering` : 'Swarm stabilizing',
      resolution:      'Orchestration sequence concluding',
      epilogue:        `Swarm completed — ${Math.round(health.orchestration_efficiency * 100)}% efficiency`,
    };

    return phaseBeat[phase] ?? 'Operational activity in progress';
  }

  // ── Shot recommendations ──────────────────────────────────────────────────────

  private buildRecommendedShots(
    health: SwarmHealthReport,
    phase: NarrativePhase,
    focusAgent: string | null,
    focusZone: string | null,
    tension: number
  ): RecommendedShot[] {
    const shots: RecommendedShot[] = [];

    // Tension-responsive primary shot
    if (tension > 0.65) {
      shots.push({
        shot_label:   'Crisis close-up',
        focal_mm:     85,
        aperture:     1.4,
        target_actor: focusAgent,
        duration_s:   3.5,
        priority:     0,
      });
      shots.push({
        shot_label:   'Anomaly zone wide',
        focal_mm:     24,
        aperture:     4.0,
        target_actor: focusZone,
        duration_s:   5.0,
        priority:     1,
      });
    } else if (tension > 0.35) {
      shots.push({
        shot_label:   'Active agent focus',
        focal_mm:     50,
        aperture:     2.0,
        target_actor: focusAgent,
        duration_s:   5.0,
        priority:     0,
      });
      shots.push({
        shot_label:   'Zone activity mid-shot',
        focal_mm:     35,
        aperture:     2.8,
        target_actor: focusZone,
        duration_s:   6.0,
        priority:     1,
      });
    } else {
      shots.push({
        shot_label:   'Cinematic wide establishing',
        focal_mm:     24,
        aperture:     2.8,
        target_actor: null,
        duration_s:   8.0,
        priority:     0,
      });
    }

    // Phase-specific supplementary shots
    switch (phase) {
      case 'activation':
        shots.push({ shot_label: 'Activation rack focus', focal_mm: 100, aperture: 1.2, target_actor: focusAgent, duration_s: 4.0, priority: 2 });
        break;
      case 'peak_operation':
        shots.push({ shot_label: 'Dolly corridor sweep', focal_mm: 35, aperture: 2.8, target_actor: null, duration_s: 10.0, priority: 2 });
        break;
      case 'incident':
        shots.push({ shot_label: 'Tight crisis shallow DOF', focal_mm: 100, aperture: 1.2, target_actor: focusAgent, duration_s: 3.0, priority: 1 });
        shots.push({ shot_label: 'Reaction shot — secondary agent', focal_mm: 85, aperture: 1.8, target_actor: null, duration_s: 2.5, priority: 3 });
        break;
      case 'recovery':
        shots.push({ shot_label: 'Recovery arc — medium', focal_mm: 50, aperture: 2.0, target_actor: focusAgent, duration_s: 6.0, priority: 2 });
        break;
      case 'epilogue':
        shots.push({ shot_label: 'Epilogue pullback', focal_mm: 24, aperture: 4.0, target_actor: null, duration_s: 12.0, priority: 1 });
        shots.push({ shot_label: 'Final portrait', focal_mm: 85, aperture: 1.4, target_actor: focusAgent, duration_s: 6.0, priority: 2 });
        break;
    }

    return shots.sort((a, b) => a.priority - b.priority);
  }
}
