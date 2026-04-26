# SwarmVision

Real-time observability for multi-agent AI systems. SwarmVision streams events from your agents into a live graph, execution timeline, decision log, and alert feed — with a passive meta-agent sidecar that analyzes the stream and surfaces insights without ever writing back to your agents.

**Current state:** developer preview. The core pipeline (event ingest → Neo4j → WebSocket broadcast → React UI) is working. Authentication, multi-tenancy enforcement, and production hardening are on the roadmap — see [What SwarmVision does NOT do yet](#what-swarmvision-does-not-do-yet) below.

---

## What SwarmVision does

- **Live system graph** — agents appear as nodes, handoffs appear as edges, updated in real time as events arrive
- **Execution timeline** — per-trace waterfall of task steps, durations, and failures
- **Decision log** — every `DECISION_EVENT` your agents emit, with decision-flag badges and agent attribution
- **Alerts feed** — `ANOMALY` events surfaced with severity and upstream chain
- **Meta-agent insights** — a passive sidecar (separate process) applies 5 heuristics to the event stream and emits `META_INSIGHT` events: failure-rate spikes, handoff latency outliers, retry storms, cascade failures, and idle agents
- **Replay** — scrub back through historical topology snapshots stored in Neo4j
- **Three graph layouts** — Observability (stable circular), Pipeline (DAG lane layout), Cinematic (dark theme with glow)

## What SwarmVision does NOT do yet

- **No authentication** — the API has no token validation; any client that can reach port 8012 can publish events and read all data
- **No multi-tenant data isolation** — `tenant_id` scopes the UI view but events from different tenants share the same Neo4j database and the same WebSocket channels
- **No SDK for event publishing** — the `packages/sdk/` package exists and compiles but has no published release and no framework-specific integrations (LangGraph, CrewAI, etc.)
- **No HTTPS/WSS** — runs plain HTTP/WS; you must add a TLS-terminating reverse proxy for any non-localhost deployment
- **No production backup or monitoring** — Neo4j runs as a plain container with no volume backup strategy documented

---

## Quick start (Docker Compose)

The recommended way to run SwarmVision. Requires Docker Desktop.

```bash
# 1. Copy the env template and fill in credentials
cp .env.example .env
# Edit .env — set NEO4J_PASSWORD and META_SHARED_SECRET

# 2. Boot the stack
docker compose up --build

# 3. Open the UI
open http://localhost:5173
```

The stack starts three services:

| Service | Port | Role |
|---------|------|------|
| `swarmvision-backend` | 8012 | FastAPI — event ingest, WebSocket broadcast, Neo4j persistence |
| `meta-agent` | 9001 (internal) | Passive heuristic sidecar — never exposed to host |
| `neo4j` | internal only | Graph database for persistence and replay |

> **Note:** `meta-agent` is not reachable from the host. The backend calls it internally. If you're running the backend without Docker, the meta-agent won't be available and the Insights panel will stay empty.

## Running the frontend separately (development)

```bash
cd apps/frontend
npm install
npm run dev
# Opens at http://localhost:5173
# Connects to backend at ws://localhost:8012/ws/events by default
```

To point the frontend at a different backend:

```bash
VITE_WS_URL=ws://your-host:8012/ws/events npm run dev
```

## Publishing events

The backend accepts events at `POST http://localhost:8012/events/broadcast`.

Minimal event body:

```json
{
  "type": "AGENT_SPAWN",
  "payload": { "agent_id": "worker-1", "agent_name": "Worker 1" },
  "source": "my-system"
}
```

### Supported event types

| Type | Effect in UI |
|------|-------------|
| `AGENT_SPAWN` | Creates agent node in System Graph |
| `AGENT_MOVE` | Updates agent node |
| `AGENT_TERMINATION` | Marks agent node terminated |
| `TASK_START` | Adds step to Execution Timeline |
| `TASK_HANDOFF` | Creates directed edge between agents |
| `TASK_SUCCESS` | Updates timeline step |
| `TASK_FAIL` | Marks agent FAILED in graph, adds to Alerts |
| `FLOW_EVENT` | Creates directed edge between agents |
| `DECISION_EVENT` | Adds entry to Decision Log |
| `ANOMALY` | Adds entry to Alerts feed |
| `META_INSIGHT` | Adds entry to Meta Insights panel (emitted by sidecar) |

> `PIPELINE_UPDATE` and `HEALTH_CHECK` are accepted by the backend but not rendered in the UI — they are stored in Neo4j only.

### Optional context envelope

To scope events to a tenant or app:

```json
{
  "type": "TASK_HANDOFF",
  "payload": {
    "source_agent_id": "worker-1",
    "target_agent_id": "worker-2"
  },
  "context": {
    "tenant_id": "acme",
    "app_id": "pipeline-v2",
    "trace_id": "trace-abc123"
  }
}
```

The UI accepts `?tenant_id=acme&app_id=pipeline-v2` query params to filter the view.

---

## Repository structure

```
swarmvision-graph/
├── apps/
│   ├── backend/          FastAPI service (port 8012 in Docker)
│   └── frontend/         React + Vite UI (port 5173 in dev)
├── services/
│   └── meta-agent/       Passive heuristic sidecar (port 9001, internal)
├── packages/
│   ├── sdk/              TypeScript client (no published release yet)
│   └── shared-types/     Shared TypeScript types
├── docs/
│   ├── SETUP.md          Detailed setup and configuration reference
│   ├── ARCHITECTURE.md   System design and component contracts
│   └── walkthroughs/     Audit documents and project history
├── docker-compose.yml
└── .env.example
```

## Running tests

```bash
# Frontend (from apps/frontend/)
cd apps/frontend && npm run test

# Backend (from apps/backend/)
cd apps/backend && pip install -r requirements.txt && pytest

# Meta-agent sidecar (from services/meta-agent/)
cd services/meta-agent && pip install -r requirements.txt && pytest
```

## Environment variables

See `.env.example` for the full list. Required variables with no defaults:

| Variable | Description |
|----------|-------------|
| `NEO4J_PASSWORD` | Neo4j database password |
| `META_SHARED_SECRET` | Shared secret for backend → meta-agent authentication |

---

## License

Private. Not yet licensed for redistribution.
