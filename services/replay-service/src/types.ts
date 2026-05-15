// ─── Core replay types ────────────────────────────────────────────────────────

export interface StoredEvent {
  id:               string;       // UUID
  swarm_id:         string;       // groups all events in one swarm run
  trace_id:         string;
  event_type:       string;
  agent_id:         string;
  channel:          string;
  timestamp_iso:    string;       // ISO8601 from backend
  received_at_ms:   number;       // unix ms when relay-service received it
  sequence:         number;       // monotonic within swarm_id
  data_json:        string;       // serialized event.data object
  priority:         number;       // 0=Critical .. 4=Ambient
  raw_json:         string;       // original Ue5Message JSON
}

export interface SwarmSession {
  swarm_id:         string;
  started_at_ms:    number;
  ended_at_ms:      number | null;
  status:           'running' | 'completed' | 'failed' | 'unknown';
  event_count:      number;
  agent_ids:        string;       // JSON array
  quality_score:    number | null;
  retry_count:      number;
  anomaly_count:    number;
  duration_ms:      number | null;
  label:            string;       // human-readable e.g. "Run #42 — Cinematic Demo"
}

// ─── Replay session ──────────────────────────────────────────────────────────

export interface ReplaySession {
  replay_id:        string;
  swarm_id:         string;
  created_at_ms:    number;
  viewer_id:        string;
  mode:             ReplayMode;
  current_position_ms: number;   // offset from swarm start
  playback_rate:    number;       // 1.0=realtime, 2.0=2× speed, 0=paused
  is_paused:        boolean;
  bookmarks:        ReplayBookmark[];
}

export type ReplayMode =
  | 'cinematic'    // auto-directed, minimal UI
  | 'observability' // full telemetry overlays
  | 'incident'     // anomaly-focused
  | 'inspector';   // free camera, deep inspection

export interface ReplayBookmark {
  bookmark_id:  string;
  swarm_id:     string;
  offset_ms:    number;
  label:        string;
  type:         'anomaly' | 'failure' | 'retry' | 'success' | 'manual';
  event_id:     string;
}

// ─── Analytics aggregates ────────────────────────────────────────────────────

export interface SwarmMetricsSummary {
  swarm_id:           string;
  total_events:       number;
  events_by_type:     Record<string, number>;
  events_by_agent:    Record<string, number>;
  events_by_priority: Record<number, number>;
  avg_inter_event_ms: number;
  peak_event_rate:    number; // events/sec
  retry_count:        number;
  anomaly_count:      number;
  failure_count:      number;
  quality_scores:     number[];
  agent_state_timeline: AgentStateChange[];
}

export interface AgentStateChange {
  agent_id:     string;
  state:        string;
  offset_ms:    number;
  event_id:     string;
}

// ─── API request/response shapes ─────────────────────────────────────────────

export interface IngestRequest {
  events: StoredEvent[];
}

export interface TimelineRequest {
  swarm_id:      string;
  from_offset_ms?: number;
  to_offset_ms?:  number;
  agent_ids?:    string[];
  event_types?:  string[];
  limit?:        number;
}

export interface TimelineResponse {
  swarm_id:   string;
  events:     StoredEvent[];
  total:      number;
  has_more:   boolean;
}

export interface ReplayControlRequest {
  action:        ReplayAction;
  target_ms?:    number;   // for 'seek'
  playback_rate?: number;  // for 'set_rate'
  bookmark_label?: string; // for 'bookmark'
}

export type ReplayAction = 'play' | 'pause' | 'seek' | 'set_rate' | 'bookmark';

export interface ViewerSession {
  viewer_id:    string;
  swarm_id:     string;
  mode:         ReplayMode;
  connected_at: number;
  last_ping:    number;
  pixel_stream_session_id?: string;
}
