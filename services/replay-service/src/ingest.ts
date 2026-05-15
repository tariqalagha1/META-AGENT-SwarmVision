import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getRepo } from './db/connection';
import { StoredEvent } from './types';

// ─── Validation schema ────────────────────────────────────────────────────────

const StoredEventSchema = z.object({
  id:             z.string().uuid(),
  swarm_id:       z.string().min(1),
  trace_id:       z.string(),
  event_type:     z.string().min(1),
  agent_id:       z.string().min(1),
  channel:        z.string(),
  timestamp_iso:  z.string(),
  received_at_ms: z.number().int().positive(),
  sequence:       z.number().int().nonnegative(),
  data_json:      z.string().default('{}'),
  priority:       z.number().int().min(0).max(4).default(2),
  raw_json:       z.string().default('{}'),
});

const IngestRequestSchema = z.object({
  events: z.array(StoredEventSchema).min(1).max(500),
});

// ─── Anomaly / bookmark detection ────────────────────────────────────────────

const ANOMALY_EVENT_TYPES = new Set([
  'ANOMALY_DETECTED',
  'CIRCUIT_BREAKER_OPEN',
  'AGENT_TIMEOUT',
  'QUEUE_OVERFLOW',
]);

const FAILURE_EVENT_TYPES = new Set([
  'TASK_FAILED',
  'AGENT_FAILED',
  'SWARM_FAILED',
]);

const RETRY_EVENT_TYPES = new Set([
  'TASK_RETRY',
  'AGENT_RETRY',
  'CIRCUIT_BREAKER_HALF_OPEN',
]);

const SUCCESS_EVENT_TYPES = new Set([
  'TASK_COMPLETED',
  'SWARM_COMPLETED',
  'AGENT_STEP_COMPLETED',
]);

function bookmarkTypeForEvent(
  event_type: string
): 'anomaly' | 'failure' | 'retry' | 'success' | null {
  if (ANOMALY_EVENT_TYPES.has(event_type)) return 'anomaly';
  if (FAILURE_EVENT_TYPES.has(event_type)) return 'failure';
  if (RETRY_EVENT_TYPES.has(event_type))   return 'retry';
  if (SUCCESS_EVENT_TYPES.has(event_type)) return 'success';
  return null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const ingestRouter = Router();

// POST /ingest — batch event ingestion from event-relay service
ingestRouter.post('/', (req: Request, res: Response): void => {
  const parsed = IngestRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  const repo   = getRepo();
  const events = parsed.data.events as StoredEvent[];
  const now    = Date.now();

  // Group by swarm_id to minimize session lookups
  const bySwarm = new Map<string, StoredEvent[]>();
  for (const e of events) {
    const arr = bySwarm.get(e.swarm_id) ?? [];
    arr.push(e);
    bySwarm.set(e.swarm_id, arr);
  }

  let inserted     = 0;
  let bookmarked   = 0;

  for (const [swarm_id, swarmEvents] of bySwarm) {
    // Ensure session row exists (first event of a swarm creates it)
    const firstEvent = swarmEvents.reduce((a, b) =>
      a.received_at_ms < b.received_at_ms ? a : b
    );
    const label = `Run — ${new Date(firstEvent.received_at_ms).toISOString().slice(0, 19)}Z`;
    repo.ensureSwarmSession(swarm_id, firstEvent.received_at_ms, label);

    // Bulk insert
    repo.insertEventBatch(swarmEvents);
    inserted += swarmEvents.length;

    // Agent IDs accumulation
    const session = repo.getSwarmSession(swarm_id);
    const existingAgents: string[] = session?.agent_ids
      ? (JSON.parse(session.agent_ids) as string[])
      : [];
    const allAgents = Array.from(
      new Set([...existingAgents, ...swarmEvents.map(e => e.agent_id)])
    );

    // Count deltas
    const retryDelta   = swarmEvents.filter(e => RETRY_EVENT_TYPES.has(e.event_type)).length;
    const anomalyDelta = swarmEvents.filter(e => ANOMALY_EVENT_TYPES.has(e.event_type)).length;
    repo.updateSessionCounts(
      swarm_id,
      swarmEvents.length,
      retryDelta,
      anomalyDelta,
      JSON.stringify(allAgents)
    );

    // Finalize session on SWARM_COMPLETED / SWARM_FAILED
    for (const e of swarmEvents) {
      if (e.event_type === 'SWARM_COMPLETED' || e.event_type === 'SWARM_FAILED') {
        const startMs   = session?.started_at_ms ?? e.received_at_ms;
        const durationMs = e.received_at_ms - startMs;

        let qualityScore: number | null = null;
        try {
          const data = JSON.parse(e.data_json) as Record<string, unknown>;
          if (typeof data.quality_score === 'number') qualityScore = data.quality_score;
        } catch { /* ignore */ }

        repo.finalizeSwarmSession(
          swarm_id,
          e.received_at_ms,
          e.event_type === 'SWARM_COMPLETED' ? 'completed' : 'failed',
          qualityScore,
          durationMs
        );
      }
    }

    // Auto-bookmarks for notable events
    const swarmStart = repo.getSwarmSession(swarm_id)?.started_at_ms ?? 0;
    for (const e of swarmEvents) {
      const bType = bookmarkTypeForEvent(e.event_type);
      if (!bType) continue;

      repo.insertBookmark({
        bookmark_id:   uuidv4(),
        swarm_id:      e.swarm_id,
        offset_ms:     e.received_at_ms - swarmStart,
        label:         `${e.event_type} — ${e.agent_id}`,
        type:          bType,
        event_id:      e.id,
        created_at_ms: now,
      });
      bookmarked++;
    }
  }

  res.status(201).json({ inserted, bookmarked });
});

// GET /ingest/health — lightweight health endpoint for relay-service polling
ingestRouter.get('/health', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', ts: Date.now() });
});
