import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getRepo } from './db/connection';
import { TimelineRequest } from './types';

export const timelineRouter = Router();

// ─── Schema ───────────────────────────────────────────────────────────────────

const TimelineQuerySchema = z.object({
  swarm_id:       z.string().min(1),
  from_offset_ms: z.coerce.number().int().nonnegative().optional(),
  to_offset_ms:   z.coerce.number().int().positive().optional(),
  agent_ids:      z.string().optional(),   // comma-separated
  event_types:    z.string().optional(),   // comma-separated
  limit:          z.coerce.number().int().min(1).max(1000).optional().default(200),
});

// ─── GET /timeline/:swarm_id ───────────────────────────────────────────────────

timelineRouter.get('/:swarm_id', (req: Request, res: Response): void => {
  const parsed = TimelineQuerySchema.safeParse({
    swarm_id: req.params.swarm_id,
    ...req.query,
  });

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.issues });
    return;
  }

  const repo = getRepo();
  const p    = parsed.data;

  // Validate session exists
  const session = repo.getSwarmSession(p.swarm_id);
  if (!session) {
    res.status(404).json({ error: 'Swarm session not found' });
    return;
  }

  // Convert offsets (relative to swarm start) → absolute ms for repository
  const swarmStart = session.started_at_ms;
  const req_: TimelineRequest = {
    swarm_id:      p.swarm_id,
    from_offset_ms: p.from_offset_ms !== undefined
      ? swarmStart + p.from_offset_ms
      : undefined,
    to_offset_ms:   p.to_offset_ms !== undefined
      ? swarmStart + p.to_offset_ms
      : undefined,
    agent_ids:    p.agent_ids   ? p.agent_ids.split(',').map(s => s.trim())   : undefined,
    event_types:  p.event_types ? p.event_types.split(',').map(s => s.trim()) : undefined,
    limit:        p.limit,
  };

  const { events, total } = repo.queryTimeline(req_);

  res.json({
    swarm_id:    p.swarm_id,
    events,
    total,
    has_more:    total > events.length,
    swarm_start_ms: swarmStart,
    swarm_duration_ms: session.duration_ms,
  });
});

// ─── GET /timeline/sessions — list available swarm sessions ──────────────────

timelineRouter.get('/', (req: Request, res: Response): void => {
  const limit  = Math.min(Number(req.query.limit  ?? 50),  200);
  const offset = Math.max(Number(req.query.offset ?? 0),   0);

  const sessions = getRepo().listSwarmSessions(limit, offset);
  res.json({ sessions, limit, offset });
});

// ─── GET /timeline/:swarm_id/metrics ─────────────────────────────────────────

timelineRouter.get('/:swarm_id/metrics', (req: Request, res: Response): void => {
  const swarm_id = req.params.swarm_id;
  const summary  = getRepo().buildMetricsSummary(swarm_id);
  if (!summary) {
    res.status(404).json({ error: 'Swarm session not found' });
    return;
  }
  res.json(summary);
});

// ─── GET /timeline/:swarm_id/bookmarks ───────────────────────────────────────

timelineRouter.get('/:swarm_id/bookmarks', (req: Request, res: Response): void => {
  const session = getRepo().getSwarmSession(req.params.swarm_id);
  if (!session) {
    res.status(404).json({ error: 'Swarm session not found' });
    return;
  }
  const bookmarks = getRepo().listBookmarks(req.params.swarm_id);
  res.json({ bookmarks });
});
