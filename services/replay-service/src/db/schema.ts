import Database from 'better-sqlite3';

export function applySchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous  = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size   = -65536;  -- 64 MB page cache

    -- ─── Swarm sessions ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS swarm_sessions (
      swarm_id        TEXT    PRIMARY KEY,
      started_at_ms   INTEGER NOT NULL,
      ended_at_ms     INTEGER,
      status          TEXT    NOT NULL DEFAULT 'running'
                              CHECK(status IN ('running','completed','failed','unknown')),
      event_count     INTEGER NOT NULL DEFAULT 0,
      agent_ids       TEXT    NOT NULL DEFAULT '[]',   -- JSON array
      quality_score   REAL,
      retry_count     INTEGER NOT NULL DEFAULT 0,
      anomaly_count   INTEGER NOT NULL DEFAULT 0,
      duration_ms     INTEGER,
      label           TEXT    NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_swarm_sessions_status
      ON swarm_sessions(status);

    CREATE INDEX IF NOT EXISTS idx_swarm_sessions_started
      ON swarm_sessions(started_at_ms DESC);

    -- ─── Stored events ─────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS stored_events (
      id              TEXT    PRIMARY KEY,
      swarm_id        TEXT    NOT NULL REFERENCES swarm_sessions(swarm_id),
      trace_id        TEXT    NOT NULL,
      event_type      TEXT    NOT NULL,
      agent_id        TEXT    NOT NULL,
      channel         TEXT    NOT NULL,
      timestamp_iso   TEXT    NOT NULL,
      received_at_ms  INTEGER NOT NULL,
      sequence        INTEGER NOT NULL,
      data_json       TEXT    NOT NULL DEFAULT '{}',
      priority        INTEGER NOT NULL DEFAULT 2,
      raw_json        TEXT    NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_events_swarm_seq
      ON stored_events(swarm_id, sequence ASC);

    CREATE INDEX IF NOT EXISTS idx_events_swarm_type
      ON stored_events(swarm_id, event_type);

    CREATE INDEX IF NOT EXISTS idx_events_swarm_agent
      ON stored_events(swarm_id, agent_id);

    CREATE INDEX IF NOT EXISTS idx_events_swarm_priority
      ON stored_events(swarm_id, priority);

    CREATE INDEX IF NOT EXISTS idx_events_received
      ON stored_events(received_at_ms DESC);

    -- ─── Replay sessions ───────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS replay_sessions (
      replay_id           TEXT    PRIMARY KEY,
      swarm_id            TEXT    NOT NULL REFERENCES swarm_sessions(swarm_id),
      created_at_ms       INTEGER NOT NULL,
      viewer_id           TEXT    NOT NULL,
      mode                TEXT    NOT NULL DEFAULT 'cinematic'
                                  CHECK(mode IN ('cinematic','observability','incident','inspector')),
      current_position_ms INTEGER NOT NULL DEFAULT 0,
      playback_rate       REAL    NOT NULL DEFAULT 1.0,
      is_paused           INTEGER NOT NULL DEFAULT 1,   -- SQLite bool
      last_updated_ms     INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_replay_sessions_swarm
      ON replay_sessions(swarm_id);

    CREATE INDEX IF NOT EXISTS idx_replay_sessions_viewer
      ON replay_sessions(viewer_id);

    -- ─── Bookmarks ─────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS bookmarks (
      bookmark_id   TEXT    PRIMARY KEY,
      swarm_id      TEXT    NOT NULL REFERENCES swarm_sessions(swarm_id),
      offset_ms     INTEGER NOT NULL,
      label         TEXT    NOT NULL,
      type          TEXT    NOT NULL DEFAULT 'manual'
                            CHECK(type IN ('anomaly','failure','retry','success','manual')),
      event_id      TEXT    NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bookmarks_swarm_offset
      ON bookmarks(swarm_id, offset_ms ASC);

    CREATE INDEX IF NOT EXISTS idx_bookmarks_swarm_type
      ON bookmarks(swarm_id, type);
  `);
}
