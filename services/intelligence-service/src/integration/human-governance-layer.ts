import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  HumanOperator, HumanRole, GovernanceApprovalRequest, ApprovalStatus,
  OperatorConsensus, HumanInterventionRecord,
} from './types';
import { SwarmHealthReport } from '../scoring/health-scorer';

// ── Schema ────────────────────────────────────────────────────────────────────

const CREATE_OPERATORS = `
CREATE TABLE IF NOT EXISTS human_operators (
  operator_id    TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL,
  trust_score    REAL NOT NULL DEFAULT 0.70,
  active_since_ms INTEGER NOT NULL,
  total_decisions INTEGER NOT NULL DEFAULT 0,
  approval_rate  REAL NOT NULL DEFAULT 0.80,
  veto_rate      REAL NOT NULL DEFAULT 0.05
)`;

const CREATE_APPROVALS = `
CREATE TABLE IF NOT EXISTS governance_approvals (
  request_id     TEXT PRIMARY KEY,
  swarm_id       TEXT NOT NULL,
  action_kind    TEXT NOT NULL,
  proposed_by    TEXT NOT NULL,
  rationale      TEXT NOT NULL,
  risk_level     TEXT NOT NULL,
  requires_human INTEGER NOT NULL DEFAULT 1,
  expires_at_ms  INTEGER NOT NULL,
  created_at_ms  INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  reviewed_by    TEXT,
  review_note    TEXT,
  review_ms      INTEGER
)`;

const CREATE_INTERVENTIONS = `
CREATE TABLE IF NOT EXISTS human_interventions (
  intervention_id     TEXT PRIMARY KEY,
  operator_id         TEXT NOT NULL,
  swarm_id            TEXT NOT NULL,
  kind                TEXT NOT NULL,
  target_action       TEXT NOT NULL,
  reason              TEXT NOT NULL,
  outcome_health_delta REAL,
  occurred_at_ms      INTEGER NOT NULL
)`;

// ── Risk classification ────────────────────────────────────────────────────────

function classifyRisk(
  actionKind: string,
  health: SwarmHealthReport,
): GovernanceApprovalRequest['risk_level'] {
  const critical = ['emergency_shutdown', 'emergency_halt', 'override_philosophy', 'dissolve_institution'];
  const high     = ['isolate_swarm', 'federate_swarms', 'constitutional_amendment', 'ideology_shift'];
  const medium   = ['rebalance_load', 'throttle_swarm', 'institution_formation', 'migrate_agents'];

  if (critical.some(k => actionKind.includes(k))) return 'critical';
  if (high.some(k => actionKind.includes(k)))     return 'high';
  if (medium.some(k => actionKind.includes(k)))   return 'medium';
  if (health.overall_health < 0.35)               return 'high';
  return 'low';
}

function requiresHuman(risk: GovernanceApprovalRequest['risk_level']): boolean {
  return risk === 'critical' || risk === 'high';
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class HumanGovernanceLayer {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_OPERATORS);
    this.db.exec(CREATE_APPROVALS);
    this.db.exec(CREATE_INTERVENTIONS);
    this.seedDefaultOperators();
  }

  private seedDefaultOperators(): void {
    const count = (this.db.prepare('SELECT COUNT(*) as n FROM human_operators').get() as { n: number }).n;
    if (count > 0) return;

    const defaults: Array<[string, string, HumanRole, number]> = [
      ['op-executive-01', 'Chief AI Officer', 'executive', 0.90],
      ['op-operator-01',  'Platform Operator', 'operator', 0.75],
      ['op-auditor-01',   'Compliance Auditor', 'auditor', 0.80],
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO human_operators
        (operator_id, name, role, trust_score, active_since_ms, total_decisions, approval_rate, veto_rate)
      VALUES (?,?,?,?,?,0,0.80,0.05)
    `);
    for (const [id, name, role, trust] of defaults) {
      stmt.run(id, name, role, trust, Date.now());
    }
  }

  // ── Approval workflow ──────────────────────────────────────────────────────

  requestApproval(
    swarmId: string,
    actionKind: string,
    rationale: string,
    proposedBy: string,
    health: SwarmHealthReport,
    ttlMs = 120_000,
  ): GovernanceApprovalRequest {
    const now  = Date.now();
    const risk = classifyRisk(actionKind, health);
    const req: GovernanceApprovalRequest = {
      request_id:    uuidv4(),
      swarm_id:      swarmId,
      action_kind:   actionKind,
      proposed_by:   proposedBy,
      rationale,
      risk_level:    risk,
      requires_human: requiresHuman(risk),
      expires_at_ms: now + ttlMs,
      created_at_ms: now,
      status:        requiresHuman(risk) ? 'pending' : 'auto_approved',
      reviewed_by:   requiresHuman(risk) ? null : 'system',
      review_note:   requiresHuman(risk) ? null : 'Auto-approved: risk level within autonomous threshold',
      review_ms:     requiresHuman(risk) ? null : now,
    };

    this.db.prepare(`
      INSERT INTO governance_approvals
        (request_id, swarm_id, action_kind, proposed_by, rationale, risk_level,
         requires_human, expires_at_ms, created_at_ms, status, reviewed_by, review_note, review_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.request_id, req.swarm_id, req.action_kind, req.proposed_by,
      req.rationale, req.risk_level, req.requires_human ? 1 : 0,
      req.expires_at_ms, req.created_at_ms, req.status,
      req.reviewed_by, req.review_note, req.review_ms,
    );

    return req;
  }

  reviewApproval(
    requestId: string,
    operatorId: string,
    decision: 'approved' | 'vetoed',
    note: string,
  ): GovernanceApprovalRequest | null {
    const now = Date.now();
    const row = this.db.prepare(
      'SELECT * FROM governance_approvals WHERE request_id = ?'
    ).get(requestId) as Record<string, unknown> | undefined;
    if (!row) return null;

    this.db.prepare(`
      UPDATE governance_approvals
      SET status = ?, reviewed_by = ?, review_note = ?, review_ms = ?
      WHERE request_id = ?
    `).run(decision, operatorId, note, now, requestId);

    // Update operator stats
    this.db.prepare(`
      UPDATE human_operators
      SET total_decisions = total_decisions + 1,
          approval_rate = (approval_rate * total_decisions + ?) / (total_decisions + 1)
      WHERE operator_id = ?
    `).run(decision === 'approved' ? 1 : 0, operatorId);

    return { ...row, status: decision as ApprovalStatus, reviewed_by: operatorId, review_note: note, review_ms: now } as unknown as GovernanceApprovalRequest;
  }

  getPendingApprovals(swarmId?: string): GovernanceApprovalRequest[] {
    const now = Date.now();
    const rows = swarmId
      ? this.db.prepare(
          `SELECT * FROM governance_approvals WHERE status = 'pending' AND swarm_id = ? AND expires_at_ms > ?`
        ).all(swarmId, now)
      : this.db.prepare(
          `SELECT * FROM governance_approvals WHERE status = 'pending' AND expires_at_ms > ?`
        ).all(now);
    return rows as unknown as GovernanceApprovalRequest[];
  }

  // ── Interventions ──────────────────────────────────────────────────────────

  recordIntervention(
    operatorId: string,
    swarmId: string,
    kind: HumanInterventionRecord['kind'],
    targetAction: string,
    reason: string,
  ): HumanInterventionRecord {
    const rec: HumanInterventionRecord = {
      intervention_id:    uuidv4(),
      operator_id:        operatorId,
      swarm_id:           swarmId,
      kind,
      target_action:      targetAction,
      reason,
      outcome_health_delta: null,
      occurred_at_ms:     Date.now(),
    };

    this.db.prepare(`
      INSERT INTO human_interventions
        (intervention_id, operator_id, swarm_id, kind, target_action, reason, outcome_health_delta, occurred_at_ms)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      rec.intervention_id, rec.operator_id, rec.swarm_id, rec.kind,
      rec.target_action, rec.reason, null, rec.occurred_at_ms,
    );

    return rec;
  }

  updateInterventionOutcome(interventionId: string, healthDelta: number): void {
    this.db.prepare(
      `UPDATE human_interventions SET outcome_health_delta = ? WHERE intervention_id = ?`
    ).run(healthDelta, interventionId);
  }

  // ── Operators ──────────────────────────────────────────────────────────────

  getOperators(): HumanOperator[] {
    return this.db.prepare('SELECT * FROM human_operators').all() as unknown as HumanOperator[];
  }

  getOperator(operatorId: string): HumanOperator | null {
    return (this.db.prepare(
      'SELECT * FROM human_operators WHERE operator_id = ?'
    ).get(operatorId) ?? null) as HumanOperator | null;
  }

  upsertOperator(op: Omit<HumanOperator, 'total_decisions'>): void {
    this.db.prepare(`
      INSERT INTO human_operators
        (operator_id, name, role, trust_score, active_since_ms, total_decisions, approval_rate, veto_rate)
      VALUES (?,?,?,?,?,0,?,?)
      ON CONFLICT(operator_id) DO UPDATE SET
        name = excluded.name, role = excluded.role,
        trust_score = excluded.trust_score
    `).run(op.operator_id, op.name, op.role, op.trust_score, op.active_since_ms, op.approval_rate, op.veto_rate);
  }

  // ── Consensus ─────────────────────────────────────────────────────────────

  computeConsensus(requestId: string, requiredApprovals = 2): OperatorConsensus {
    const approvals = (this.db.prepare(
      `SELECT reviewed_by, status FROM governance_approvals WHERE request_id = ? AND status IN ('approved','vetoed')`
    ).all(requestId) as Array<{ reviewed_by: string; status: string }>);

    const approved = approvals.filter(r => r.status === 'approved').map(r => r.reviewed_by);
    const vetoed   = approvals.filter(r => r.status === 'vetoed').map(r => r.reviewed_by);

    const consensusKind: OperatorConsensus['consensus_kind'] =
      vetoed.length > 0                         ? 'vetoed' :
      approved.length >= requiredApprovals       ? 'approved' :
      approved.length > 0 && vetoed.length > 0  ? 'split' : 'pending';

    return {
      request_id:         requestId,
      required_approvals: requiredApprovals,
      received_approvals: approved,
      received_vetoes:    vetoed,
      consensus_reached:  consensusKind === 'approved' || consensusKind === 'vetoed',
      consensus_kind:     consensusKind,
      resolved_at_ms:     consensusKind !== 'pending' ? Date.now() : null,
    };
  }

  getRecentInterventions(swarmId: string, limit = 20): HumanInterventionRecord[] {
    return this.db.prepare(
      `SELECT * FROM human_interventions WHERE swarm_id = ? ORDER BY occurred_at_ms DESC LIMIT ?`
    ).all(swarmId, limit) as unknown as HumanInterventionRecord[];
  }
}
