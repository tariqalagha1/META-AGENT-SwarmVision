import Database from 'better-sqlite3';
import {
  StoredEvent, SwarmSession, ReplaySession, ReplayBookmark,
  TimelineRequest, SwarmMetricsSummary, AgentStateChange,
} from '../types';

// ─── Prepared statement cache ─────────────────────────────────────────────────

export class ReplayRepository {
  private db: Database.Database;

  // StoredEvent stmts
  private stmtInsertEvent:         Database.Statement;
  private stmtGetEvent:            Database.Statement;
  private stmtQueryTimeline:       Database.Statement;
  private stmtCountTimeline:       Database.Statement;

  // SwarmSession stmts
  private stmtUpsertSession:       Database.Statement;
  private stmtGetSession:          Database.Statement;
  private stmtListSessions:        Database.Statement;
  private stmtUpdateSessionCounts: Database.Statement;
  private stmtFinalizeSession:     Database.Statement;

  // ReplaySession stmts
  private stmtInsertReplay:        Database.Statement;
  private stmtGetReplay:           Database.Statement;
  private stmtUpdateReplayPos:     Database.Statement;
  private stmtListReplays:         Database.Statement;

  // Bookmark stmts
  private stmtInsertBookmark:      Database.Statement;
  private stmtListBookmarks:       Database.Statement;
  private stmtDeleteBookmark:      Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // ── stored_events ────────────────────────────────────────────────────────

    this.stmtInsertEvent = db.prepare(`
      INSERT OR IGNORE INTO stored_events
        (id, swarm_id, trace_id, event_type, agent_id, channel,
         timestamp_iso, received_at_ms, sequence, data_json, priority, raw_json)
      VALUES
        (@id, @swarm_id, @trace_id, @event_type, @agent_id, @channel,
         @timestamp_iso, @received_at_ms, @sequence, @data_json, @priority, @raw_json)
    `);

    this.stmtGetEvent = db.prepare(
      `SELECT * FROM stored_events WHERE id = ?`
    );

    // Dynamic timeline query built per call; stmtQueryTimeline is a base form
    // used for simple swarm_id-only fetches. Filtered queries are built inline.
    this.stmtQueryTimeline = db.prepare(`
      SELECT * FROM stored_events
      WHERE swarm_id = ?
      ORDER BY sequence ASC
      LIMIT ? OFFSET ?
    `);

    this.stmtCountTimeline = db.prepare(`
      SELECT COUNT(*) as total FROM stored_events WHERE swarm_id = ?
    `);

    // ── swarm_sessions ───────────────────────────────────────────────────────

    this.stmtUpsertSession = db.prepare(`
      INSERT INTO swarm_sessions (swarm_id, started_at_ms, status, label)
      VALUES (@swarm_id, @started_at_ms, 'running', @label)
      ON CONFLICT(swarm_id) DO NOTHING
    `);

    this.stmtGetSession = db.prepare(
      `SELECT * FROM swarm_sessions WHERE swarm_id = ?`
    );

    this.stmtListSessions = db.prepare(`
      SELECT * FROM swarm_sessions
      ORDER BY started_at_ms DESC
      LIMIT ? OFFSET ?
    `);

    this.stmtUpdateSessionCounts = db.prepare(`
      UPDATE swarm_sessions SET
        event_count   = event_count + @delta,
        retry_count   = retry_count + @retry_delta,
        anomaly_count = anomaly_count + @anomaly_delta,
        agent_ids     = @agent_ids
      WHERE swarm_id = @swarm_id
    `);

    this.stmtFinalizeSession = db.prepare(`
      UPDATE swarm_sessions SET
        ended_at_ms   = @ended_at_ms,
        status        = @status,
        quality_score = @quality_score,
        duration_ms   = @duration_ms
      WHERE swarm_id = @swarm_id
    `);

    // ── replay_sessions ──────────────────────────────────────────────────────

    this.stmtInsertReplay = db.prepare(`
      INSERT INTO replay_sessions
        (replay_id, swarm_id, created_at_ms, viewer_id, mode,
         current_position_ms, playback_rate, is_paused, last_updated_ms)
      VALUES
        (@replay_id, @swarm_id, @created_at_ms, @viewer_id, @mode,
         @current_position_ms, @playback_rate, @is_paused, @last_updated_ms)
    `);

    this.stmtGetReplay = db.prepare(
      `SELECT * FROM replay_sessions WHERE replay_id = ?`
    );

    this.stmtUpdateReplayPos = db.prepare(`
      UPDATE replay_sessions SET
        current_position_ms = @current_position_ms,
        playback_rate       = @playback_rate,
        is_paused           = @is_paused,
        last_updated_ms     = @last_updated_ms
      WHERE replay_id = @replay_id
    `);

    this.stmtListReplays = db.prepare(`
      SELECT * FROM replay_sessions WHERE swarm_id = ?
      ORDER BY created_at_ms DESC
    `);

    // ── bookmarks ────────────────────────────────────────────────────────────

    this.stmtInsertBookmark = db.prepare(`
      INSERT OR IGNORE INTO bookmarks
        (bookmark_id, swarm_id, offset_ms, label, type, event_id, created_at_ms)
      VALUES
        (@bookmark_id, @swarm_id, @offset_ms, @label, @type, @event_id, @created_at_ms)
    `);

    this.stmtListBookmarks = db.prepare(`
      SELECT * FROM bookmarks WHERE swarm_id = ?
      ORDER BY offset_ms ASC
    `);

    this.stmtDeleteBookmark = db.prepare(
      `DELETE FROM bookmarks WHERE bookmark_id = ?`
    );
  }

  // ─── StoredEvent ────────────────────────────────────────────────────────────

  insertEvent(event: StoredEvent): void {
    this.stmtInsertEvent.run(event);
  }

  insertEventBatch(events: StoredEvent[]): void {
    const tx = this.db.transaction((evts: StoredEvent[]) => {
      for (const e of evts) this.stmtInsertEvent.run(e);
    });
    tx(events);
  }

  getEvent(id: string): StoredEvent | undefined {
    return this.stmtGetEvent.get(id) as StoredEvent | undefined;
  }

  queryTimeline(req: TimelineRequest): { events: StoredEvent[]; total: number } {
    const limit  = req.limit  ?? 200;
    const offset = req.from_offset_ms ?? 0;

    // Build filtered query when optional params are present
    if (req.agent_ids?.length || req.event_types?.length ||
        req.from_offset_ms !== undefined || req.to_offset_ms !== undefined) {
      return this.queryTimelineFiltered(req, limit);
    }

    const events = this.stmtQueryTimeline.all(
      req.swarm_id, limit, offset
    ) as StoredEvent[];

    const { total } = this.stmtCountTimeline.get(req.swarm_id) as { total: number };
    return { events, total };
  }

  private queryTimelineFiltered(
    req: TimelineRequest, limit: number
  ): { events: StoredEvent[]; total: number } {
    const conditions: string[] = ['swarm_id = @swarm_id'];
    const params: Record<string, unknown> = { swarm_id: req.swarm_id };

    if (req.from_offset_ms !== undefined) {
      // offset_ms is (received_at_ms - swarm.started_at_ms); compute via join
      // Simpler: store sequence-based offset. Here we use received_at_ms range.
      // The caller passes absolute ms for from/to.
      conditions.push('received_at_ms >= @from_ms');
      params.from_ms = req.from_offset_ms;
    }
    if (req.to_offset_ms !== undefined) {
      conditions.push('received_at_ms <= @to_ms');
      params.to_ms = req.to_offset_ms;
    }
    if (req.agent_ids?.length) {
      const ph = req.agent_ids.map((_, i) => `@agent${i}`).join(',');
      req.agent_ids.forEach((a, i) => { params[`agent${i}`] = a; });
      conditions.push(`agent_id IN (${ph})`);
    }
    if (req.event_types?.length) {
      const ph = req.event_types.map((_, i) => `@type${i}`).join(',');
      req.event_types.forEach((t, i) => { params[`type${i}`] = t; });
      conditions.push(`event_type IN (${ph})`);
    }

    const where = conditions.join(' AND ');
    const events = this.db.prepare(
      `SELECT * FROM stored_events WHERE ${where} ORDER BY sequence ASC LIMIT @limit`
    ).all({ ...params, limit }) as StoredEvent[];

    const { total } = this.db.prepare(
      `SELECT COUNT(*) as total FROM stored_events WHERE ${where}`
    ).get(params) as { total: number };

    return { events, total };
  }

  // ─── SwarmSession ────────────────────────────────────────────────────────────

  ensureSwarmSession(swarm_id: string, started_at_ms: number, label = ''): void {
    this.stmtUpsertSession.run({ swarm_id, started_at_ms, label });
  }

  getSwarmSession(swarm_id: string): SwarmSession | undefined {
    return this.stmtGetSession.get(swarm_id) as SwarmSession | undefined;
  }

  listSwarmSessions(limit = 50, offset = 0): SwarmSession[] {
    return this.stmtListSessions.all(limit, offset) as SwarmSession[];
  }

  updateSessionCounts(
    swarm_id: string,
    delta: number,
    retry_delta: number,
    anomaly_delta: number,
    agent_ids: string
  ): void {
    this.stmtUpdateSessionCounts.run({
      swarm_id, delta, retry_delta, anomaly_delta, agent_ids,
    });
  }

  finalizeSwarmSession(
    swarm_id: string,
    ended_at_ms: number,
    status: SwarmSession['status'],
    quality_score: number | null,
    duration_ms: number
  ): void {
    this.stmtFinalizeSession.run({ swarm_id, ended_at_ms, status, quality_score, duration_ms });
  }

  // ─── ReplaySession ───────────────────────────────────────────────────────────

  insertReplaySession(session: ReplaySession): void {
    this.stmtInsertReplay.run({
      ...session,
      is_paused:   session.is_paused ? 1 : 0,
      last_updated_ms: Date.now(),
    });
  }

  getReplaySession(replay_id: string): ReplaySession | undefined {
    const row = this.stmtGetReplay.get(replay_id) as
      (Omit<ReplaySession, 'is_paused' | 'bookmarks'> & { is_paused: number }) | undefined;
    if (!row) return undefined;
    return {
      ...row,
      is_paused: row.is_paused === 1,
      bookmarks: this.listBookmarks(row.swarm_id),
    };
  }

  updateReplayPosition(
    replay_id: string,
    current_position_ms: number,
    playback_rate: number,
    is_paused: boolean
  ): void {
    this.stmtUpdateReplayPos.run({
      replay_id,
      current_position_ms,
      playback_rate,
      is_paused: is_paused ? 1 : 0,
      last_updated_ms: Date.now(),
    });
  }

  listReplaySessions(swarm_id: string): ReplaySession[] {
    const rows = this.stmtListReplays.all(swarm_id) as
      (Omit<ReplaySession, 'is_paused' | 'bookmarks'> & { is_paused: number })[];
    const bookmarks = this.listBookmarks(swarm_id);
    return rows.map(r => ({ ...r, is_paused: r.is_paused === 1, bookmarks }));
  }

  // ─── Bookmarks ───────────────────────────────────────────────────────────────

  insertBookmark(bookmark: ReplayBookmark & { created_at_ms: number }): void {
    this.stmtInsertBookmark.run(bookmark);
  }

  listBookmarks(swarm_id: string): ReplayBookmark[] {
    return this.stmtListBookmarks.all(swarm_id) as ReplayBookmark[];
  }

  deleteBookmark(bookmark_id: string): boolean {
    const r = this.stmtDeleteBookmark.run(bookmark_id);
    return r.changes > 0;
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  buildMetricsSummary(swarm_id: string): SwarmMetricsSummary | null {
    const session = this.getSwarmSession(swarm_id);
    if (!session) return null;

    const rows = this.db.prepare(
      `SELECT event_type, agent_id, priority, received_at_ms, sequence, data_json
       FROM stored_events WHERE swarm_id = ? ORDER BY sequence ASC`
    ).all(swarm_id) as Pick<
      StoredEvent,
      'event_type' | 'agent_id' | 'priority' | 'received_at_ms' | 'sequence' | 'data_json'
    >[];

    if (!rows.length) {
      return {
        swarm_id,
        total_events:        0,
        events_by_type:      {},
        events_by_agent:     {},
        events_by_priority:  {},
        avg_inter_event_ms:  0,
        peak_event_rate:     0,
        retry_count:         session.retry_count,
        anomaly_count:       session.anomaly_count,
        failure_count:       0,
        quality_scores:      [],
        agent_state_timeline: [],
      };
    }

    const events_by_type:     Record<string, number> = {};
    const events_by_agent:    Record<string, number> = {};
    const events_by_priority: Record<number, number> = {};
    const quality_scores:     number[]               = [];
    const agent_state_timeline: AgentStateChange[]   = [];
    let failure_count = 0;

    // 1-second buckets for peak rate
    const buckets: Record<number, number> = {};

    let prev_ms = rows[0].received_at_ms;
    let inter_sum = 0;

    for (const r of rows) {
      events_by_type[r.event_type]   = (events_by_type[r.event_type]   ?? 0) + 1;
      events_by_agent[r.agent_id]    = (events_by_agent[r.agent_id]    ?? 0) + 1;
      events_by_priority[r.priority] = (events_by_priority[r.priority] ?? 0) + 1;

      const bucket = Math.floor(r.received_at_ms / 1000);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;

      inter_sum += r.received_at_ms - prev_ms;
      prev_ms    = r.received_at_ms;

      if (r.event_type === 'TASK_FAILED') failure_count++;

      // Parse quality score from data_json
      try {
        const data = JSON.parse(r.data_json) as Record<string, unknown>;
        if (typeof data.quality_score === 'number') {
          quality_scores.push(data.quality_score);
        }
        if (typeof data.state === 'string') {
          agent_state_timeline.push({
            agent_id:  r.agent_id,
            state:     data.state as string,
            offset_ms: r.received_at_ms - (session.started_at_ms ?? 0),
            event_id:  r.sequence.toString(),
          });
        }
      } catch {
        // malformed data_json — skip
      }
    }

    const peak_event_rate = Math.max(...Object.values(buckets));
    const avg_inter_event_ms = rows.length > 1
      ? inter_sum / (rows.length - 1)
      : 0;

    return {
      swarm_id,
      total_events:        rows.length,
      events_by_type,
      events_by_agent,
      events_by_priority,
      avg_inter_event_ms,
      peak_event_rate,
      retry_count:          session.retry_count,
      anomaly_count:        session.anomaly_count,
      failure_count,
      quality_scores,
      agent_state_timeline,
    };
  }
}
