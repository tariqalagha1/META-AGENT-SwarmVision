import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  SwarmHistoryRecord, OperationalTrend, TrendSample, SwarmHealthReport,
} from '../types';

// ─── Schema ───────────────────────────────────────────────────────────────────

function applyMemorySchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous  = NORMAL;

    CREATE TABLE IF NOT EXISTS swarm_history (
      swarm_id               TEXT    PRIMARY KEY,
      completed_at_ms        INTEGER NOT NULL,
      duration_ms            INTEGER NOT NULL,
      overall_health         REAL    NOT NULL,
      orchestration_efficiency REAL  NOT NULL,
      retry_count            INTEGER NOT NULL DEFAULT 0,
      anomaly_count          INTEGER NOT NULL DEFAULT 0,
      failure_count          INTEGER NOT NULL DEFAULT 0,
      quality_score          REAL,
      bottleneck_kinds       TEXT    NOT NULL DEFAULT '[]',
      incident_kinds         TEXT    NOT NULL DEFAULT '[]',
      agent_count            INTEGER NOT NULL DEFAULT 0,
      event_count            INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_history_completed
      ON swarm_history(completed_at_ms DESC);

    CREATE INDEX IF NOT EXISTS idx_history_health
      ON swarm_history(overall_health);
  `);
}

// ─── OperationalMemory ────────────────────────────────────────────────────────

export class OperationalMemory {
  private db: Database.Database;

  private stmtUpsert: Database.Statement;
  private stmtList:   Database.Statement;
  private stmtGet:    Database.Statement;

  constructor() {
    const dbPath = process.env.MEMORY_DB_PATH
      ?? path.join(process.cwd(), 'data', 'memory.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    applyMemorySchema(this.db);

    this.stmtUpsert = this.db.prepare(`
      INSERT OR REPLACE INTO swarm_history
        (swarm_id, completed_at_ms, duration_ms, overall_health,
         orchestration_efficiency, retry_count, anomaly_count,
         failure_count, quality_score, bottleneck_kinds, incident_kinds,
         agent_count, event_count)
      VALUES
        (@swarm_id, @completed_at_ms, @duration_ms, @overall_health,
         @orchestration_efficiency, @retry_count, @anomaly_count,
         @failure_count, @quality_score, @bottleneck_kinds, @incident_kinds,
         @agent_count, @event_count)
    `);

    this.stmtList = this.db.prepare(`
      SELECT * FROM swarm_history ORDER BY completed_at_ms DESC LIMIT ?
    `);

    this.stmtGet = this.db.prepare(
      `SELECT * FROM swarm_history WHERE swarm_id = ?`
    );
  }

  // ── Record ────────────────────────────────────────────────────────────────────

  record(health: SwarmHealthReport, qualityScore: number | null): void {
    const retryCount   = health.agent_scores.reduce((s, a) => s + a.retry_count,   0);
    const anomalyCount = Math.round((1 - health.anomaly_severity) * 100);
    const failureCount = health.agent_scores.reduce((s, a) => s + a.failure_count, 0);
    const agentCount   = health.agent_scores.length;
    const eventCount   = health.agent_scores.reduce((s, a) => s + a.event_count, 0);

    const bottleneckKinds = [...new Set(health.bottlenecks.map(b => b.kind))];
    const incidentKinds   = [...new Set(health.incidents.map(i => i.kind))];

    const row: SwarmHistoryRecord = {
      swarm_id:               health.swarm_id,
      completed_at_ms:        health.computed_at_ms,
      duration_ms:            health.duration_ms,
      overall_health:         health.overall_health,
      orchestration_efficiency: health.orchestration_efficiency,
      retry_count:            retryCount,
      anomaly_count:          anomalyCount,
      failure_count:          failureCount,
      quality_score:          qualityScore,
      bottleneck_kinds:       bottleneckKinds,
      incident_kinds:         incidentKinds,
      agent_count:            agentCount,
      event_count:            eventCount,
    };

    this.stmtUpsert.run({
      ...row,
      bottleneck_kinds: JSON.stringify(bottleneckKinds),
      incident_kinds:   JSON.stringify(incidentKinds),
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────────────

  getHistory(limit = 50): SwarmHistoryRecord[] {
    const rows = this.stmtList.all(limit) as (Omit<SwarmHistoryRecord, 'bottleneck_kinds' | 'incident_kinds'> & {
      bottleneck_kinds: string; incident_kinds: string;
    })[];
    return rows.map(r => ({
      ...r,
      bottleneck_kinds: parseStringArray(r.bottleneck_kinds),
      incident_kinds:   parseStringArray(r.incident_kinds),
    }));
  }

  getRecord(swarm_id: string): SwarmHistoryRecord | undefined {
    const r = this.stmtGet.get(swarm_id) as (Omit<SwarmHistoryRecord, 'bottleneck_kinds' | 'incident_kinds'> & {
      bottleneck_kinds: string; incident_kinds: string;
    }) | undefined;
    if (!r) return undefined;
    return {
      ...r,
      bottleneck_kinds: parseStringArray(r.bottleneck_kinds),
      incident_kinds:   parseStringArray(r.incident_kinds),
    };
  }

  // ── Trend analysis ────────────────────────────────────────────────────────────

  computeTrends(windowSize = 10): OperationalTrend[] {
    const history = this.getHistory(windowSize * 2);
    if (history.length < 4) return [];

    const trends: OperationalTrend[] = [];
    const metrics: (keyof SwarmHistoryRecord)[] = [
      'overall_health', 'orchestration_efficiency', 'retry_count',
      'anomaly_count', 'failure_count',
    ];

    for (const metric of metrics) {
      const samples: TrendSample[] = history
        .filter(r => r[metric] !== null && r[metric] !== undefined)
        .map(r => ({
          swarm_id:     r.swarm_id,
          value:        Number(r[metric]),
          timestamp_ms: r.completed_at_ms,
        }))
        .reverse();    // oldest first

      if (samples.length < 4) continue;

      const midpoint  = Math.floor(samples.length / 2);
      const priorAvg  = avg(samples.slice(0, midpoint).map(s => s.value));
      const recentAvg = avg(samples.slice(midpoint).map(s => s.value));

      const change_pct = priorAvg !== 0
        ? ((recentAvg - priorAvg) / Math.abs(priorAvg)) * 100
        : 0;

      // For error metrics, improvement is decrease; for health, improvement is increase
      const isErrorMetric = ['retry_count', 'anomaly_count', 'failure_count'].includes(metric);
      const direction = (isErrorMetric ? -change_pct : change_pct) > 5  ? 'improving'
                      : (isErrorMetric ? -change_pct : change_pct) < -5  ? 'degrading'
                      : 'stable';

      trends.push({ metric, samples, direction, change_pct });
    }

    return trends;
  }

  // ── Recurring pattern detection ───────────────────────────────────────────────

  findRecurringPatterns(): { pattern: string; frequency: number; last_seen_ms: number }[] {
    const history = this.getHistory(100);
    if (history.length < 5) return [];

    const patternCounts = new Map<string, { count: number; last_ms: number }>();

    for (const r of history) {
      for (const kind of r.bottleneck_kinds) {
        const key = `bottleneck:${kind}`;
        const existing = patternCounts.get(key);
        patternCounts.set(key, {
          count: (existing?.count ?? 0) + 1,
          last_ms: Math.max(existing?.last_ms ?? 0, r.completed_at_ms),
        });
      }
      for (const kind of r.incident_kinds) {
        const key = `incident:${kind}`;
        const existing = patternCounts.get(key);
        patternCounts.set(key, {
          count: (existing?.count ?? 0) + 1,
          last_ms: Math.max(existing?.last_ms ?? 0, r.completed_at_ms),
        });
      }
    }

    return [...patternCounts.entries()]
      .filter(([, v]) => v.count >= 2)
      .map(([pattern, v]) => ({
        pattern,
        frequency: v.count / history.length,
        last_seen_ms: v.last_ms,
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  close(): void {
    this.db.close();
  }
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}
