# SwarmVision Graph — Architecture

**Last updated:** 2026-04-24
**Session:** Autonomous execution session (2026-04-23 → 2026-04-24)

---

## System Overview

SwarmVision Graph is a real-time web-based observability layer that visualizes AI agents and their interactions. The system is a monorepo with four workspaces: a React/TypeScript frontend, a FastAPI backend, a passive meta-agent sidecar, and a shared-types package.

```
┌──────────────────────────────────────────────────────────────┐
│                   Frontend (React + Vite)                     │
│                                                              │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Observability  │  │    Store     │  │  Design/Utils │  │
│  │   Components     │  │  (Zustand)   │  │  (tokens, fmt)│  │
│  └──────────────────┘  └──────────────┘  └───────────────┘  │
│                                ▲                              │
│               WebSocket (4 channels: events, metrics,        │
│               alerts, agents)                                 │
└────────────────────────────────┼─────────────────────────────┘
                                 │
                   ┌─────────────▼──────────┐
                   │   Backend (FastAPI)     │
                   │   app/main.py          │
                   │   ws_manager           │
                   └──────┬─────────┬───────┘
                          │         │
              ┌───────────▼──┐  ┌───▼──────────────────┐
              │ Neo4j        │  │ Meta-Agent Sidecar    │
              │ (graph store)│  │ (passive heuristics)  │
              └──────────────┘  └──────────────────────┘
```

### META_INSIGHT event flow (added this session)

```
Backend _handle_meta_insights()
    │  receives POST /analyze response from meta-agent
    │
    ├─ enriches event with event_id, timestamp
    ├─ ws_manager.broadcast(enriched, channel="events")   ← P0-1 fix
    │
    ▼
Frontend useWebSocket (events channel)
    │
    ▼
useObservabilityStore.addEvent()
    │  event_type === "META_INSIGHT"
    ├─ insightEvents[] index updated (cap: 500)            ← P0-2 fix
    │
    ▼
useMetaInsightEvents() selector
    │
    ▼
MetaInsightsPanel
    ├─ usePausedSnapshot() — freezes on PAUSED mode
    ├─ useMemo cap: newest-first, slice(0, 200)
    ├─ <150 rows: plain map over MetaInsightRow
    └─ ≥150 rows: FixedSizeList (react-window, 72px rows)
```

---

## Frontend (`apps/frontend`)

### Technology Stack

- React 18 + TypeScript
- Vite build system
- Zustand (observability store)
- react-window (FixedSizeList virtualization)
- CSS custom properties (`--ov-*` token system)

### Key Components

**Graph visualisation (`components/graph/`)**
- `SwarmFlowMap.tsx` — 2D SVG live agent topology
- `SwarmFlowMap3D.tsx` — 3D cinematic layer
- `SwarmInspector.tsx` — agent detail inspector
- `TopologyControls.tsx` — zoom/pan controls
- `ViewToggle.tsx` — 2D/3D mode switch

**Observability panels (`components/observability/`)**
- `SystemGraphPanel.tsx` — wraps SwarmFlowMap; main 2×2 grid quadrant
- `AlertsPanel.tsx` — collapsible; alert events; row height 48px; cap 500; virtualised at >150
- `DecisionPanel.tsx` — collapsible; decision events; row height 56px; cap 500; virtualised at >150; filter bar + search; `localStorage` persistence
- `ExecutionTimelinePanel.tsx` — trace-scoped; row height 52px; virtualised at >150
- `MetaInsightsPanel.tsx` — collapsible bottom drawer; META_INSIGHT events; row height 72px; cap 200; virtualised at >150; PAUSED-mode freeze via `usePausedSnapshot`
- `MetaInsightRow.tsx` — `React.memo` row component used by MetaInsightsPanel
- `MetaCategoryBadge.tsx` — colored dot + label from `metaCategoryTokens`
- `EventDetailsDrawer.tsx` — slide-in panel for selected event detail
- `AgentIdChip.tsx`, `SeverityBadge.tsx`, `EmptyStateCard.tsx`, `EventTypePill.tsx`, `GraphLegend.tsx` — shared display atoms
- `AlertRow.tsx`, `DecisionRow.tsx`, `TimelineEventRow.tsx` — memoized panel row components

**WebSocket (`components/websocket/`)**
- `ConnectionStatus.tsx` — live/disconnected indicator
- `EventLog.tsx` — raw event stream display

**Replay (`components/replay/`)**
- `ModeToggle.tsx`, `ReplayTimeline.tsx` — LIVE / PAUSED mode switch

### Store (`store/`)

`useObservabilityStore.ts` (Zustand) is the single source of truth for all frontend state.

| State slice | Purpose |
|---|---|
| `events` | Map of all received events by `event_id` |
| `insightEvents` | Ordered index of META_INSIGHT event IDs (cap 500) |
| `decisionEvents` | Ordered index of DECISION event IDs |
| `anomalyEvents` | Ordered index of ANOMALY event IDs |
| `agents` | Map of agent states |
| `connection` | `CONNECTED` / `DISCONNECTED` / `RECONNECTING` |
| `mode` | `LIVE` / `PAUSED` (toggleMode action) |
| `safeMode` | Soft cap on large result sets |
| `selectedEventId`, `selectedTraceId`, `selectedAgentId` | Inspector focus |

**Key selectors (`store/selectors.ts`)**
- `useMetaInsightEvents()` — resolves `insightEvents` index against `events` map; returns `ObservabilityEvent[]`
- `useDecisionEvents()`, `useAnomalyEvents()`, `useTimelineEvents()`, `useTopologyEvents()`
- `usePausedSnapshot<T>(liveValue, isPaused)` — returns frozen ref when PAUSED
- `useFilteredEvents()`, `useGraphData()`, `useSelectedEvent()`, `useSelectedTraceEvents()`, `useSelectedAgentLatestTrace()`

### Design system (`design/`)

| File | Purpose |
|---|---|
| `agentStateTokens.ts` | Color/label per agent state |
| `eventTypeTokens.ts` | Color/icon per event type |
| `severityTokens.ts` | Color/label for LOW / MEDIUM / HIGH |
| `decisionFlagTokens.ts` | Color/label for decision flags |
| `metaCategoryTokens.ts` | Color/label for 5 META_INSIGHT categories + fallback |

### CSS token system

All colors are referenced via `--ov-*` custom properties defined in `App.css`. No color literals in component CSS. Panel-level CSS is co-located in `ObservabilityPanels.css`.

| Token | Value |
|---|---|
| `--ov-bg` | `#080C14` |
| `--ov-surface` | `#0D1526` |
| `--ov-border` | `#223A5E` |
| `--ov-text-primary` | `#E2F0FF` |
| `--ov-text-secondary` | `#8AA0C0` |

---

## Backend (`apps/backend`)

### Technology Stack

- FastAPI + Uvicorn
- Pydantic event schemas
- Neo4j driver (graph persistence)
- asyncio task management

### Key Modules

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI app, WebSocket channels (events/metrics/alerts/agents), `_handle_meta_insights()` callback |
| `app/websocket/manager.py` | Multi-channel WebSocket broadcast manager |
| `app/schemas/event.py` | Pydantic event models |
| `app/neo4j/repository.py` | Graph database queries (493 lines) |

### META_INSIGHT dispatch (P0-1)

`_handle_meta_insights()` in `main.py` fires after the meta-agent analyzes a batch:
1. Enriches the sidecar response with `event_id` (UUID) and `timestamp`
2. Calls `ws_manager.broadcast(enriched, channel="events")` — all frontend clients on the `events` channel receive the insight
3. Wrapped in `try/except` (silent failure, matching existing error handling pattern)

---

## Meta-Agent Sidecar (`services/meta-agent`)

**Role:** Passive read-only heuristics processor. Receives event batches via `POST /analyze`, applies 5 heuristics, returns META_INSIGHT events. No outbound calls to the main backend.

**Constraints (enforced by `meta-passive-drift.yml` CI):**
- Exactly one POST route: `/analyze`
- No `@router.put`, `@router.delete`
- No references to `swarmvision-backend`, `localhost:8000`, `/events/broadcast`
- `clients/main_backend_client.py` must not exist (deleted in P0-3)

### Heuristics

| # | Name | Trigger |
|---|---|---|
| 1 | Bottleneck detection | Single agent handles >40% of handoffs |
| 2 | Repeated failure | Same agent fails 3× in sliding window |
| 3 | Decision pattern | Decision cluster detected |
| 4 | Anomaly correlation | Anomaly co-occurrence above threshold |
| 5 | Load risk | Event rate spike above baseline |

### Technical properties

- Rate limiting: `LocalRateLimiter` (10 req/s)
- Auth: `X-Meta-Token` header
- Dedup: SHA-256 `[:16]` fingerprint
- Retention: 30 days / 10,000 events
- Payload limit: 512KB
- Meta dispatch: `asyncio.create_task`, `asyncio.Semaphore(16)`, 1s timeout

---

## Shared Packages

**`packages/shared-types`**
TypeScript interfaces for all event types and enums for agent/task states. Extended this session with `DECISION_POINT`, `DECISION`, `ANOMALY`, `META_INSIGHT` in `EventType` enum.

**`packages/sdk`**
- `EventEmitter` — event handling system
- `WebSocketConnector` — WebSocket client

---

## Event Types (full)

| Event | Source | Purpose |
|---|---|---|
| `AGENT_SPAWN` | System | New agent created |
| `AGENT_MOVE` | Agent | Agent moved in pipeline |
| `TASK_START` | Agent | Task execution started |
| `TASK_HANDOFF` | Agent | Task passed to another agent |
| `TASK_SUCCESS` | Agent | Task completed successfully |
| `TASK_FAIL` | Agent | Task failed |
| `PIPELINE_UPDATE` | System | Pipeline state changed |
| `HEALTH_CHECK` | System | System health status |
| `DECISION_POINT` | Agent | Decision node reached |
| `DECISION` | Agent | Decision taken |
| `ANOMALY` | System | Anomaly detected |
| `META_INSIGHT` | Meta-sidecar | Heuristic insight (bottleneck, failure, decision pattern, anomaly correlation, load risk) |

---

## API Endpoints

### REST

```
GET  /health
     Response: { "status": "ok", "service": "...", "version": "..." }

POST /events/broadcast
     Body: Event object
     Response: { "message": "...", "event": {...} }
```

### WebSocket channels

```
WS /ws/events    — all event types including META_INSIGHT
WS /ws/metrics   — metrics snapshots
WS /ws/alerts    — alert events
WS /ws/agents    — agent state updates
```

---

## Virtualization contract (all panels)

All list panels share the same virtualization pattern:

| Panel | Row height | Cap | Threshold |
|---|---|---|---|
| AlertsPanel | 48px | 500 | 150 |
| ExecutionTimelinePanel | 52px | — | 150 |
| DecisionPanel | 56px | 500 | 150 |
| MetaInsightsPanel | 72px | 200 | 150 |

Below threshold: plain `.map()` into DOM. At or above threshold: `react-window` `FixedSizeList`.

---

## Performance considerations

- All panel row components are wrapped in `React.memo`
- Store uses `stabilizeObjectArray` to prevent reference churn on selector re-runs
- `usePausedSnapshot` freezes data refs on mode=PAUSED, preventing renders during replay
- `useRelativeTimeTicker` drives timestamp refresh without per-row timers

---

## Security

- `X-Meta-Token` authentication on meta-agent endpoints
- No hardcoded secrets in `docker-compose.yml` (fixed P1-2; `.env.example` provided)
- `META_SHARED_SECRET` injected via environment variable
- Meta-agent `expose`d internally only (not `ports`-mapped to host)
- Rule 1 CI guard (frontend forbidden-pattern grep) pending — logged in `FOLLOWUPS.md` as P2
