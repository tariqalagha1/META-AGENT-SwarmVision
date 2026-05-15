import { Router, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getRepo } from './db/connection';
import {
  ReplaySession, ReplayMode, ReplayAction,
  ReplayControlRequest, StoredEvent,
} from './types';

export const replayRouter = Router();

// ─── Active replay state ──────────────────────────────────────────────────────

interface ActiveReplay {
  session:        ReplaySession;
  socket:         WebSocket;
  timer:          NodeJS.Timeout | null;
  events:         StoredEvent[];
  eventIndex:     number;
  swarmStartMs:   number;
  lastTickMs:     number;
}

const activeReplays = new Map<string, ActiveReplay>();

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateReplaySchema = z.object({
  swarm_id:  z.string().min(1),
  viewer_id: z.string().min(1),
  mode:      z.enum(['cinematic', 'observability', 'incident', 'inspector'])
               .default('cinematic'),
});

const ControlSchema = z.object({
  action:        z.enum(['play', 'pause', 'seek', 'set_rate', 'bookmark']),
  target_ms:     z.number().int().nonnegative().optional(),
  playback_rate: z.number().min(0.1).max(16).optional(),
  bookmark_label: z.string().optional(),
});

// ─── REST: create / query replay sessions ────────────────────────────────────

replayRouter.post('/', (req: Request, res: Response): void => {
  const parsed = CreateReplaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const repo    = getRepo();
  const p       = parsed.data;
  const session = repo.getSwarmSession(p.swarm_id);
  if (!session) {
    res.status(404).json({ error: 'Swarm session not found' });
    return;
  }

  const replay: ReplaySession = {
    replay_id:           uuidv4(),
    swarm_id:            p.swarm_id,
    created_at_ms:       Date.now(),
    viewer_id:           p.viewer_id,
    mode:                p.mode as ReplayMode,
    current_position_ms: 0,
    playback_rate:       1.0,
    is_paused:           true,
    bookmarks:           repo.listBookmarks(p.swarm_id),
  };

  repo.insertReplaySession(replay);
  res.status(201).json(replay);
});

replayRouter.get('/:replay_id', (req: Request, res: Response): void => {
  const replay = getRepo().getReplaySession(req.params.replay_id);
  if (!replay) {
    res.status(404).json({ error: 'Replay session not found' });
    return;
  }
  res.json(replay);
});

replayRouter.get('/swarm/:swarm_id', (req: Request, res: Response): void => {
  const replays = getRepo().listReplaySessions(req.params.swarm_id);
  res.json({ replays });
});

// ─── REST: replay control (play/pause/seek/rate) ──────────────────────────────

replayRouter.post('/:replay_id/control', (req: Request, res: Response): void => {
  const parsed = ControlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid control', details: parsed.error.issues });
    return;
  }

  const repo   = getRepo();
  const replay = repo.getReplaySession(req.params.replay_id);
  if (!replay) {
    res.status(404).json({ error: 'Replay session not found' });
    return;
  }

  const ctrl = parsed.data as ReplayControlRequest;
  applyControl(req.params.replay_id, replay, ctrl, repo);
  const updated = repo.getReplaySession(req.params.replay_id);
  res.json(updated);
});

// ─── WebSocket: /replay/ws/:replay_id ────────────────────────────────────────
// Separate WS attach called from server.ts after http.Server is available

export function attachReplayWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws, req) => {
    const url       = req.url ?? '';
    const match     = url.match(/\/replay\/ws\/([^/?]+)/);
    const replay_id = match?.[1];

    if (!replay_id) {
      ws.close(4000, 'Missing replay_id');
      return;
    }

    const repo   = getRepo();
    const replay = repo.getReplaySession(replay_id);
    if (!replay) {
      ws.close(4004, 'Replay session not found');
      return;
    }

    // Preload events for this swarm
    const swarmSession = repo.getSwarmSession(replay.swarm_id);
    if (!swarmSession) {
      ws.close(4004, 'Swarm session not found');
      return;
    }

    const { events } = repo.queryTimeline({
      swarm_id: replay.swarm_id,
      limit:    50_000,
    });

    const active: ActiveReplay = {
      session:      replay,
      socket:       ws,
      timer:        null,
      events,
      eventIndex:   0,
      swarmStartMs: swarmSession.started_at_ms,
      lastTickMs:   Date.now(),
    };

    // Seek to current position if non-zero
    if (replay.current_position_ms > 0) {
      seekToOffset(active, replay.current_position_ms);
    }

    activeReplays.set(replay_id, active);

    sendWs(ws, { type: 'connected', replay_id, session: replay });

    ws.on('message', raw => {
      let msg: unknown;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      const parsed = ControlSchema.safeParse(msg);
      if (!parsed.success) {
        sendWs(ws, { type: 'error', message: 'Invalid control' });
        return;
      }

      applyControl(replay_id, active.session, parsed.data as ReplayControlRequest, repo);
      const updated = repo.getReplaySession(replay_id);
      if (updated) {
        active.session = updated;
        sendWs(ws, { type: 'state', session: updated });
      }
    });

    ws.on('close', () => {
      const a = activeReplays.get(replay_id);
      if (a?.timer) clearInterval(a.timer);
      activeReplays.delete(replay_id);
    });
  });
}

// ─── Playback engine ──────────────────────────────────────────────────────────

const TICK_INTERVAL_MS = 50; // 20 Hz playback tick

function applyControl(
  replay_id: string,
  session:   ReplaySession,
  ctrl:      ReplayControlRequest,
  repo:      ReturnType<typeof getRepo>
): void {
  const active = activeReplays.get(replay_id);

  switch (ctrl.action as ReplayAction) {
    case 'play': {
      repo.updateReplayPosition(replay_id, session.current_position_ms, session.playback_rate, false);
      if (active) {
        active.session.is_paused = false;
        active.lastTickMs = Date.now();
        startTick(active);
      }
      break;
    }

    case 'pause': {
      repo.updateReplayPosition(replay_id, session.current_position_ms, session.playback_rate, true);
      if (active) {
        active.session.is_paused = true;
        stopTick(active);
      }
      break;
    }

    case 'seek': {
      const target = ctrl.target_ms ?? 0;
      repo.updateReplayPosition(replay_id, target, session.playback_rate, true);
      if (active) {
        active.session.current_position_ms = target;
        active.session.is_paused           = true;
        seekToOffset(active, target);
        stopTick(active);
        sendWs(active.socket, { type: 'seeked', position_ms: target });
      }
      break;
    }

    case 'set_rate': {
      const rate = ctrl.playback_rate ?? 1.0;
      repo.updateReplayPosition(replay_id, session.current_position_ms, rate, session.is_paused);
      if (active) {
        active.session.playback_rate = rate;
      }
      break;
    }

    case 'bookmark': {
      if (ctrl.bookmark_label && active) {
        const { v4 } = require('uuid') as { v4: () => string };
        repo.insertBookmark({
          bookmark_id:   v4(),
          swarm_id:      session.swarm_id,
          offset_ms:     session.current_position_ms,
          label:         ctrl.bookmark_label,
          type:          'manual',
          event_id:      '',
          created_at_ms: Date.now(),
        });
      }
      break;
    }
  }
}

function startTick(active: ActiveReplay): void {
  if (active.timer) return;
  active.timer = setInterval(() => tickReplay(active), TICK_INTERVAL_MS);
}

function stopTick(active: ActiveReplay): void {
  if (active.timer) {
    clearInterval(active.timer);
    active.timer = null;
  }
}

function seekToOffset(active: ActiveReplay, offsetMs: number): void {
  // Find first event at or after offset
  active.eventIndex = active.events.findIndex(
    e => (e.received_at_ms - active.swarmStartMs) >= offsetMs
  );
  if (active.eventIndex < 0) active.eventIndex = active.events.length;
}

function tickReplay(active: ActiveReplay): void {
  if (active.session.is_paused) return;

  const now     = Date.now();
  const elapsed = (now - active.lastTickMs) * active.session.playback_rate;
  active.lastTickMs = now;

  active.session.current_position_ms += elapsed;
  const pos = active.session.current_position_ms;

  // Drain events up to current position
  const batch: StoredEvent[] = [];
  while (
    active.eventIndex < active.events.length &&
    (active.events[active.eventIndex].received_at_ms - active.swarmStartMs) <= pos
  ) {
    batch.push(active.events[active.eventIndex]);
    active.eventIndex++;
  }

  if (batch.length > 0) {
    sendWs(active.socket, { type: 'events', events: batch, position_ms: pos });
  }

  // Periodic position sync (every 500ms)
  if (Math.floor(pos / 500) > Math.floor((pos - elapsed) / 500)) {
    sendWs(active.socket, { type: 'position', position_ms: pos });
  }

  // End of replay
  if (active.eventIndex >= active.events.length) {
    active.session.is_paused = true;
    stopTick(active);
    sendWs(active.socket, { type: 'ended', position_ms: pos });
  }
}

function sendWs(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}
