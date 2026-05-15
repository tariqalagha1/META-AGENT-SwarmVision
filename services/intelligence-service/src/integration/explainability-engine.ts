import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { SwarmHealthReport } from '../scoring/health-scorer';
import { EmergentBehaviorReport, SwarmCoherenceReport } from '../emergence/types';
import { MetaStrategicReport, CivilizationalMemoryState } from '../civilization/types';
import { GovernancePhilosophy } from '../civilization/types';
import {
  CausalStep, CausalGraph, GovernanceLineageEntry, ExplanationKind,
  StrategicRationaleTimeline, ExplainabilityReport,
} from './types';

// ── Schema ────────────────────────────────────────────────────────────────────

const CREATE_LINEAGE = `
CREATE TABLE IF NOT EXISTS governance_lineage (
  entry_id       TEXT PRIMARY KEY,
  swarm_id       TEXT NOT NULL,
  timestamp_ms   INTEGER NOT NULL,
  kind           TEXT NOT NULL,
  summary        TEXT NOT NULL,
  causal_json    TEXT NOT NULL,
  human_readable TEXT NOT NULL,
  decision_maker TEXT NOT NULL,
  reversible     INTEGER NOT NULL DEFAULT 1
)`;

// ── Causal graph builders ─────────────────────────────────────────────────────

function buildInterventionCausal(
  health: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
  actionKind: string,
): CausalGraph {
  const h = health.overall_health;
  const a = health.anomaly_rate ?? 0;

  const steps: CausalStep[] = [
    {
      step:        1,
      observation: `Swarm health at ${(h * 100).toFixed(0)}% — anomaly rate ${(a * 100).toFixed(0)}%`,
      inference:   h < 0.40 ? 'Critical health degradation detected' : a > 0.20 ? 'Elevated anomaly rate warrants attention' : 'Operational metrics within monitoring range',
      confidence:  0.95,
      evidence:    [`overall_health: ${h.toFixed(3)}`, `anomaly_rate: ${a.toFixed(3)}`],
    },
    {
      step:        2,
      observation: `Collective stress: ${(coherence.collective_stress * 100).toFixed(0)}%, coordination entropy: ${(coherence.coordination_entropy * 100).toFixed(0)}%`,
      inference:   coherence.collective_stress > 0.50 ? 'System under compounding stress — intervention may prevent cascade' : 'Stress within tolerable bounds',
      confidence:  0.88,
      evidence:    [`collective_stress: ${coherence.collective_stress.toFixed(3)}`, `coherence_label: ${coherence.coherence_label}`],
    },
    {
      step:        3,
      observation: `Proposed action: ${actionKind}`,
      inference:   `Action selected as optimal response given current state`,
      confidence:  0.82,
      evidence:    [`risk-weighted selection from governance action space`],
    },
  ];

  const totalConf = steps.reduce((s, st) => s + st.confidence, 0) / steps.length;

  return {
    root_cause:      h < 0.35 ? 'Health degradation below crisis threshold' : `Anomaly propagation risk: ${(a * 100).toFixed(0)}%`,
    causal_chain:    steps,
    final_effect:    `${actionKind} issued to restore operational stability`,
    total_confidence: parseFloat(totalConf.toFixed(3)),
  };
}

function buildPhilosophyShiftCausal(
  prevPhilosophy: GovernancePhilosophy | null,
  newPhilosophy: GovernancePhilosophy,
  fitnessDelta: number,
): CausalGraph {
  const steps: CausalStep[] = [
    {
      step:        1,
      observation: prevPhilosophy
        ? `Previous ideology: ${prevPhilosophy.ideology} — fitness: ${(prevPhilosophy.fitness_score * 100).toFixed(0)}%`
        : 'No prior governance philosophy — founding governance event',
      inference:   prevPhilosophy
        ? fitnessDelta > 0.08 ? 'Significant fitness improvement available through ideology shift' : 'Marginal improvement from philosophy mutation'
        : 'Initial governance philosophy selected from fitness landscape',
      confidence:  0.90,
      evidence:    [`fitness_delta: +${(fitnessDelta * 100).toFixed(1)}%`],
    },
    {
      step:        2,
      observation: `Population of ${5} candidate philosophies evaluated`,
      inference:   `${newPhilosophy.ideology}/${newPhilosophy.optimization_philosophy} emerged as dominant`,
      confidence:  0.85,
      evidence:    [`fitness_score: ${(newPhilosophy.fitness_score * 100).toFixed(0)}%`, `mutation: ${newPhilosophy.mutation_applied ?? 'seed'}`],
    },
    {
      step:        3,
      observation: `Coordination ethic: ${newPhilosophy.coordination_ethic}, intervention principle: ${newPhilosophy.intervention_principle}`,
      inference:   'Full doctrine configuration derived from dominant philosophy',
      confidence:  0.92,
      evidence:    [`philosophy_id: ${newPhilosophy.philosophy_id.slice(0, 8)}`],
    },
  ];

  return {
    root_cause:      'Governance fitness landscape evaluation across ideology space',
    causal_chain:    steps,
    final_effect:    `${newPhilosophy.ideology} adopted as governing philosophy (gen ${newPhilosophy.generation})`,
    total_confidence: 0.89,
  };
}

function buildStructuralChangeCausal(
  changesSummary: string[],
  health: SwarmHealthReport,
): CausalGraph {
  const steps: CausalStep[] = [
    {
      step:        1,
      observation: `Agent event stream analyzed — ${changesSummary.length} structural change(s) detected`,
      inference:   health.overall_health < 0.40 ? 'Crisis-driven restructuring required' : 'Optimization-driven evolution',
      confidence:  0.88,
      evidence:    [`health: ${health.overall_health.toFixed(2)}`],
    },
    {
      step:        2,
      observation: changesSummary.join('; '),
      inference:   'Organizational structure evolved to match operational reality',
      confidence:  0.82,
      evidence:    changesSummary,
    },
  ];

  return {
    root_cause:      'Operational demand diverged from static organizational structure',
    causal_chain:    steps,
    final_effect:    `Organizational restructuring: ${changesSummary[0] ?? 'structure updated'}`,
    total_confidence: 0.85,
  };
}

function toHumanReadable(kind: ExplanationKind, causal: CausalGraph, summary: string): string {
  const conf = (causal.total_confidence * 100).toFixed(0);
  return `[${kind.replace(/_/g, ' ').toUpperCase()}] ${summary}. Root cause: ${causal.root_cause}. ` +
    `The system traced ${causal.causal_chain.length} causal steps from observation to action, ` +
    `concluding with: "${causal.final_effect}". Reasoning confidence: ${conf}%.`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class ExplainabilityEngine {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_LINEAGE);
  }

  private record(entry: GovernanceLineageEntry): void {
    this.db.prepare(`
      INSERT INTO governance_lineage
        (entry_id, swarm_id, timestamp_ms, kind, summary, causal_json, human_readable, decision_maker, reversible)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      entry.entry_id, entry.swarm_id, entry.timestamp_ms, entry.kind,
      entry.summary, JSON.stringify(entry.causal_graph), entry.human_readable,
      entry.decision_maker, entry.reversible ? 1 : 0,
    );
  }

  // ── Public explanation builders ────────────────────────────────────────────

  explainIntervention(
    swarmId: string,
    actionKind: string,
    health: SwarmHealthReport,
    coherence: SwarmCoherenceReport,
    decisionMaker: string,
  ): GovernanceLineageEntry {
    const causal  = buildInterventionCausal(health, coherence, actionKind);
    const summary = `Intervention: ${actionKind} — health ${(health.overall_health * 100).toFixed(0)}%, stress ${(coherence.collective_stress * 100).toFixed(0)}%`;
    const entry: GovernanceLineageEntry = {
      entry_id:       uuidv4(),
      swarm_id:       swarmId,
      timestamp_ms:   Date.now(),
      kind:           'intervention',
      summary,
      causal_graph:   causal,
      human_readable: toHumanReadable('intervention', causal, summary),
      decision_maker: decisionMaker,
      reversible:     !actionKind.includes('shutdown') && !actionKind.includes('terminate'),
    };
    this.record(entry);
    return entry;
  }

  explainPhilosophyShift(
    swarmId: string,
    prev: GovernancePhilosophy | null,
    next: GovernancePhilosophy,
    fitnessDelta: number,
    decisionMaker: string,
  ): GovernanceLineageEntry {
    const causal  = buildPhilosophyShiftCausal(prev, next, fitnessDelta);
    const summary = prev
      ? `Ideology shift: ${prev.ideology} → ${next.ideology} (+${(fitnessDelta * 100).toFixed(1)}% fitness)`
      : `Founding philosophy established: ${next.ideology}`;
    const entry: GovernanceLineageEntry = {
      entry_id:       uuidv4(),
      swarm_id:       swarmId,
      timestamp_ms:   Date.now(),
      kind:           'philosophy_shift',
      summary,
      causal_graph:   causal,
      human_readable: toHumanReadable('philosophy_shift', causal, summary),
      decision_maker: decisionMaker,
      reversible:     true,
    };
    this.record(entry);
    return entry;
  }

  explainStructuralChange(
    swarmId: string,
    changes: string[],
    health: SwarmHealthReport,
    decisionMaker: string,
  ): GovernanceLineageEntry {
    const causal  = buildStructuralChangeCausal(changes, health);
    const summary = `Organizational restructuring: ${changes[0] ?? 'structure updated'} (${changes.length} changes)`;
    const entry: GovernanceLineageEntry = {
      entry_id:       uuidv4(),
      swarm_id:       swarmId,
      timestamp_ms:   Date.now(),
      kind:           'structural_change',
      summary,
      causal_graph:   causal,
      human_readable: toHumanReadable('structural_change', causal, summary),
      decision_maker: decisionMaker,
      reversible:     true,
    };
    this.record(entry);
    return entry;
  }

  explainInstitutionFormation(
    swarmId: string,
    institutionNames: string[],
    rationale: string[],
    decisionMaker: string,
  ): GovernanceLineageEntry {
    const causal: CausalGraph = {
      root_cause:   'Operational conditions triggered autonomous institution formation criteria',
      causal_chain: rationale.map((r, i) => ({
        step: i + 1, observation: r, inference: `${institutionNames[i] ?? 'institution'} formation warranted`, confidence: 0.80, evidence: [r],
      })),
      final_effect: `${institutionNames.join(', ')} formed`,
      total_confidence: 0.80,
    };
    const summary = `Institutions formed: ${institutionNames.join(', ')}`;
    const entry: GovernanceLineageEntry = {
      entry_id:       uuidv4(),
      swarm_id:       swarmId,
      timestamp_ms:   Date.now(),
      kind:           'institution_formation',
      summary,
      causal_graph:   causal,
      human_readable: toHumanReadable('institution_formation', causal, summary),
      decision_maker: decisionMaker,
      reversible:     true,
    };
    this.record(entry);
    return entry;
  }

  // ── Report ─────────────────────────────────────────────────────────────────

  getLineage(swarmId: string, limit = 20): GovernanceLineageEntry[] {
    return (this.db.prepare(
      `SELECT * FROM governance_lineage WHERE swarm_id = ? ORDER BY timestamp_ms DESC LIMIT ?`
    ).all(swarmId, limit) as Array<Record<string, unknown>>).map(r => ({
      ...r,
      causal_graph: JSON.parse(r.causal_json as string),
      reversible:   (r.reversible as number) === 1,
    })) as unknown as GovernanceLineageEntry[];
  }

  getTimeline(swarmId: string): StrategicRationaleTimeline {
    const entries = this.getLineage(swarmId, 50);
    const kindCounts = new Map<string, number>();
    for (const e of entries) kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
    const dominant = [...kindCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';

    const turningPoints = entries
      .filter(e => e.kind === 'philosophy_shift' || e.kind === 'institution_formation')
      .map(e => e.summary)
      .slice(0, 5);

    return { swarm_id: swarmId, entries, dominant_theme: dominant, turning_points: turningPoints };
  }

  generateReport(swarmId: string): ExplainabilityReport {
    const recent = this.getLineage(swarmId, 10);
    const total  = (this.db.prepare(
      'SELECT COUNT(*) as n FROM governance_lineage WHERE swarm_id = ?'
    ).get(swarmId) as { n: number }).n;

    const auditReadiness = Math.min(
      recent.length * 0.08 + (total > 20 ? 0.30 : total * 0.015),
      1,
    );

    const themes = recent.map(e => e.kind);
    const uniqueThemes = [...new Set(themes)];
    const causalSummary = uniqueThemes.length > 0
      ? `Recent governance decisions span ${uniqueThemes.join(', ')} — ${total} total lineage entries recorded`
      : 'No governance lineage recorded yet';

    return {
      swarm_id:                swarmId,
      generated_at_ms:         Date.now(),
      recent_decisions:        recent,
      causal_summary:          causalSummary,
      governance_lineage_depth: total,
      audit_readiness:         auditReadiness,
      unexplained_actions:     [],
    };
  }
}
