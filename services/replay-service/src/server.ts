import express from 'express';
import cors from 'cors';
import compression from 'compression';
import http from 'http';
import { WebSocketServer } from 'ws';
import { ingestRouter } from './ingest';
import { timelineRouter } from './timeline';
import { replayRouter, attachReplayWebSocket } from './replay';
import { authMiddleware } from './auth';

const PORT     = parseInt(process.env.PORT     ?? '3002', 10);
const WS_PORT  = parseInt(process.env.WS_PORT  ?? '3003', 10);
const AUTH_OFF = process.env.AUTH_DISABLED === 'true';

export function createServer() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'replay-service', ts: Date.now() });
  });

  // ── Token issue (dev only) ──────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const { issueToken } = require('./auth') as typeof import('./auth');
    app.post('/dev/token', (req, res) => {
      const { viewer_id = 'dev-viewer', role = 'admin' } = req.body as Record<string, string>;
      res.json({ token: issueToken(viewer_id, role as 'admin') });
    });
  }

  // ── Protected routes ────────────────────────────────────────────────────────
  const guard = AUTH_OFF
    ? (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
    : authMiddleware;

  // Ingest is called by the internal relay service — accept shared secret or JWT
  app.use('/ingest', internalOrJwt(), ingestRouter);

  // Timeline and replay use JWT auth
  app.use('/timeline', guard, timelineRouter);
  app.use('/replay',   guard, replayRouter);

  // ── WebSocket server (separate port for WS upgrades) ────────────────────────
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/replay/ws' });
  attachReplayWebSocket(wss);

  return { app, httpServer, wss };
}

// Internal service auth: accept X-Internal-Key header OR JWT Bearer
function internalOrJwt() {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const internalKey = req.headers['x-internal-key'];
    if (internalKey && internalKey === process.env.INTERNAL_KEY) {
      next();
      return;
    }
    authMiddleware(req, res, next);
  };
}

export function startServer(): void {
  const { httpServer } = createServer();
  httpServer.listen(PORT, () => {
    console.log(`[replay-service] HTTP+WS listening on :${PORT}`);
  });
}
