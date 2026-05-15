import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  PolicyRecord, ConstitutionalAmendment, GovernanceDisputeRecord,
  ConstitutionalMemoryState,
} from './types';

// ── Schema ────────────────────────────────────────────────────────────────────

const CREATE_POLICIES = `
CREATE TABLE IF NOT EXISTS policies (
  policy_id      TEXT PRIMARY KEY,
  swarm_id       TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  kind           TEXT NOT NULL,
  enacted_by     TEXT NOT NULL,
  enacted_at_ms  INTEGER NOT NULL,
  supersedes_id  TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  impact_score   REAL NOT NULL DEFAULT 0
)`;

const CREATE_AMENDMENTS = `
CREATE TABLE IF NOT EXISTS constitutional_amendments (
  amendment_id   TEXT PRIMARY KEY,
  swarm_id       TEXT NOT NULL,
  proposed_by    TEXT NOT NULL,
  rationale      TEXT NOT NULL,
  old_rule       TEXT NOT NULL,
  new_rule       TEXT NOT NULL,
  approved_by_json TEXT NOT NULL DEFAULT '[]',
  enacted_at_ms  INTEGER NOT NULL,
  health_impact  REAL
)`;

const CREATE_DISPUTES = `
CREATE TABLE IF NOT EXISTS governance_disputes (
  dispute_id     TEXT PRIMARY KEY,
  swarm_id       TEXT NOT NULL,
  kind           TEXT NOT NULL,
  parties_json   TEXT NOT NULL DEFAULT '[]',
  summary        TEXT NOT NULL,
  resolution     TEXT,
  resolved_at_ms INTEGER,
  precedent_set  INTEGER NOT NULL DEFAULT 0
)`;

// ── Store ─────────────────────────────────────────────────────────────────────

export class ConstitutionalMemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_POLICIES);
    this.db.exec(CREATE_AMENDMENTS);
    this.db.exec(CREATE_DISPUTES);
  }

  // ── Policies ───────────────────────────────────────────────────────────────

  enactPolicy(
    swarmId: string,
    title: string,
    body: string,
    kind: PolicyRecord['kind'],
    enactedBy: string,
    supersedesId: string | null = null,
  ): PolicyRecord {
    const now = Date.now();

    // Deactivate superseded policy
    if (supersedesId) {
      this.db.prepare(`UPDATE policies SET active = 0 WHERE policy_id = ?`).run(supersedesId);
    }

    const p: PolicyRecord = {
      policy_id:    uuidv4(),
      swarm_id:     swarmId,
      title,
      body,
      kind,
      enacted_by:   enactedBy,
      enacted_at_ms: now,
      supersedes_id: supersedesId,
      active:       true,
      impact_score: 0,
    };

    this.db.prepare(`
      INSERT INTO policies
        (policy_id, swarm_id, title, body, kind, enacted_by, enacted_at_ms, supersedes_id, active, impact_score)
      VALUES (?,?,?,?,?,?,?,?,1,0)
    `).run(p.policy_id, p.swarm_id, p.title, p.body, p.kind, p.enacted_by, p.enacted_at_ms, p.supersedes_id);

    return p;
  }

  updatePolicyImpact(policyId: string, impactScore: number): void {
    this.db.prepare(`UPDATE policies SET impact_score = ? WHERE policy_id = ?`).run(impactScore, policyId);
  }

  getActivePolicies(swarmId: string): PolicyRecord[] {
    return this.db.prepare(
      `SELECT * FROM policies WHERE swarm_id = ? AND active = 1 ORDER BY enacted_at_ms DESC`
    ).all(swarmId) as unknown as PolicyRecord[];
  }

  // ── Amendments ─────────────────────────────────────────────────────────────

  proposeAmendment(
    swarmId: string,
    proposedBy: string,
    rationale: string,
    oldRule: string,
    newRule: string,
    approvedBy: string[],
  ): ConstitutionalAmendment {
    const amendment: ConstitutionalAmendment = {
      amendment_id: uuidv4(),
      swarm_id:     swarmId,
      proposed_by:  proposedBy,
      rationale,
      old_rule:     oldRule,
      new_rule:     newRule,
      approved_by:  approvedBy,
      enacted_at_ms: Date.now(),
      health_impact: null,
    };

    this.db.prepare(`
      INSERT INTO constitutional_amendments
        (amendment_id, swarm_id, proposed_by, rationale, old_rule, new_rule, approved_by_json, enacted_at_ms)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      amendment.amendment_id, amendment.swarm_id, amendment.proposed_by,
      amendment.rationale, amendment.old_rule, amendment.new_rule,
      JSON.stringify(amendment.approved_by), amendment.enacted_at_ms,
    );

    return amendment;
  }

  // ── Disputes ───────────────────────────────────────────────────────────────

  recordDispute(
    swarmId: string,
    kind: GovernanceDisputeRecord['kind'],
    parties: string[],
    summary: string,
  ): GovernanceDisputeRecord {
    const dispute: GovernanceDisputeRecord = {
      dispute_id:     uuidv4(),
      swarm_id:       swarmId,
      kind,
      parties,
      summary,
      resolution:     null,
      resolved_at_ms: null,
      precedent_set:  false,
    };

    this.db.prepare(`
      INSERT INTO governance_disputes
        (dispute_id, swarm_id, kind, parties_json, summary, precedent_set)
      VALUES (?,?,?,?,?,0)
    `).run(dispute.dispute_id, dispute.swarm_id, dispute.kind, JSON.stringify(dispute.parties), dispute.summary);

    return dispute;
  }

  resolveDispute(
    disputeId: string,
    resolution: string,
    setsPrecedent: boolean,
  ): void {
    this.db.prepare(`
      UPDATE governance_disputes
      SET resolution = ?, resolved_at_ms = ?, precedent_set = ?
      WHERE dispute_id = ?
    `).run(resolution, Date.now(), setsPrecedent ? 1 : 0, disputeId);
  }

  // ── State ──────────────────────────────────────────────────────────────────

  getState(swarmId: string): ConstitutionalMemoryState {
    const policies = this.getActivePolicies(swarmId);
    const amendments = (this.db.prepare(
      `SELECT * FROM constitutional_amendments WHERE swarm_id = ? ORDER BY enacted_at_ms DESC`
    ).all(swarmId) as Array<Record<string, unknown>>).map(r => ({
      ...r,
      approved_by: JSON.parse(r.approved_by_json as string),
    })) as unknown as ConstitutionalAmendment[];

    const disputes = (this.db.prepare(
      `SELECT * FROM governance_disputes WHERE swarm_id = ? ORDER BY resolved_at_ms DESC`
    ).all(swarmId) as Array<Record<string, unknown>>).map(r => ({
      ...r,
      parties: JSON.parse(r.parties_json as string),
      precedent_set: (r.precedent_set as number) === 1,
    })) as unknown as GovernanceDisputeRecord[];

    const precedentCount = disputes.filter(d => d.precedent_set).length;
    const oldestPolicy = policies.length > 0
      ? Math.min(...policies.map(p => p.enacted_at_ms))
      : Date.now();

    const totalPolicies = (this.db.prepare(
      `SELECT COUNT(*) as n FROM policies WHERE swarm_id = ?`
    ).get(swarmId) as { n: number }).n;

    const avgImpact = policies.length > 0
      ? policies.reduce((s, p) => s + p.impact_score, 0) / policies.length
      : 0;

    const stability = Math.min(
      (policies.length * 0.05 + precedentCount * 0.08 + avgImpact * 0.40 + (amendments.length > 0 ? 0.20 : 0)),
      1,
    );

    return {
      swarm_id:                swarmId,
      total_policies:          totalPolicies,
      active_policies:         policies,
      amendments,
      disputes,
      precedent_count:         precedentCount,
      constitutional_stability: stability,
      doctrine_age_ms:         Date.now() - oldestPolicy,
    };
  }
}
