import Database from "better-sqlite3";
import {
  CollectiveMemoryGraph,
  CollectiveMemoryNode,
  CollectiveMemoryEdge,
  CrossSwarmTransfer,
} from "../emergence/types";
import { SwarmEvent, SwarmHealthReport } from "../types";

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS collective_nodes (
  node_id             TEXT PRIMARY KEY,
  swarm_id            TEXT NOT NULL,
  session_id          TEXT NOT NULL,
  kind                TEXT NOT NULL,
  summary             TEXT NOT NULL,
  health_at_event     REAL NOT NULL DEFAULT 0,
  event_types_json    TEXT NOT NULL DEFAULT '[]',
  context_tags_json   TEXT NOT NULL DEFAULT '[]',
  weight              REAL NOT NULL DEFAULT 1.0,
  created_at_ms       INTEGER NOT NULL,
  last_reinforced_ms  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cn_swarm ON collective_nodes(swarm_id);
CREATE INDEX IF NOT EXISTS idx_cn_kind  ON collective_nodes(kind);

CREATE TABLE IF NOT EXISTS collective_edges (
  edge_id     TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL REFERENCES collective_nodes(node_id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES collective_nodes(node_id) ON DELETE CASCADE,
  relation    TEXT NOT NULL,
  strength    REAL NOT NULL DEFAULT 0.5
);
CREATE INDEX IF NOT EXISTS idx_ce_from ON collective_edges(from_id);

CREATE TABLE IF NOT EXISTS cross_swarm_transfers (
  transfer_id           TEXT PRIMARY KEY,
  from_swarm            TEXT NOT NULL,
  to_swarm              TEXT NOT NULL,
  transferred_pattern   TEXT NOT NULL,
  expected_gain         REAL NOT NULL DEFAULT 0,
  applied_at_ms         INTEGER NOT NULL
);
`;

// ─── Class ────────────────────────────────────────────────────────────────────

export class CollectiveMemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA_SQL);
  }

  // ── Ingest a completed swarm session ───────────────────────────────────────

  ingestSession(
    swarmId: string,
    sessionId: string,
    events: SwarmEvent[],
    report: SwarmHealthReport,
  ): void {
    const now = Date.now();
    const nodeIds: string[] = [];

    // Extract key pattern nodes from the session
    const patterns = extractPatterns(swarmId, sessionId, events, report, now);

    const insertNode = this.db.prepare(`
      INSERT OR REPLACE INTO collective_nodes
        (node_id, swarm_id, session_id, kind, summary, health_at_event,
         event_types_json, context_tags_json, weight, created_at_ms, last_reinforced_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);

    const updateWeight = this.db.prepare(`
      UPDATE collective_nodes
      SET weight = weight + 0.3, last_reinforced_ms = ?
      WHERE swarm_id = ? AND summary = ? AND kind = ?
    `);

    const ingestTx = this.db.transaction(() => {
      for (const p of patterns) {
        // Try to reinforce an existing node first
        const changes = updateWeight.run(now, p.swarm_id, p.summary, p.kind) as { changes: number };
        if ((changes as any).changes === 0) {
          insertNode.run(
            p.node_id, p.swarm_id, p.session_id, p.kind, p.summary,
            p.health_at_event,
            JSON.stringify(p.event_types),
            JSON.stringify(p.context_tags),
            p.weight, p.created_at_ms, p.last_reinforced_ms,
          );
        }
        nodeIds.push(p.node_id);
      }

      // Add temporal edges between consecutive pattern nodes
      for (let i = 1; i < nodeIds.length; i++) {
        const edgeId = `${nodeIds[i - 1]}::${nodeIds[i]}`;
        this.db.prepare(`
          INSERT OR IGNORE INTO collective_edges (edge_id, from_id, to_id, relation, strength)
          VALUES (?,?,?,?,?)
        `).run(edgeId, nodeIds[i - 1], nodeIds[i], "preceded", 0.6);
      }
    });

    ingestTx();
  }

  // ── Transfer knowledge to another swarm ───────────────────────────────────

  transferTo(fromSwarm: string, toSwarm: string): CrossSwarmTransfer[] {
    const now = Date.now();
    const topNodes = this.db.prepare(`
      SELECT * FROM collective_nodes
      WHERE swarm_id = ? AND kind IN ('success', 'pattern', 'governance_action')
      ORDER BY weight DESC LIMIT 5
    `).all(fromSwarm) as any[];

    const transfers: CrossSwarmTransfer[] = [];

    for (const node of topNodes) {
      const expectedGain = Math.min(node.health_at_event * 0.3 + node.weight * 0.05, 0.25);
      const transferId   = `xfer_${fromSwarm}_${toSwarm}_${now}_${node.node_id.slice(-6)}`;

      this.db.prepare(`
        INSERT OR IGNORE INTO cross_swarm_transfers
          (transfer_id, from_swarm, to_swarm, transferred_pattern, expected_gain, applied_at_ms)
        VALUES (?,?,?,?,?,?)
      `).run(transferId, fromSwarm, toSwarm, node.summary, round2(expectedGain), now);

      // Clone the node to the target swarm at reduced weight
      const cloneId = `clone_${node.node_id}_${toSwarm}`;
      this.db.prepare(`
        INSERT OR IGNORE INTO collective_nodes
          (node_id, swarm_id, session_id, kind, summary, health_at_event,
           event_types_json, context_tags_json, weight, created_at_ms, last_reinforced_ms)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        cloneId, toSwarm, "transfer", node.kind, node.summary,
        node.health_at_event, node.event_types_json, node.context_tags_json,
        node.weight * 0.5, now, now,
      );

      transfers.push({
        from_swarm: fromSwarm,
        to_swarm: toSwarm,
        transferred_pattern: node.summary,
        expected_gain: round2(expectedGain),
        applied_at_ms: now,
      });
    }
    return transfers;
  }

  // ── Read the full graph ────────────────────────────────────────────────────

  getGraph(swarmId?: string): CollectiveMemoryGraph {
    const nodeRows: any[] = swarmId
      ? this.db.prepare("SELECT * FROM collective_nodes WHERE swarm_id = ? ORDER BY weight DESC LIMIT 200").all(swarmId)
      : this.db.prepare("SELECT * FROM collective_nodes ORDER BY weight DESC LIMIT 200").all();

    const nodeIds = new Set(nodeRows.map((r: any) => r.node_id));
    const edgeRows: any[] = this.db.prepare(
      `SELECT * FROM collective_edges WHERE from_id IN (${[...nodeIds].map(() => "?").join(",")})`,
    ).all(...nodeIds) as any[];

    const transfers: any[] = swarmId
      ? this.db.prepare("SELECT * FROM cross_swarm_transfers WHERE from_swarm = ? OR to_swarm = ?").all(swarmId, swarmId)
      : this.db.prepare("SELECT * FROM cross_swarm_transfers ORDER BY applied_at_ms DESC LIMIT 50").all();

    const sessionCount: { total: number } = this.db.prepare(
      swarmId
        ? "SELECT COUNT(DISTINCT session_id) AS total FROM collective_nodes WHERE swarm_id = ?"
        : "SELECT COUNT(DISTINCT session_id) AS total FROM collective_nodes",
    ).get(...(swarmId ? [swarmId] : [])) as any;

    const nodes: CollectiveMemoryNode[] = nodeRows.map((r: any) => ({
      node_id:            r.node_id,
      swarm_id:           r.swarm_id,
      session_id:         r.session_id,
      kind:               r.kind,
      summary:            r.summary,
      health_at_event:    r.health_at_event,
      event_types:        JSON.parse(r.event_types_json ?? "[]"),
      context_tags:       JSON.parse(r.context_tags_json ?? "[]"),
      weight:             r.weight,
      created_at_ms:      r.created_at_ms,
      last_reinforced_ms: r.last_reinforced_ms,
    }));

    const edges: CollectiveMemoryEdge[] = edgeRows.map((r: any) => ({
      from_node_id: r.from_id,
      to_node_id:   r.to_id,
      relation:     r.relation,
      strength:     r.strength,
    }));

    const total = sessionCount?.total ?? 0;
    return {
      nodes,
      edges,
      cross_swarm_transfers: transfers.map((r: any) => ({
        from_swarm:           r.from_swarm,
        to_swarm:             r.to_swarm,
        transferred_pattern:  r.transferred_pattern,
        expected_gain:        r.expected_gain,
        applied_at_ms:        r.applied_at_ms,
      })),
      total_sessions:    total,
      knowledge_density: total > 0 ? round2(nodes.length / total) : 0,
    };
  }

  close(): void {
    this.db.close();
  }
}

// ─── Pattern extraction ───────────────────────────────────────────────────────

function extractPatterns(
  swarmId: string,
  sessionId: string,
  events: SwarmEvent[],
  report: SwarmHealthReport,
  now: number,
): Array<CollectiveMemoryNode & { event_types: string[] }> {
  const patterns: Array<CollectiveMemoryNode & { event_types: string[] }> = [];
  const anomalies  = events.filter(e => e.event_type === "ANOMALY_DETECTED" || e.event_type === "AGENT_FAILED");
  const recoveries = events.filter(e => e.event_type === "AGENT_RECOVERED");
  const successes  = events.filter(e => e.event_type === "TASK_COMPLETED");
  const retries    = events.filter(e => e.event_type === "TASK_RETRY");

  const make = (
    kind: CollectiveMemoryNode["kind"],
    summary: string,
    health: number,
    evTypes: string[],
    tags: string[],
  ): CollectiveMemoryNode & { event_types: string[] } => ({
    node_id:            `${swarmId}_${kind}_${now}_${Math.random().toString(36).slice(2, 8)}`,
    swarm_id:           swarmId,
    session_id:         sessionId,
    kind,
    summary,
    health_at_event:    health,
    event_types:        evTypes,
    context_tags:       tags,
    weight:             1.0,
    created_at_ms:      now,
    last_reinforced_ms: now,
  });

  // Health performance pattern
  const healthLabel = report.health_label;
  patterns.push(make(
    "pattern",
    `Session health: ${healthLabel} (${Math.round(report.overall_health * 100)}%)`,
    report.overall_health,
    ["overall_health"],
    [healthLabel, `efficiency_${Math.round(report.orchestration_efficiency * 10)}`, "session_summary"],
  ));

  // Incident memory
  if (report.incidents && report.incidents.length > 0) {
    for (const inc of report.incidents.slice(0, 3)) {
      patterns.push(make(
        "incident",
        `Incident: ${inc.kind} at ${inc.onset_agent} — risk ${inc.risk}`,
        report.overall_health,
        [inc.kind],
        ["incident", inc.risk, inc.onset_agent ?? "unknown"],
      ));
    }
  }

  // Success pattern
  if (successes.length > 0) {
    const avgQuality = successes.reduce((s, e) => {
      const q = parseFloat((e.data?.quality_score as string) ?? "0") || 0;
      return s + q;
    }, 0) / successes.length;
    if (avgQuality > 0.75) {
      patterns.push(make(
        "success",
        `${successes.length} tasks completed at avg quality ${Math.round(avgQuality * 100)}%`,
        avgQuality,
        ["TASK_COMPLETED"],
        ["success", "high_quality"],
      ));
    }
  }

  // Topology snapshot
  const agentSet = new Set(events.map(e => e.agent_id));
  patterns.push(make(
    "topology",
    `${agentSet.size} agents, ${events.length} events, ${retries.length} retries`,
    report.overall_health,
    ["AGENT_INITIALIZED"],
    ["topology", `agents_${agentSet.size}`],
  ));

  return patterns;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
