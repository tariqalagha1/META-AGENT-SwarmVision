import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { HumanInterventionRecord } from './types';
import {
  OperatorTrustProfile, TrustDimension, TrustReport,
} from './types';
import { HumanGovernanceLayer } from './human-governance-layer';

// ── Schema ────────────────────────────────────────────────────────────────────

const CREATE_TRUST_SNAPSHOTS = `
CREATE TABLE IF NOT EXISTS trust_snapshots (
  snapshot_id    TEXT PRIMARY KEY,
  operator_id    TEXT NOT NULL,
  swarm_id       TEXT NOT NULL,
  overall_trust  REAL NOT NULL,
  calibration    REAL NOT NULL,
  alignment      REAL NOT NULL,
  quality        REAL NOT NULL,
  recorded_at_ms INTEGER NOT NULL
)`;

// ── Trust computation ─────────────────────────────────────────────────────────

function computeCalibration(interventions: HumanInterventionRecord[]): number {
  const withOutcome = interventions.filter(i => i.outcome_health_delta !== null);
  if (withOutcome.length === 0) return 0.60;

  // Calibration = fraction of interventions that improved health
  const positive = withOutcome.filter(i => (i.outcome_health_delta ?? 0) > 0).length;
  return positive / withOutcome.length;
}

function computeInterventionQuality(interventions: HumanInterventionRecord[]): number {
  const withOutcome = interventions.filter(i => i.outcome_health_delta !== null);
  if (withOutcome.length === 0) return 0.60;

  // Quality = avg positive health delta normalized
  const avgDelta = withOutcome.reduce((s, i) => s + (i.outcome_health_delta ?? 0), 0) / withOutcome.length;
  return Math.min(Math.max(0.50 + avgDelta * 2, 0), 1);
}

function buildTrustDimensions(
  approvalRate: number,
  vetoRate: number,
  calibration: number,
  quality: number,
  totalDecisions: number,
): TrustDimension[] {
  return [
    {
      name:    'decision_consistency',
      score:   Math.min(approvalRate * 0.6 + (1 - vetoRate) * 0.4, 1),
      trend:   totalDecisions > 10 ? (approvalRate > 0.70 ? 'rising' : 'stable') : 'stable',
      evidence: [`approval_rate: ${(approvalRate * 100).toFixed(0)}%`, `veto_rate: ${(vetoRate * 100).toFixed(0)}%`],
    },
    {
      name:    'outcome_calibration',
      score:   calibration,
      trend:   calibration > 0.65 ? 'rising' : calibration < 0.40 ? 'declining' : 'stable',
      evidence: [`interventions with positive outcome: ${(calibration * 100).toFixed(0)}%`],
    },
    {
      name:    'intervention_quality',
      score:   quality,
      trend:   quality > 0.65 ? 'rising' : 'stable',
      evidence: [`avg health delta from interventions: ${quality > 0.6 ? 'positive' : 'neutral'}`],
    },
    {
      name:    'strategic_engagement',
      score:   Math.min(totalDecisions * 0.05, 1),
      trend:   totalDecisions > 5 ? 'rising' : 'stable',
      evidence: [`total_decisions: ${totalDecisions}`],
    },
  ];
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class TrustEngine {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TRUST_SNAPSHOTS);
  }

  computeProfile(
    operatorId: string,
    swarmId: string,
    governance: HumanGovernanceLayer,
  ): OperatorTrustProfile {
    const operator = governance.getOperator(operatorId);
    if (!operator) {
      return {
        operator_id:           operatorId,
        overall_trust:         0.50,
        dimensions:            [],
        calibration_score:     0.50,
        strategic_alignment:   0.50,
        intervention_quality:  0.50,
        last_updated_ms:       Date.now(),
      };
    }

    const interventions = governance.getRecentInterventions(swarmId, 50);
    const opInterventions = interventions.filter(i => i.operator_id === operatorId);

    const calibration = computeCalibration(opInterventions);
    const quality     = computeInterventionQuality(opInterventions);
    const dimensions  = buildTrustDimensions(
      operator.approval_rate,
      operator.veto_rate,
      calibration,
      quality,
      operator.total_decisions,
    );

    const overallTrust = Math.min(
      dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length * 0.7 +
      operator.trust_score * 0.3,
      1,
    );

    const profile: OperatorTrustProfile = {
      operator_id:           operatorId,
      overall_trust:         parseFloat(overallTrust.toFixed(3)),
      dimensions,
      calibration_score:     parseFloat(calibration.toFixed(3)),
      strategic_alignment:   parseFloat((operator.approval_rate * 0.8 + (1 - operator.veto_rate) * 0.2).toFixed(3)),
      intervention_quality:  parseFloat(quality.toFixed(3)),
      last_updated_ms:       Date.now(),
    };

    // Persist snapshot
    this.db.prepare(`
      INSERT INTO trust_snapshots
        (snapshot_id, operator_id, swarm_id, overall_trust, calibration, alignment, quality, recorded_at_ms)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      uuidv4(), operatorId, swarmId,
      profile.overall_trust, profile.calibration_score,
      profile.strategic_alignment, profile.intervention_quality,
      Date.now(),
    );

    return profile;
  }

  generateReport(
    swarmId: string,
    governance: HumanGovernanceLayer,
  ): TrustReport {
    const operators = governance.getOperators();
    const profiles  = operators.map(op =>
      this.computeProfile(op.operator_id, swarmId, governance)
    );

    const avgTrust = profiles.length > 0
      ? profiles.reduce((s, p) => s + p.overall_trust, 0) / profiles.length
      : 0.50;

    // Trend from snapshots
    const recentSnapshots = this.db.prepare(
      `SELECT overall_trust FROM trust_snapshots WHERE swarm_id = ? ORDER BY recorded_at_ms DESC LIMIT 10`
    ).all(swarmId) as Array<{ overall_trust: number }>;

    let trend: TrustReport['trust_trend'] = 'stable';
    if (recentSnapshots.length >= 4) {
      const half1 = recentSnapshots.slice(0, Math.floor(recentSnapshots.length / 2));
      const half2 = recentSnapshots.slice(Math.floor(recentSnapshots.length / 2));
      const avg1 = half1.reduce((s, r) => s + r.overall_trust, 0) / half1.length;
      const avg2 = half2.reduce((s, r) => s + r.overall_trust, 0) / half2.length;
      if (avg1 - avg2 > 0.05) trend = 'growing';
      else if (avg2 - avg1 > 0.05) trend = 'eroding';
    }

    const legitimacy = Math.min(avgTrust * 0.60 + (operators.length > 1 ? 0.20 : 0) + 0.20, 1);
    const gaps: string[] = [];
    if (avgTrust < 0.50) gaps.push('Overall operator trust below healthy threshold — increase approval workflow transparency');
    if (profiles.some(p => p.calibration_score < 0.40)) gaps.push('Some operators showing poor intervention calibration — review override outcomes');
    if (operators.length < 2) gaps.push('Single operator — recommend adding oversight operator for checks and balances');

    const recommendations: string[] = [];
    if (trend === 'eroding') recommendations.push('Trust eroding — schedule governance review session with operators');
    if (legitimacy > 0.75) recommendations.push('High institutional legitimacy — suitable for expanding autonomous governance scope');

    return {
      swarm_id:            swarmId,
      generated_at_ms:     Date.now(),
      operators:           profiles,
      ecosystem_trust_level: parseFloat(avgTrust.toFixed(3)),
      trust_trend:         trend,
      legitimacy_score:    parseFloat(legitimacy.toFixed(3)),
      trust_gaps:          gaps,
      recommendations,
    };
  }
}
