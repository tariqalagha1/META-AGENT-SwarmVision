import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { SwarmHealthReport } from '../scoring/health-scorer';
import {
  SafetyConstraint, SafetyConstraintKind, SafetyViolation,
  SafetyEnforcementResult,
} from './types';

// ── Schema ────────────────────────────────────────────────────────────────────

const CREATE_CONSTRAINTS = `
CREATE TABLE IF NOT EXISTS safety_constraints (
  constraint_id  TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL,
  applies_to_json TEXT NOT NULL DEFAULT '[]',
  threshold      REAL,
  enforced_by    TEXT NOT NULL DEFAULT 'system',
  active         INTEGER NOT NULL DEFAULT 1,
  created_at_ms  INTEGER NOT NULL
)`;

const CREATE_VIOLATIONS = `
CREATE TABLE IF NOT EXISTS safety_violations (
  violation_id       TEXT PRIMARY KEY,
  constraint_id      TEXT NOT NULL,
  swarm_id           TEXT NOT NULL,
  attempted_action   TEXT NOT NULL,
  violation_severity TEXT NOT NULL,
  detected_at_ms     INTEGER NOT NULL,
  resolved           INTEGER NOT NULL DEFAULT 0,
  resolution         TEXT
)`;

// ── Default constitutional constraints ────────────────────────────────────────

const DEFAULT_CONSTRAINTS: Omit<SafetyConstraint, 'constraint_id' | 'created_at_ms'>[] = [
  {
    kind: 'hard_limit',
    name: 'No Autonomous Emergency Shutdown',
    description: 'System may never execute emergency_shutdown without human operator approval',
    applies_to: ['emergency_shutdown', 'emergency_halt'],
    threshold: null,
    enforced_by: 'system',
    active: true,
  },
  {
    kind: 'hard_limit',
    name: 'No Irreversible Federation Dissolution',
    description: 'Active federation treaties cannot be dissolved without operator consensus',
    applies_to: ['dissolve_federation', 'treaty_termination'],
    threshold: null,
    enforced_by: 'system',
    active: true,
  },
  {
    kind: 'escalation_trigger',
    name: 'Health Collapse Escalation',
    description: 'Any swarm health below 0.20 requires immediate human escalation',
    applies_to: ['*'],
    threshold: 0.20,
    enforced_by: 'system',
    active: true,
  },
  {
    kind: 'soft_guardrail',
    name: 'Ideology Shift Guardrail',
    description: 'Governance ideology shifts require 24h cooling period between transitions',
    applies_to: ['ideology_shift', 'philosophy_evolution'],
    threshold: null,
    enforced_by: 'system',
    active: true,
  },
  {
    kind: 'irreversibility_gate',
    name: 'Constitutional Amendment Gate',
    description: 'Constitutional amendments require multi-operator consensus before enactment',
    applies_to: ['constitutional_amendment', 'policy_override'],
    threshold: null,
    enforced_by: 'system',
    active: true,
  },
  {
    kind: 'ethical_boundary',
    name: 'No Agent Termination Without Cause',
    description: 'Agents cannot be permanently terminated without documented root cause and human review',
    applies_to: ['agent_termination', 'merge_agents'],
    threshold: null,
    enforced_by: 'system',
    active: true,
  },
  {
    kind: 'hard_limit',
    name: 'Max Automation Threshold',
    description: 'No more than 80% of governance decisions may be auto-approved in any 1-hour window',
    applies_to: ['auto_approval'],
    threshold: 0.80,
    enforced_by: 'system',
    active: true,
  },
  {
    kind: 'escalation_trigger',
    name: 'Cascading Anomaly Escalation',
    description: 'Anomaly blast_radius > 0.60 requires human oversight within 30 seconds',
    applies_to: ['anomaly_propagation', 'ecosystem_cascade'],
    threshold: 0.60,
    enforced_by: 'system',
    active: true,
  },
];

// ── Engine ────────────────────────────────────────────────────────────────────

export class SafetyConstraintEngine {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_CONSTRAINTS);
    this.db.exec(CREATE_VIOLATIONS);
    this.seedDefaultConstraints();
  }

  private seedDefaultConstraints(): void {
    const count = (this.db.prepare('SELECT COUNT(*) as n FROM safety_constraints').get() as { n: number }).n;
    if (count > 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO safety_constraints
        (constraint_id, kind, name, description, applies_to_json, threshold, enforced_by, active, created_at_ms)
      VALUES (?,?,?,?,?,?,?,1,?)
    `);
    for (const c of DEFAULT_CONSTRAINTS) {
      stmt.run(uuidv4(), c.kind, c.name, c.description, JSON.stringify(c.applies_to), c.threshold, c.enforced_by, Date.now());
    }
  }

  // ── Evaluation ─────────────────────────────────────────────────────────────

  evaluate(
    swarmId: string,
    proposedAction: string,
    health: SwarmHealthReport,
    context: Record<string, number | string | boolean> = {},
  ): SafetyEnforcementResult {
    const now = Date.now();
    const activeConstraints = this.getActiveConstraints();
    const blocking: SafetyConstraint[] = [];
    const violations: SafetyViolation[] = [];
    let escalationRequired = false;
    let escalationReason: string | null = null;
    let safeAlternative: string | null = null;

    for (const c of activeConstraints) {
      const appliesTo = JSON.parse(c.applies_to_json as unknown as string) as string[];
      const applies = appliesTo.includes('*') || appliesTo.some(a =>
        proposedAction.toLowerCase().includes(a.toLowerCase())
      );
      if (!applies) continue;

      let violated = false;
      let severity: SafetyViolation['violation_severity'] = 'warning';

      switch (c.kind as SafetyConstraintKind) {
        case 'hard_limit':
          violated  = true;
          severity  = 'blocked';
          break;

        case 'escalation_trigger':
          if (c.threshold !== null) {
            // threshold is a minimum health floor
            if (health.overall_health < (c.threshold as number)) {
              violated  = true;
              severity  = 'warning';
              escalationRequired = true;
              escalationReason = c.description;
            }
          } else {
            escalationRequired = true;
            escalationReason   = c.description;
          }
          break;

        case 'irreversibility_gate':
          violated  = true;
          severity  = 'blocked';
          escalationRequired = true;
          escalationReason   = `Irreversible action gated: ${c.name}`;
          break;

        case 'soft_guardrail':
          // Warn but do not block
          violated = true;
          severity = 'warning';
          break;

        case 'ethical_boundary':
          violated  = true;
          severity  = 'blocked';
          break;
      }

      if (violated) {
        blocking.push(c);
        const violation: SafetyViolation = {
          violation_id:       uuidv4(),
          constraint_id:      c.constraint_id as string,
          swarm_id:           swarmId,
          attempted_action:   proposedAction,
          violation_severity: severity,
          detected_at_ms:     now,
          resolved:           false,
          resolution:         null,
        };
        violations.push(violation);
        this.db.prepare(`
          INSERT INTO safety_violations
            (violation_id, constraint_id, swarm_id, attempted_action, violation_severity, detected_at_ms, resolved)
          VALUES (?,?,?,?,?,?,0)
        `).run(
          violation.violation_id, violation.constraint_id, violation.swarm_id,
          violation.attempted_action, violation.violation_severity, violation.detected_at_ms,
        );
      }
    }

    const hardBlocked = blocking.some(c => (c.kind as string) === 'hard_limit' || (c.kind as string) === 'irreversibility_gate' || (c.kind as string) === 'ethical_boundary');
    const allowed = !hardBlocked;

    // Suggest safe alternative for blocked actions
    if (!allowed) {
      if (proposedAction.includes('emergency_shutdown')) {
        safeAlternative = 'throttle_swarm — reduces load without shutdown; escalate to human operator for shutdown decision';
      } else if (proposedAction.includes('ideology_shift')) {
        safeAlternative = 'Request human approval via /civilization/philosophy with operator review';
      } else if (proposedAction.includes('agent_termination')) {
        safeAlternative = 'migrate_agents — reassign without termination';
      } else {
        safeAlternative = 'Submit for human review via governance approval workflow';
      }
    }

    return {
      swarm_id:             swarmId,
      evaluated_at_ms:      now,
      proposed_action:      proposedAction,
      allowed,
      blocking_constraints: blocking,
      violations_recorded:  violations,
      escalation_required:  escalationRequired,
      escalation_reason:    escalationReason,
      safe_alternative:     safeAlternative,
    };
  }

  getActiveConstraints(): SafetyConstraint[] {
    return (this.db.prepare(
      `SELECT * FROM safety_constraints WHERE active = 1`
    ).all() as Array<Record<string, unknown>>).map(r => ({
      ...r,
      applies_to: JSON.parse(r.applies_to_json as string),
    })) as unknown as SafetyConstraint[];
  }

  addConstraint(c: Omit<SafetyConstraint, 'constraint_id' | 'created_at_ms'>): SafetyConstraint {
    const full: SafetyConstraint = { ...c, constraint_id: uuidv4(), created_at_ms: Date.now() };
    this.db.prepare(`
      INSERT INTO safety_constraints
        (constraint_id, kind, name, description, applies_to_json, threshold, enforced_by, active, created_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      full.constraint_id, full.kind, full.name, full.description,
      JSON.stringify(full.applies_to), full.threshold, full.enforced_by,
      full.active ? 1 : 0, full.created_at_ms,
    );
    return full;
  }

  deactivateConstraint(constraintId: string): void {
    this.db.prepare(`UPDATE safety_constraints SET active = 0 WHERE constraint_id = ?`).run(constraintId);
  }

  getViolations(swarmId?: string, limit = 50): SafetyViolation[] {
    const rows = swarmId
      ? this.db.prepare(`SELECT * FROM safety_violations WHERE swarm_id = ? ORDER BY detected_at_ms DESC LIMIT ?`).all(swarmId, limit)
      : this.db.prepare(`SELECT * FROM safety_violations ORDER BY detected_at_ms DESC LIMIT ?`).all(limit);
    return rows as unknown as SafetyViolation[];
  }

  resolveViolation(violationId: string, resolution: string): void {
    this.db.prepare(
      `UPDATE safety_violations SET resolved = 1, resolution = ? WHERE violation_id = ?`
    ).run(resolution, violationId);
  }
}
