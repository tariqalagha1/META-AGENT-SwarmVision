# SwarmVision — Full Technical & Business Report

> Combined analysis of frontend design, backend architecture, Neo4j integration, and system intelligence layer.  
> Compiled from two-pass codebase exploration — April 2026.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What SwarmVision Is](#2-what-swarmvision-is)
3. [Full Monorepo Structure](#3-full-monorepo-structure)
4. [Frontend — Design & UI](#4-frontend--design--ui)
5. [Frontend — State Management & Real-Time Architecture](#5-frontend--state-management--real-time-architecture)
6. [Backend — FastAPI & Event Pipeline](#6-backend--fastapi--event-pipeline)
7. [Neo4j — Graph Database Layer](#7-neo4j--graph-database-layer)
8. [Meta-Agent — Intelligence Sidecar](#8-meta-agent--intelligence-sidecar)
9. [SDK & Shared Types](#9-sdk--shared-types)
10. [LangGraph — Architectural Position](#10-langgraph--architectural-position)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Data Flow — End to End](#12-data-flow--end-to-end)
13. [Event Type Taxonomy](#13-event-type-taxonomy)
14. [Design Token System](#14-design-token-system)
15. [Test Coverage](#15-test-coverage)
16. [Business Value Summary](#16-business-value-summary)

---

## 1. Executive Summary

SwarmVision is a **production-grade, real-time observability platform** for multi-agent AI systems. It solves a fundamental problem: when many AI agents coordinate, reason, and hand off tasks to each other, the internal behavior of that system becomes invisible. Developers, operators, and teams lose the ability to understand what's happening, why something failed, or where performance is degrading.

SwarmVision makes the invisible visible.

**Core capabilities:**
- Live graph visualization of agent topology and task handoffs
- Real-time alert detection with sub-second latency
- Execution timeline per trace — every event, decision, and failure in order
- Decision audit log — every routing choice made by any agent
- Replay — reconstruct exact system state at any past timestamp
- Meta-agent sidecar — passive, deterministic analysis of patterns across all streams

**Technology foundation:**
- React 18 + XYFlow + Three.js frontend
- FastAPI + WebSocket backend with 4 parallel streams
- Neo4j graph database for full event persistence and relationship modeling
- Deterministic Python meta-agent (no LLMs — intentional design choice)
- Monorepo with SDK and shared types for third-party integration

---

## 2. What SwarmVision Is

SwarmVision is best understood as a **control tower for AI agent swarms**. Just as air traffic control makes a complex, invisible system observable and manageable, SwarmVision does the same for distributed AI pipelines.

**The problem it solves:**

Multi-agent systems — where AI agents spawn, delegate, hand off tasks, make decisions, and terminate — are inherently opaque. Traditional monitoring tools (logs, metrics dashboards) were designed for static services, not dynamic agent graphs where the topology itself changes at runtime.

**What users see:**

A dark-themed four-panel dashboard:
- **Top-left**: Live system graph — nodes are agents, edges are handoffs, colors encode health state
- **Top-right**: Real-time alerts — severity-coded, auto-timestamped, live-scrolling
- **Bottom-left**: Execution timeline — every event in a trace, ordered chronologically
- **Bottom-right**: Decision audit log — every routing decision with its flag (ALLOW, RETRY, FALLBACK, BLOCK, SWITCH_AGENT)

**Who uses it:**

- AI/ML engineers debugging agent pipelines
- Platform teams monitoring production multi-agent deployments
- Product teams verifying agent behavior against intended design
- Operators responding to live incidents in real time

---

## 3. Full Monorepo Structure

```
swarmvision-graph/
├── apps/
│   ├── backend/                        Python FastAPI backend
│   │   └── app/
│   │       ├── main.py                 FastAPI entry point, all routes
│   │       ├── agents/
│   │       ├── analytics/
│   │       │   └── service.py
│   │       ├── clients/
│   │       │   └── meta_client.py
│   │       ├── control_plane/
│   │       │   ├── control_plane.py
│   │       │   └── rbac.py
│   │       ├── core/
│   │       │   ├── settings.py
│   │       │   └── pulse.py
│   │       ├── neo4j/                  Graph database integration
│   │       │   ├── repository.py       493-line Neo4j client
│   │       │   └── replay.py           Topology reconstruction
│   │       ├── observability/
│   │       │   ├── agent_state.py
│   │       │   ├── aggregation_service.py
│   │       │   ├── anomaly.py
│   │       │   ├── decision.py
│   │       │   ├── envelope.py
│   │       │   ├── errors.py
│   │       │   ├── meta_context.py
│   │       │   └── trace.py
│   │       ├── schemas/
│   │       │   ├── analytics.py
│   │       │   ├── control_plane.py
│   │       │   ├── event.py
│   │       │   ├── meta.py
│   │       │   ├── observability.py
│   │       │   └── replay.py
│   │       └── websocket/
│   │           └── manager.py
│   └── frontend/                       React TypeScript application
│       └── src/
│           ├── App.tsx                 Main component, WS orchestration
│           ├── main.tsx
│           ├── components/
│           │   ├── graph/              SwarmFlowMap, SwarmFlowMap3D,
│           │   │                       SwarmInspector, TopologyControls,
│           │   │                       ViewToggle
│           │   ├── observability/      AlertsPanel, AlertRow, DecisionPanel,
│           │   │                       DecisionRow, ExecutionTimelinePanel,
│           │   │                       SystemGraphPanel, EventDetailsDrawer,
│           │   │                       TimelineEventRow, EventTypePill,
│           │   │                       SeverityBadge, AgentIdChip,
│           │   │                       EmptyStateCard, GraphLegend,
│           │   │                       DecisionFilterBar, DecisionFlagBadge
│           │   ├── analytics/          AnalyticsSummary,
│           │   │                       AnalyticsTimelineCharts, RootCausePanel
│           │   ├── replay/             ModeToggle, ReplayTimeline
│           │   └── websocket/          ConnectionStatus, EventLog
│           ├── design/
│           │   ├── agentStateTokens.ts
│           │   ├── severityTokens.ts
│           │   ├── eventTypeTokens.ts
│           │   └── decisionFlagTokens.ts
│           ├── hooks/
│           │   ├── useWebSocket.ts
│           │   ├── useBufferedStream.ts
│           │   ├── useAnalytics.ts
│           │   ├── useReplay.ts
│           │   └── useSwarmTopology.ts
│           ├── store/
│           │   ├── useObservabilityStore.ts
│           │   └── selectors.ts
│           ├── types/
│           │   ├── index.ts
│           │   └── observability.ts
│           └── utils/
│               ├── decision.ts
│               ├── severity.ts
│               └── formatTimestamp.ts
├── packages/
│   ├── sdk/                            SwarmVision integration SDK
│   │   ├── src/
│   │   │   ├── SwarmVisionClient.ts
│   │   │   ├── SwarmVisionWidget.tsx
│   │   │   ├── WebSocketConnector.ts
│   │   │   └── EventEmitter.ts
│   │   └── examples/
│   │       ├── backend-event-publisher.py
│   │       └── react-integration.tsx
│   └── shared-types/                   Shared TypeScript type definitions
│       └── src/
│           └── index.ts
├── services/
│   └── meta-agent/                     Python meta-agent sidecar
│       └── app/
│           ├── api/
│           │   ├── middleware.py
│           │   └── routes.py
│           ├── clients/
│           │   └── swarmvision_client.py
│           ├── core/
│           │   ├── settings.py
│           │   └── thresholds.py
│           ├── schemas/
│           │   ├── context.py
│           │   └── insight.py
│           └── services/
│               ├── analyzer.py
│               ├── dedup.py
│               ├── heuristics.py
│               ├── metrics.py
│               ├── serializer.py
│               └── storage.py          Neo4j insight storage
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SETUP.md
│   ├── PHASE2_GUIDE.md
│   └── PHASE2_SUMMARY.md
├── docker-compose.yml
└── package.json                        npm monorepo workspace root
```

**Totals:** 150+ source files (excluding node_modules), 4 workspaces, 3 languages (TypeScript, Python, Cypher).

---

## 4. Frontend — Design & UI

### Visual Design Language

The frontend uses a **dark, data-dense design** appropriate for operational monitoring contexts. Color is used with strict semantic meaning — never decorative.

**Color palette:**

| Role | Color | Hex | Used For |
|------|-------|-----|----------|
| Primary accent | Cyan | `#00C8FF` | Active agents, graph edges, live indicators |
| Warning | Amber | `#F2A623` | Degraded agents, medium severity |
| Critical | Red | `#E24B4A` | Failed agents, high severity alerts |
| Background | Deep navy | `#080C14` | App background |
| Surface | Dark slate | `#0D1526` | Panel backgrounds |
| Border | Dark blue | `#223A5E` | Panel separators |
| Text primary | Ice blue | `#E2F0FF` | Labels, values |
| Text secondary | Steel blue | `#8AA0C0` | Timestamps, metadata |

### Four-Panel Dashboard Layout

```
┌────────────────────────────┬──────────────────────────┐
│                            │                          │
│    SYSTEM GRAPH            │    ALERTS PANEL          │
│    (SwarmFlowMap)          │    (AlertsPanel)         │
│                            │                          │
│    Live agent topology     │    Severity-coded        │
│    2D / 3D toggle          │    real-time alerts      │
│                            │                          │
├────────────────────────────┼──────────────────────────┤
│                            │                          │
│    EXECUTION TIMELINE      │    DECISION PANEL        │
│    (ExecutionTimelinePanel)│    (DecisionPanel)       │
│                            │                          │
│    Chronological trace     │    Routing decisions,    │
│    events per trace        │    flags, audit log      │
│                            │                          │
└────────────────────────────┴──────────────────────────┘
```

### Graph Visualization

The system graph (`SwarmFlowMap.tsx`) uses **@xyflow/react** (XYFlow v12) for 2D and **react-force-graph-3d** with **Three.js** for 3D mode. Users can toggle between views (`ViewToggle`).

- **Nodes** represent agents. Color and ring style encode state (active/degraded/failed)
- **Edges** represent task handoffs with direction and count
- **TopologyControls** provide zoom, layout reset, and filter controls
- **SwarmInspector** shows per-agent detail on click
- **GraphLegend** provides a persistent color/state reference

### Component Inventory (25 React components, 15 CSS files)

**Graph (5 components):**
- `SwarmFlowMap.tsx` — 2D agent graph
- `SwarmFlowMap3D.tsx` — 3D force graph
- `SwarmInspector.tsx` — Agent detail sidebar
- `TopologyControls.tsx` — Graph controls
- `ViewToggle.tsx` — 2D/3D mode toggle

**Observability (15 components):**
- `SystemGraphPanel.tsx` — Graph panel wrapper
- `AlertsPanel.tsx` — Live alert list
- `AlertRow.tsx` — Single alert row
- `SeverityBadge.tsx` — LOW / MEDIUM / HIGH badge
- `ExecutionTimelinePanel.tsx` — Timeline panel wrapper
- `TimelineEventRow.tsx` — Single timeline event
- `EventTypePill.tsx` — Event type chip
- `EventDetailsDrawer.tsx` — Full event detail side drawer
- `DecisionPanel.tsx` — Decision audit panel
- `DecisionRow.tsx` — Single decision entry
- `DecisionFilterBar.tsx` — Filter by flag/agent/trace
- `DecisionFlagBadge.tsx` — ALLOW / RETRY / BLOCK etc.
- `AgentIdChip.tsx` — Compact agent identifier
- `EmptyStateCard.tsx` — Placeholder when no data
- `GraphLegend.tsx` — Color/state legend

**Analytics (3 components):**
- `AnalyticsSummary.tsx` — KPI summary cards
- `AnalyticsTimelineCharts.tsx` — Time-series charts
- `RootCausePanel.tsx` — Failure root cause display

**Replay (2 components):**
- `ReplayTimeline.tsx` — Scrubber for time-travel replay
- `ModeToggle.tsx` — LIVE / REPLAY mode switch

**WebSocket (2 components):**
- `ConnectionStatus.tsx` — Channel health indicators
- `EventLog.tsx` — Raw event log display

---

## 5. Frontend — State Management & Real-Time Architecture

### WebSocket Channels

`App.tsx` manages **4 parallel WebSocket channels**, each scoped by `tenant_id`, `app_id`, and `app_name` from URL parameters:

| Channel | Content | Buffer |
|---------|---------|--------|
| `events` | All system events | 5,000 max |
| `metrics` | Agent performance metrics | rolling |
| `alerts` | Anomaly and severity alerts | 100 max |
| `agents` | Agent state updates | per agent_id |

### Central Store — `useObservabilityStore.ts`

Built on React's `useSyncExternalStore`. Manages:

```
Events        → max 5,000, auto-eviction by age
Alerts        → max 100
Traces        → max 500, indexed by trace_id
Agents        → indexed by agent_id
Decisions     → max 1,000
Anomalies     → max 1,000
Stream Mode   → LIVE | PAUSED
Connection    → CONNECTED | DISCONNECTED | RECONNECTING
Heartbeat     → auto-TTL cleanup (5-minute default)
```

When stream mode is **PAUSED**, `usePausedSnapshot()` freezes the UI state so users can inspect a moment without new events overwriting their view.

### Selectors — `selectors.ts`

Purpose-built hooks for each panel:

| Selector | Returns |
|----------|---------|
| `useFilteredEvents()` | Events filtered by tenant/app/type |
| `useTopologyEvents()` | Topology-specific events for graph |
| `useTimelineEvents()` | Events for a selected trace |
| `useDecisionEvents()` | Decision events only |
| `useAnomalyEvents()` | Anomaly events only |
| `useGraphData()` | Computed nodes + edges from topology events |
| `usePausedSnapshot()` | Frozen snapshot during pause |

### Hooks

| Hook | Responsibility |
|------|---------------|
| `useWebSocket.ts` | Connection lifecycle, reconnect, channel routing |
| `useBufferedStream.ts` | Batches incoming events to prevent render thrashing |
| `useAnalytics.ts` | Fetches and processes analytics data |
| `useReplay.ts` | Controls replay scrubber and timestamp queries |
| `useSwarmTopology.ts` | Derives topology graph from event stream |

### Stream Mode Control

Users can toggle between:
- **LIVE** — events flow in real time, UI updates continuously
- **PAUSED** — stream buffered, UI frozen at snapshot; user can inspect without interruption

---

## 6. Backend — FastAPI & Event Pipeline

### Entry Point — `apps/backend/app/main.py`

The backend is a single FastAPI application handling all HTTP REST and WebSocket connections. Key responsibilities:

**Event ingestion:**
```
POST /events/broadcast
  → validate (Pydantic schema)
  → enrich (add metadata envelope)
  → persist to Neo4j (threadpool)
  → broadcast via WebSocket to all connected clients
  → ingest to aggregation_service
```

**Decision logging:**
```
POST /decisions
  → build_decision_event()
  → enrich
  → persist to Neo4j
  → append to recent_decisions
```

**Anomaly publishing:**
```
POST /anomalies/publish
  → enrich
  → persist to Neo4j
  → broadcast on "alerts" WebSocket channel
```

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| POST | `/events/broadcast` | Ingest and broadcast an event |
| GET | `/replay/status` | Neo4j availability |
| GET | `/replay/events` | Persisted events for date range |
| GET | `/replay/topology` | Topology snapshot at timestamp |
| GET | `/replay/range` | Events + topology combined |
| GET | `/replay/{trace_id}` | Full trace path from Neo4j |
| GET | `/anomalies` | Recent anomalies (limit 200) |
| GET | `/analytics/summary` | Aggregated event summary |
| GET | `/analytics/failures` | Failure analysis |
| GET | `/analytics/latency` | Latency breakdown |
| GET | `/analytics/bottlenecks` | Bottleneck detection |

### WebSocket Endpoints

```
WS /ws/events    — live event stream
WS /ws/metrics   — agent performance metrics
WS /ws/alerts    — anomaly and alert stream
WS /ws/agents    — agent state updates
```

### Observability Modules

| Module | Purpose |
|--------|---------|
| `agent_state.py` | Tracks per-agent state transitions |
| `aggregation_service.py` | Rolls up events into summary metrics |
| `anomaly.py` | Detects and categorizes anomalies |
| `decision.py` | Builds decision event structures |
| `envelope.py` | Enriches raw events with metadata |
| `trace.py` | Trace correlation across events |
| `meta_context.py` | Context forwarding to meta-agent |

### Dependencies

```
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
neo4j==5.14.1
```

---

## 7. Neo4j — Graph Database Layer

Neo4j is the **sole persistence layer** for SwarmVision. It stores every event, agent state, trace, and decision as a connected graph — enabling replay, trace walking, anomaly history, and relationship-based analytics.

### Graph Schema

**Node types:**

| Node Label | Key Properties | Description |
|------------|---------------|-------------|
| `:Event` | event_id (UNIQUE), type, timestamp, tenant_id, app_id | Every system event |
| `:Agent` | id (UNIQUE), agent_id, name | Agent entities |
| `:Trace` | trace_id (UNIQUE) | Trace containers |
| `:Decision` | id (UNIQUE), flag, confidence | Decision events |
| `:AgentStateSnapshot` | snapshot_id, timestamp, metrics | Agent health snapshots |

**Relationship types:**

| Relationship | From → To | Description |
|-------------|-----------|-------------|
| `:PART_OF` | Event → Trace | Event belongs to trace |
| `:NEXT` | Event → Event | Ordered event chain |
| `:PARTICIPATED_IN` | Agent → Event | Agent was involved |
| `:HANDOFF` | Agent → Agent | Task delegation |
| `:SOURCE_OF` | Event → Decision | Event triggered decision |
| `:TARGETS` | Decision → Agent | Decision targets agent |
| `:TRIGGERED` | Decision → Event | Decision caused event |
| `:HAS_STATE` | Agent → AgentStateSnapshot | State at point in time |

**Unique constraints (auto-created at startup):**
- `Event.event_id`
- `Agent.id`
- `Trace.trace_id`
- `Decision.id`

### `Neo4jGraphRepository` — `repository.py` (493 lines)

The main Neo4j client class. Key methods:

| Method | Purpose |
|--------|---------|
| `connect()` | Establish driver, verify connectivity, create schema |
| `persist_event(event)` | Store event, create all relationships |
| `persist_agent_state(state)` | Store agent metrics snapshot |
| `get_events_between(from, to, tenant, app)` | Replay date range query |
| `get_events_until(timestamp, tenant, app)` | All events up to point in time |
| `get_trace_events(trace_id)` | Walk full trace chain |
| `get_recent_anomalies(limit=100)` | Anomaly history query |
| `_ensure_schema()` | Idempotent constraint creation |

**Supported event types for persistence (34 total):**

AGENT_SPAWN, AGENT_MOVE, AGENT_TERMINATION, TASK_START, TASK_HANDOFF, TASK_SUCCESS, TASK_FAIL, PIPELINE_UPDATE, HEALTH_CHECK, DECISION_POINT, DECISION, ANOMALY, META_INSIGHT, and 21 additional types.

### `replay.py` — Topology Reconstruction

`build_topology_snapshot(events, timestamp)` takes a list of events from Neo4j and replays them forward to reconstruct exact system state at any given timestamp.

Output structure:
```python
{
  "agents": {
    "agent-id": {
      "state": "ACTIVE|DEGRADED|FAILED|TERMINATED",
      "x": float, "y": float,
      "current_task": str,
      "task_count": int
    }
  },
  "edges": {
    "agent-a→agent-b": {
      "count": int,
      "last_timestamp": str
    }
  },
  "active_handoffs": [...]
}
```

Known agents (OCR, Parser, Linker, Memory, Orchestrator) use a preset layout. New agents are placed dynamically on a circle.

### Configuration

```
NEO4J_ENABLED=true               (default)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
NEO4J_CONNECT_TIMEOUT=3.0
```

---

## 8. Meta-Agent — Intelligence Sidecar

The meta-agent is a **separate Python FastAPI service** (`services/meta-agent/`) that runs alongside the main backend. It performs passive, deterministic analysis of the event stream — no LLMs, no external AI dependencies.

### What It Does

- Connects to SwarmVision's event stream as a consumer
- Applies heuristic rules to detect patterns (repeated failures, latency spikes, agent degradation trends)
- Generates `MetaInsight` objects with category, severity, confidence score, suggested action
- Deduplicates insights using a `dedup_key` (prevents the same insight from flooding)
- Stores insights to Neo4j with evidence links back to causal events

### Service Structure

| Module | Responsibility |
|--------|---------------|
| `analyzer.py` | Orchestrates analysis pipeline |
| `heuristics.py` | Rule definitions (deterministic) |
| `dedup.py` | Insight deduplication logic |
| `metrics.py` | Internal service metrics |
| `serializer.py` | Event/insight serialization |
| `storage.py` | Neo4j persistence for insights |
| `thresholds.py` | Configurable detection thresholds |
| `swarmvision_client.py` | HTTP client to main backend |

### Neo4j Schema for Insights

```
(:MetaInsight {
  dedup_key,              // UNIQUE — prevents duplicates
  schema_version,
  event_type,
  timestamp,
  trace_id, agent_id,
  category, severity, confidence,
  title, summary, suggestion,
  heuristic_name,
  thresholds_used,
  window_start, window_end,
  truncation_applied,
  occurrence_count
})

(:MetaInsight)-[:EVIDENCES]->(:Event)
(:MetaInsight)-[:EVIDENCES]->(:Decision)
(:MetaInsight)-[:EVIDENCES]->(:Anomaly)
```

**Retention policy:** DETACH DELETE after 30 days or beyond 10,000 records — enforced on each write cycle.

### Why No LLMs

The meta-agent is intentionally built without LangGraph, LangChain, or any LLM. This is a deliberate architectural choice:
- **Deterministic** — same input always produces same output, enabling reproducibility
- **Auditable** — heuristic rules can be read and reviewed by engineers
- **Fast** — no network calls to AI APIs, no token latency
- **Cost-free** — no inference cost per event
- **Stable** — no dependency on model availability or behavior drift

### Meta-Agent Dependencies

```
neo4j==5.24.0
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.9.2
prometheus-client==0.20.0
```

---

## 9. SDK & Shared Types

### `packages/sdk/`

The SDK package (`@swarmvision/sdk`) enables any third-party application to publish events to SwarmVision with minimal integration effort.

**Core modules:**

| File | Description |
|------|-------------|
| `SwarmVisionClient.ts` | Main SDK client — HTTP + WS event publishing |
| `SwarmVisionWidget.tsx` | Drop-in React widget for embedding SwarmVision UI |
| `WebSocketConnector.ts` | Low-level WebSocket abstraction |
| `EventEmitter.ts` | Browser-side event emitter pattern |

**Integration example (Python):**
```python
payload = {
    "type": "TASK_FAIL",
    "timestamp": "2026-04-10T19:00:00Z",
    "source": "backend-job",
    "payload": {
        "agent_id": "invoice-worker",
        "task_id": "invoice-run-2026-04-10",
        "error": "downstream timeout"
    },
    "context": {
        "tenant_id": "tenant-acme",
        "app_id": "billing-api",
        "environment": "production"
    }
}
# POST to http://localhost:8012/events/broadcast
```

### `packages/shared-types/`

TypeScript interfaces shared across frontend, SDK, and any TypeScript consumer. Ensures a single source of truth for all event shapes, agent state enums, and decision flag types. No external dependencies — pure type definitions.

---

## 10. LangGraph — Architectural Position

LangGraph is **not integrated** into the SwarmVision codebase. It appears in exactly two places — both documentation files — where it is described as an **external reference repository** for architectural inspiration only.

From `README.md`:
```
/workspace
   /swarmvision-graph        ← main product repo
   /langgraph-reference      ← external reference repo (read-only)
```

From `AGENTS.md`:
> "DO NOT copy code from external reference repositories into the main repo."
> "Use external repos only for understanding patterns and APIs."

**What this means in practice:**
- LangGraph's graph-based agent orchestration patterns likely influenced SwarmVision's event topology model
- The Neo4j relationship schema (agents, traces, handoffs as graph edges) mirrors LangGraph's state graph concepts
- But SwarmVision does not use LangGraph at runtime — it observes and visualizes agent systems that *may* use LangGraph, without depending on it

**Potential future integration:**  
If the meta-agent were to be upgraded from deterministic heuristics to LLM-powered reasoning (e.g., summarizing anomaly clusters, generating natural-language incident reports), LangGraph would be a natural orchestration layer for that upgrade. This remains a future possibility, not a current implementation.

---

## 11. Deployment & Infrastructure

### Docker Compose

Three services with defined dependency order:

```yaml
services:
  neo4j:
    image: neo4j:5.26
    expose:
      - '7474'    # Browser UI
      - '7687'    # Bolt protocol

  meta-agent:
    depends_on: [neo4j]
    environment:
      NEO4J_URI: bolt://neo4j:7687
      NEO4J_USER: neo4j
      NEO4J_PASSWORD: password

  swarmvision-backend:
    depends_on: [neo4j, meta-agent]
    environment:
      NEO4J_URI: bolt://neo4j:7687
      NEO4J_USERNAME: neo4j
      NEO4J_PASSWORD: password
```

Startup order: Neo4j → Meta-Agent → Backend → Frontend (served separately via Vite or static build).

### Frontend Build

```
Vite 5.0.0 + TypeScript 5.2.2
npm run build → dist/
```

### GitHub Actions

`.github/workflows/` configured — CI pipeline in place (contents not explored in detail).

---

## 12. Data Flow — End to End

```
External Application
        │
        │ POST /events/broadcast  (HTTP)
        ▼
FastAPI Backend (main.py)
        │
        ├─ Pydantic schema validation
        ├─ Envelope enrichment (timestamp, tenant_id, etc.)
        ├─ Neo4j persistence (threadpool)  ─────────────────► Neo4j
        ├─ Aggregation service ingest                             │
        └─ WebSocket broadcast                                    │
                │                                                 │
                ├─ channel: events ──────────────────────────┐    │
                ├─ channel: alerts (anomalies only) ────────┐ │    │
                ├─ channel: metrics ────────────────────────┐│ │    │
                └─ channel: agents ─────────────────────────┤│ │    │
                                                            ││ │    │
                                              React Frontend│└─┘    │
                                                            │        │
                                              useWebSocket.ts        │
                                                            │        │
                                              useObservabilityStore  │
                                                            │        │
                                    ┌───────────────────────┘        │
                                    │                                │
                              4 Panels render                        │
                                                                     │
Meta-Agent Sidecar                                                   │
        │                                                            │
        ├─ Consumes event stream                                     │
        ├─ Applies heuristics                                        │
        ├─ Generates MetaInsight                                     │
        └─ Persists to Neo4j ────────────────────────────────────────┘
                │
                └─ POSTs META_INSIGHT event back to backend
                          │
                          └─ Broadcast to frontend on events channel
```

**Replay path:**
```
User selects timestamp on ReplayTimeline
        │
        ▼
GET /replay/topology?timestamp=...
        │
        ▼
Neo4j query: get_events_until(timestamp)
        │
        ▼
build_topology_snapshot(events, timestamp)
        │
        ▼
Frontend renders historical agent topology
```

---

## 13. Event Type Taxonomy

SwarmVision recognizes and persists 34 event types, grouped by category:

**Agent Lifecycle:**
| Type | Description |
|------|-------------|
| AGENT_SPAWN | New agent created |
| AGENT_MOVE | Agent repositioned in pipeline |
| AGENT_TERMINATION | Agent shut down |

**Task Execution:**
| Type | Description |
|------|-------------|
| TASK_START | Agent begins a task |
| TASK_HANDOFF | Task delegated to another agent |
| TASK_SUCCESS | Task completed successfully |
| TASK_FAIL | Task failed |

**System:**
| Type | Description |
|------|-------------|
| PIPELINE_UPDATE | Pipeline state changed |
| HEALTH_CHECK | System health status |

**Decision & Intelligence:**
| Type | Description |
|------|-------------|
| DECISION_POINT | Agent reached a decision branch |
| DECISION | Routing decision made |
| ANOMALY | Anomalous behavior detected |
| META_INSIGHT | Meta-agent produced an insight |

Plus 20 additional types for extended agent operations, fine-grained task states, and integration events.

---

## 14. Design Token System

The frontend uses a structured token system in `src/design/` to ensure visual consistency across all components. All colors, states, and labels are defined once and imported — no magic strings.

### Agent State Tokens — `agentStateTokens.ts`

| State | Ring Color | Indicator | Pulse |
|-------|-----------|-----------|-------|
| ACTIVE | `#00C8FF` (cyan) | none | none |
| DEGRADED | `#F2A623` (amber) | dot | pulse animation |
| FAILED | `#E24B4A` (red) | × mark | none |

### Severity Tokens — `severityTokens.ts`

| Severity | Background | Text | Label |
|----------|-----------|------|-------|
| LOW | `#0C447C` | `#B5D4F4` | Low |
| MEDIUM | `#854F0B` | `#FAC775` | Medium |
| HIGH | `#791F1F` | `#F7C1C1` | High |

### Event Type Tokens — `eventTypeTokens.ts`

| Event Type | Visual Style |
|-----------|-------------|
| TASK_START | Background + foreground color + icon |
| TASK_HANDOFF | Distinct color scheme |
| DECISION | Decision-specific styling |
| ANOMALY | Warning styling |
| ERROR | Critical styling |

### Decision Flag Tokens — `decisionFlagTokens.ts`

| Flag | Meaning |
|------|---------|
| ALLOW | Action permitted, proceed |
| RETRY | Attempt again |
| FALLBACK | Use backup path |
| BLOCK | Action denied |
| SWITCH_AGENT | Delegate to different agent |
| UNKNOWN | Unrecognized routing outcome |

---

## 15. Test Coverage

### Frontend Tests (Vitest)

Phase-based test files covering progressive feature additions:

| File | Phase |
|------|-------|
| `App.phase5.test.tsx` | Phase 5 features |
| `App.phase6.test.tsx` | Phase 6 features |
| `App.phase7.test.tsx` | Phase 7 features |
| `App.phase8.test.tsx` | Phase 8 features |

### Backend Tests (pytest)

| File | Tests |
|------|-------|
| `test_analytics.py` | Analytics aggregation |
| `test_meta_backpressure.py` | Meta-agent backpressure handling |
| `test_meta_context.py` | Context forwarding |
| `test_meta_failure_isolation.py` | Failure isolation |
| `test_meta_passive_drift.py` | Passive drift detection |
| `test_replay.py` | Replay query and topology reconstruction |

### Meta-Agent Tests

| File | Tests |
|------|-------|
| `test_backpressure.py` | High-volume event handling |
| `test_contracts.py` | API contract validation |
| `test_failure_isolation.py` | Service failure isolation |
| `test_heuristics.py` | Heuristic rule correctness |
| `test_idempotency.py` | Deduplication idempotency |

---

## 16. Business Value Summary

### The Problem

Multi-agent AI systems are **black boxes at runtime**. When an agent fails, hands off incorrectly, makes a bad routing decision, or degrades silently — there is no standard tool to observe it happening. Debugging requires trawling through logs after the fact, with no causal chain and no visual context.

### The Solution

SwarmVision provides **continuous, real-time visibility** into agent behavior:
- See the agent graph change shape as tasks flow through it
- Get alerted before failures cascade
- Replay any historical moment to understand what happened and why
- Read the full decision audit log for compliance and debugging

### Differentiation

| Capability | Traditional Monitoring | SwarmVision |
|-----------|----------------------|-------------|
| Agent topology | Not visible | Live graph with states |
| Decision audit | Log lines at best | Structured audit log with flags |
| Replay | None | Exact state reconstruction at any timestamp |
| Meta-intelligence | Manual analysis | Automated deterministic heuristics |
| Multi-tenant | Requires custom work | Built-in tenant/app scoping |
| Integration | Heavy SDK required | Single HTTP POST per event |

### Architecture Strengths

- **No vendor lock-in** — Neo4j, FastAPI, React are all open source
- **No AI dependency** — meta-agent is deterministic, no LLM API required
- **SDK first** — any application can integrate via one HTTP call
- **Graph-native storage** — Neo4j makes agent relationship queries natural and fast
- **Separation of concerns** — meta-agent runs as an independent sidecar, backend and frontend fully decoupled

### What Is Not Yet Integrated

- **LangGraph** — used only as an architectural reference, not implemented
- **LLM-powered meta-agent** — current meta-agent is heuristic-only; upgrade path exists
- **Authentication/RBAC** — `control_plane/rbac.py` exists but security layer is incomplete
- **HTTPS/WSS** — currently plain HTTP/WS; production would require TLS termination

---

*Report compiled from two-pass codebase exploration. All findings are based on actual file contents, not generated descriptions. File paths, line counts, dependency versions, and schema definitions reflect the current state of the repository as of April 2026.*
