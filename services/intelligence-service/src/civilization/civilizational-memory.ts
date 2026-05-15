import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { SwarmHealthReport } from '../scoring/health-scorer';
import { GovernanceIdeology } from './types';
import {
  CivilizationEra, CivilizationEraKind, CivilizationPattern,
  CivilizationalMemoryState, AdaptationEpoch,
} from './types';

// ── Schema ────────────────────────────────────────────────────────────────────

const CREATE_ERAS = `
CREATE TABLE IF NOT EXISTS civilization_eras (
  era_id           TEXT PRIMARY KEY,
  swarm_id         TEXT NOT NULL,
  kind             TEXT NOT NULL,
  label            TEXT NOT NULL,
  started_at_ms    INTEGER NOT NULL,
  ended_at_ms      INTEGER,
  peak_health      REAL NOT NULL DEFAULT 0,
  trough_health    REAL NOT NULL DEFAULT 1,
  dominant_ideology TEXT NOT NULL,
  key_events_json  TEXT NOT NULL DEFAULT '[]',
  lessons_json     TEXT NOT NULL DEFAULT '[]'
)`;

const CREATE_PATTERNS = `
CREATE TABLE IF NOT EXISTS civilization_patterns (
  pattern_id        TEXT PRIMARY KEY,
  swarm_id          TEXT NOT NULL,
  kind              TEXT NOT NULL,
  description       TEXT NOT NULL,
  conditions_json   TEXT NOT NULL DEFAULT '[]',
  outcomes_json     TEXT NOT NULL DEFAULT '[]',
  recurrence_count  INTEGER NOT NULL DEFAULT 1,
  last_seen_ms      INTEGER NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.5
)`;

const CREATE_EPOCHS = `
CREATE TABLE IF NOT EXISTS adaptation_epochs (
  epoch_id              TEXT PRIMARY KEY,
  swarm_id              TEXT NOT NULL,
  trigger               TEXT NOT NULL,
  transformation_kind   TEXT NOT NULL,
  pre_health            REAL NOT NULL,
  post_health           REAL NOT NULL,
  duration_ms           INTEGER NOT NULL,
  strategies_json       TEXT NOT NULL DEFAULT '[]',
  recorded_at_ms        INTEGER NOT NULL
)`;

// ── Store ─────────────────────────────────────────────────────────────────────

export class CivilizationalMemoryStore {
  private db: Database.Database;
  private activeEras = new Map<string, CivilizationEra>();  // swarm_id → active era

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_ERAS);
    this.db.exec(CREATE_PATTERNS);
    this.db.exec(CREATE_EPOCHS);
  }

  // ── Era management ─────────────────────────────────────────────────────────

  recordHealthSnapshot(
    swarmId: string,
    health: SwarmHealthReport,
    ideology: GovernanceIdeology,
    keyEvent: string | null,
  ): void {
    const h = health.overall_health;
    const now = Date.now();

    let era = this.activeEras.get(swarmId);
    const eraKind = this.classifyEraKind(h, era);

    if (!era || era.kind !== eraKind) {
      if (era) {
        this.db.prepare(
          `UPDATE civilization_eras SET ended_at_ms = ? WHERE era_id = ?`
        ).run(now, era.era_id);
        this.extractLessons(era, swarmId);
      }

      const newEra: CivilizationEra = {
        era_id:            uuidv4(),
        swarm_id:          swarmId,
        kind:              eraKind,
        label:             this.eraLabel(eraKind, ideology),
        started_at_ms:     now,
        ended_at_ms:       null,
        peak_health:       h,
        trough_health:     h,
        dominant_ideology: ideology,
        key_events:        keyEvent ? [keyEvent] : [],
        lessons:           [],
      };

      this.db.prepare(`
        INSERT INTO civilization_eras
          (era_id, swarm_id, kind, label, started_at_ms, ended_at_ms,
           peak_health, trough_health, dominant_ideology, key_events_json, lessons_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        newEra.era_id, swarmId, newEra.kind, newEra.label,
        newEra.started_at_ms, null,
        newEra.peak_health, newEra.trough_health,
        newEra.dominant_ideology,
        JSON.stringify(newEra.key_events),
        JSON.stringify(newEra.lessons),
      );

      this.activeEras.set(swarmId, newEra);
      era = newEra;
    } else {
      // Update peak/trough
      if (h > era.peak_health)   era.peak_health   = h;
      if (h < era.trough_health) era.trough_health = h;
      if (keyEvent) era.key_events.push(keyEvent);

      this.db.prepare(`
        UPDATE civilization_eras
        SET peak_health = ?, trough_health = ?, key_events_json = ?
        WHERE era_id = ?
      `).run(era.peak_health, era.trough_health, JSON.stringify(era.key_events), era.era_id);

      this.activeEras.set(swarmId, era);
    }
  }

  private classifyEraKind(health: number, current: CivilizationEra | undefined): CivilizationEraKind {
    if (!current) return 'founding';
    const prev = (current.peak_health + current.trough_health) / 2;
    const delta = health - prev;
    if (health < 0.30) return 'crisis';
    if (health > 0.80 && delta > 0.05) return 'golden_age';
    if (delta < -0.12 && health < 0.55) return 'decline';
    if (delta > 0.15 && current.kind === 'crisis') return 'renaissance';
    if (current.kind === 'decline' && delta > 0.08) return 'reformation';
    if (current.kind === 'golden_age' && delta < -0.08) return 'transformation';
    if (current.kind === 'founding' && health > 0.60) return 'expansion';
    return current.kind;
  }

  private eraLabel(kind: CivilizationEraKind, ideology: GovernanceIdeology): string {
    const ideologyShort: Record<GovernanceIdeology, string> = {
      decentralized_autonomy:   'Autonomous',
      federated_republic:       'Federal',
      hierarchical_mandate:     'Imperial',
      consensus_democracy:      'Democratic',
      evolutionary_meritocracy: 'Meritocratic',
      adaptive_anarchy:         'Anarchic',
    };
    const eraLabels: Record<CivilizationEraKind, string> = {
      founding:       'First Epoch',
      expansion:      'Age of Expansion',
      crisis:         'Age of Crisis',
      reformation:    'The Reformation',
      golden_age:     'Golden Age',
      decline:        'Age of Decline',
      renaissance:    'The Renaissance',
      transformation: 'Great Transformation',
    };
    return `${ideologyShort[ideology]} ${eraLabels[kind]}`;
  }

  private extractLessons(era: CivilizationEra, swarmId: string): void {
    const lessons: string[] = [];
    const span = (era.ended_at_ms ?? Date.now()) - era.started_at_ms;

    if (era.kind === 'golden_age') {
      lessons.push(`${era.dominant_ideology} ideology sustained peak performance`);
      this.reinforcePattern(swarmId, 'successful',
        `Golden age under ${era.dominant_ideology}`,
        [`ideology:${era.dominant_ideology}`, `peak:${era.peak_health.toFixed(2)}`],
        ['high_health', 'sustainable_governance'],
      );
    }
    if (era.kind === 'crisis') {
      lessons.push(`Crisis emerged: health dropped to ${era.trough_health.toFixed(2)}`);
      this.reinforcePattern(swarmId, 'failed',
        `Governance crisis under ${era.dominant_ideology}`,
        [`ideology:${era.dominant_ideology}`, `trough:${era.trough_health.toFixed(2)}`],
        ['health_collapse', 'governance_failure'],
      );
    }
    if (era.kind === 'renaissance' && span > 10_000) {
      lessons.push(`Recovery took ${(span / 1000).toFixed(0)}s — resilience pattern confirmed`);
    }

    this.db.prepare(
      `UPDATE civilization_eras SET lessons_json = ? WHERE era_id = ?`
    ).run(JSON.stringify(lessons), era.era_id);
  }

  private reinforcePattern(
    swarmId: string,
    kind: 'successful' | 'failed' | 'transitional',
    description: string,
    conditions: string[],
    outcomes: string[],
  ): void {
    const now = Date.now();
    const existing = this.db.prepare(
      `SELECT pattern_id, recurrence_count FROM civilization_patterns
       WHERE swarm_id = ? AND description = ? AND kind = ?`
    ).get(swarmId, description, kind) as { pattern_id: string; recurrence_count: number } | undefined;

    if (existing) {
      this.db.prepare(
        `UPDATE civilization_patterns
         SET recurrence_count = recurrence_count + 1,
             last_seen_ms = ?,
             confidence = MIN(confidence + 0.08, 1.0)
         WHERE pattern_id = ?`
      ).run(now, existing.pattern_id);
    } else {
      this.db.prepare(`
        INSERT INTO civilization_patterns
          (pattern_id, swarm_id, kind, description, conditions_json, outcomes_json,
           recurrence_count, last_seen_ms, confidence)
        VALUES (?,?,?,?,?,?,1,?,0.5)
      `).run(uuidv4(), swarmId, kind, description,
             JSON.stringify(conditions), JSON.stringify(outcomes), now);
    }
  }

  recordAdaptationEpoch(
    swarmId: string,
    trigger: string,
    transformationKind: string,
    preHealth: number,
    postHealth: number,
    durationMs: number,
    strategies: string[],
  ): void {
    this.db.prepare(`
      INSERT INTO adaptation_epochs
        (epoch_id, swarm_id, trigger, transformation_kind, pre_health, post_health,
         duration_ms, strategies_json, recorded_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      uuidv4(), swarmId, trigger, transformationKind,
      preHealth, postHealth, durationMs,
      JSON.stringify(strategies), Date.now(),
    );
  }

  getMemoryState(swarmId: string): CivilizationalMemoryState {
    const eras = (this.db.prepare(
      `SELECT * FROM civilization_eras WHERE swarm_id = ? ORDER BY started_at_ms ASC`
    ).all(swarmId) as Array<Record<string, unknown>>).map(r => ({
      era_id:            r.era_id as string,
      swarm_id:          r.swarm_id as string,
      kind:              r.kind as CivilizationEraKind,
      label:             r.label as string,
      started_at_ms:     r.started_at_ms as number,
      ended_at_ms:       r.ended_at_ms as number | null,
      peak_health:       r.peak_health as number,
      trough_health:     r.trough_health as number,
      dominant_ideology: r.dominant_ideology as GovernanceIdeology,
      key_events:        JSON.parse(r.key_events_json as string),
      lessons:           JSON.parse(r.lessons_json as string),
    }));

    const patterns = (this.db.prepare(
      `SELECT * FROM civilization_patterns WHERE swarm_id = ? ORDER BY confidence DESC`
    ).all(swarmId) as Array<Record<string, unknown>>).map(r => ({
      pattern_id:       r.pattern_id as string,
      kind:             r.kind as 'successful' | 'failed' | 'transitional',
      description:      r.description as string,
      conditions:       JSON.parse(r.conditions_json as string),
      outcomes:         JSON.parse(r.outcomes_json as string),
      recurrence_count: r.recurrence_count as number,
      last_seen_ms:     r.last_seen_ms as number,
      confidence:       r.confidence as number,
    }));

    const epochs = (this.db.prepare(
      `SELECT * FROM adaptation_epochs WHERE swarm_id = ? ORDER BY recorded_at_ms ASC`
    ).all(swarmId) as Array<Record<string, unknown>>).map(r => ({
      epoch_id:            r.epoch_id as string,
      trigger:             r.trigger as string,
      transformation_kind: r.transformation_kind as string,
      pre_health:          r.pre_health as number,
      post_health:         r.post_health as number,
      duration_ms:         r.duration_ms as number,
      strategies_applied:  JSON.parse(r.strategies_json as string),
    }));

    const successPatterns = patterns.filter(p => p.kind === 'successful');
    const failedPatterns  = patterns.filter(p => p.kind === 'failed');

    // Civilizational wisdom = f(era count, pattern count, epoch count, avg confidence)
    const avgConf = patterns.length > 0
      ? patterns.reduce((s, p) => s + p.confidence, 0) / patterns.length
      : 0;
    const wisdom = Math.min(
      (eras.length * 0.08 + patterns.length * 0.04 + epochs.length * 0.06) * avgConf,
      1,
    );

    const currentEra = eras.find(e => e.ended_at_ms === null) ?? eras[eras.length - 1] ?? null;

    return {
      swarm_id:               swarmId,
      total_eras:             eras.length,
      current_era:            currentEra,
      era_history:            eras,
      successful_patterns:    successPatterns,
      failed_patterns:        failedPatterns,
      adaptation_epochs:      epochs,
      civilizational_wisdom:  wisdom,
    };
  }
}
