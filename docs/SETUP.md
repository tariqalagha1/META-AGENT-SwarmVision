# SwarmVision — Setup and Configuration Reference

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker Desktop | any recent | Required for the full stack (Neo4j + meta-agent) |
| Node.js | >= 18 | Frontend only |
| npm | >= 9 | Frontend only |
| Python | >= 3.10 | Backend / meta-agent local dev only |

---

## Option A — Docker Compose (recommended)

Starts backend, meta-agent sidecar, and Neo4j as a single stack.

```bash
# 1. Copy the env template
cp .env.example .env

# 2. Edit .env — fill in both required values:
#    NEO4J_PASSWORD=<choose a password>
#    META_SHARED_SECRET=<choose a secret — any long random string>

# 3. Build and start
docker compose up --build

# 4. Verify backend is up
curl http://localhost:8012/health
```

Expected health response:
```json
{
  "status": "ok",
  "neo4j": {"available": true, "enabled": true, "message": "Neo4j ready"},
  "uptime_seconds": 12.4
}
```

### Service ports

| Service | Host port | Notes |
|---------|-----------|-------|
| `swarmvision-backend` | **8012** | Event ingest, WebSocket, replay, analytics |
| `neo4j` | not published | Internal only — not accessible from host |
| `meta-agent` | not published | Internal only — backend calls it at `http://meta-agent:9001` |

### WebSocket channels

The backend exposes four WebSocket channels on port 8012:

| Channel | URL |
|---------|-----|
| Events | `ws://localhost:8012/ws/events` |
| Metrics | `ws://localhost:8012/metrics` |
| Alerts | `ws://localhost:8012/alerts` |
| Agents | `ws://localhost:8012/agents` |

The frontend connects to all four automatically.

---

## Option B — Local development (no Docker)

Use this if you want to iterate on backend or frontend code without rebuilding containers. You will need Neo4j running separately and the meta-agent sidecar will not be available (Insights panel stays empty).

### Frontend

```bash
cd apps/frontend
npm install
npm run dev
# Starts at http://localhost:5173
```

The frontend connects to the backend at `ws://localhost:8012/ws/events` by default. Override with:

```bash
VITE_WS_URL=ws://localhost:8012/ws/events npm run dev
```

### Backend

```bash
cd apps/backend
pip install -r requirements.txt

# Required env vars for local run (Neo4j optional — backend degrades gracefully):
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=your-password
export META_AGENT_ENABLED=false   # disables sidecar calls in local dev

uvicorn app.main:app --host 0.0.0.0 --port 8012 --reload
```

Health check: `curl http://localhost:8012/health`

> **Port note:** The backend binds to port **8012** when run via Docker or the Dockerfile CMD. If you run it locally with `python -m app.main`, it defaults to port 8000. Use the `uvicorn` command above to keep the port consistent.

---

## Environment variables

Copy `.env.example` to `.env`. Never commit `.env` to version control.

### Required (no defaults — stack won't start without these)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEO4J_PASSWORD` | Neo4j database password | `my-secure-password` |
| `META_SHARED_SECRET` | HMAC secret for backend→sidecar auth | `any-long-random-string` |

### Optional (have defaults in docker-compose)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_URI` | `bolt://neo4j:7687` | Neo4j bolt URI |
| `META_AGENT_ENABLED` | `true` | Set `false` to disable sidecar calls |
| `META_AGENT_URL` | `http://meta-agent:9001` | Sidecar base URL |
| `META_AGENT_TIMEOUT_MS` | `1000` | Per-call timeout to sidecar |
| `META_DISPATCH_SEMAPHORE_SIZE` | `16` | Max concurrent sidecar calls |

---

## API reference

### Health

```
GET /health
```

Returns backend status, Neo4j connectivity, and uptime.

### Event ingest

```
POST /events/broadcast
Content-Type: application/json

{
  "type": "AGENT_SPAWN",
  "payload": { "agent_id": "worker-1", "agent_name": "Worker 1" },
  "source": "my-system",
  "context": {
    "tenant_id": "optional",
    "app_id": "optional",
    "trace_id": "optional"
  }
}
```

### Replay

```
GET /replay/status
GET /replay/range?from=<ISO>&to=<ISO>&tenant_id=<optional>
GET /replay/topology?timestamp=<ISO>&tenant_id=<optional>
GET /replay/events?from=<ISO>&to=<ISO>
```

### Analytics

```
GET /analytics/summary
GET /analytics/failures
GET /analytics/latency
GET /analytics/bottlenecks
```

### Other

```
GET /trace/{trace_id}
GET /agent/{agent_id}/metrics
GET /anomalies
GET /ws/stats
```

---

## Testing

### Frontend

```bash
cd apps/frontend
npm run test           # run once
npm run type-check     # TypeScript check
npm run lint           # ESLint
```

Current test status: 15 passing, 4 pre-existing failures in `App.phase5-8.test.tsx` (those tests assert against an older architecture and are tracked for rewrite — see `docs/audits/FOLLOWUPS.md`).

### Backend

```bash
cd apps/backend
pip install -r requirements.txt
pytest
```

### Meta-agent sidecar

```bash
cd services/meta-agent
pip install -r requirements.txt
pytest
```

---

## Troubleshooting

### Frontend shows "Disconnected" banner

- Confirm backend is running: `curl http://localhost:8012/health`
- Confirm you're using port **8012** (not 8000)
- Check browser Network tab → WS connections — look for `ws://localhost:8012/ws/events`

### Backend health returns `neo4j: disconnected`

- Neo4j container may still be starting. Wait 10-15 seconds and retry.
- Check `docker compose logs neo4j` for errors.
- Confirm `NEO4J_PASSWORD` in `.env` matches what's in the Neo4j container.

### Meta Insights panel is empty

- The meta-agent sidecar only runs inside Docker Compose. It is not started by local `uvicorn` runs.
- Confirm `docker compose ps` shows `meta-agent` as running.
- Check `docker compose logs meta-agent` for startup errors.

### `docker compose up` fails with env var error

- Ensure `.env` exists in the repo root (not inside a subdirectory).
- Confirm `NEO4J_PASSWORD` and `META_SHARED_SECRET` are set (not blank).

### `version` attribute warning from docker compose

The `version: '3.9'` attribute in `docker-compose.yml` is deprecated in newer Docker Compose versions. It's cosmetic — the stack still starts correctly. The warning can be ignored or removed from the file.
