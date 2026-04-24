# SwarmVision Project Walkthrough — 2026-04-24

**Author:** Senior Staff Engineer / Product Auditor (external engagement)
**Audit date:** 2026-04-24
**System state:** Backend running at `localhost:8012`, Neo4j connected, meta-agent sidecar NOT running independently (port 9001 refused)
**Repository root:** `swarmvision-graph/`

---

## Scope and Limits of This Document

This document covers the complete SwarmVision codebase as it exists on 2026-04-24. It is a primary-source audit: every significant claim is tied to a specific file, line number, runtime observation, or explicitly tagged `[INFERRED]` or `[ABSENT]` where source evidence could not be found.

The audit covers:
- All planning and prompt documents in `docs/`
- The meta-agent sidecar service in `services/meta-agent/`
- The FastAPI backend in `apps/backend/`
- The React/TypeScript frontend in `apps/frontend/`
- Docker Compose and CI infrastructure
- A live WebSocket capture session

What this document does not cover:
- Performance benchmarks (no load testing was run)
- Security penetration testing
- Competitive pricing analysis beyond publicly available information

---

## Executive Summary

SwarmVision is a real-time observability platform for multi-agent AI systems. Its core value proposition is making agent topologies, failure cascades, and decision quality visible through a live graph dashboard backed by WebSocket streaming and heuristic pattern detection.

**What is working:** The backend pipeline is complete and running. Events flow from the pulse emitter through enrichment, Neo4j persistence, WebSocket broadcast, and into the frontend store. The meta-agent sidecar is well-architected and fully tested. Replay endpoints are implemented against Neo4j. The CI passive-drift guard is real and enforces architectural constraints.

**What is structurally absent or broken:** The `apps/` and `packages/` directories — which the architecture documentation treats as fully populated — are hidden directories. The `apps/backend/` and `apps/frontend/` trees are present but hidden from standard directory listings (confirmed: Mode `d--h--` in directory listing). The frontend has no Zustand dependency in `package.json` despite the architecture document describing a Zustand store (`useObservabilityStore.ts`). The meta-agent sidecar is not running on port 9001 in the current environment. The business documents describe capabilities (multi-tenant RBAC enforcement, JWT authentication, SOC 2 compliance, "100+ agents tested") that have no implementation evidence in the codebase.

**Readiness rating:** The backend core (event pipeline, WebSocket, Neo4j persistence, meta-context dispatch) is approximately **65% shippable** as a proof of concept for a single-tenant demo. As a commercial product matching the pitch deck's claims, it is **15-20% complete**. The gap between the marketing narrative and the technical reality is significant and needs to be addressed before any customer pilot.

---

## Layer 1 — The Plan

### 1.1 Per-Prompt Extraction

**`docs/prompts/PROMPT_META-02_v3_CALIBRATED.md`**

This is the implementation prompt for the MetaInsightsPanel UI component. It is a well-written calibration document that explicitly acknowledges two errors in the previous version (v2): an incorrect WebSocket channel name (`/stream/insights` vs. the actual `events` channel), and an incompatible layout specification (5th grid quadrant vs. bottom drawer). The prompt correctly specifies that insights arrive via WebSocket with `event_type === "META_INSIGHT"` on the existing `events` channel, and that `useMetaInsightEvents()` from the store is the correct data source. It includes a complete testing contract.

This is a good prompt artifact. It demonstrates that the team iterated on spec errors before implementation, which is mature practice.

**`docs/ARCHITECTURE.md`**

Documents a four-workspace monorepo: frontend, backend, meta-agent sidecar, and shared-types. As of 2026-04-24, `apps/frontend/`, `apps/backend/`, `services/meta-agent/`, and `packages/` all exist, though `packages/` is empty and the hidden-directory issue means `apps/` subdirectories were not visible in the initial listing. The architecture document is largely accurate to the actual implementation but documents the WebSocket port as `8000` while the running service is on `8012`.

No `docs/PHASE2_GUIDE.md` or `docs/PHASE2_SUMMARY.md` exist — these are [ABSENT].

**`SWARMVISION_FULL_REPORT.md`**

A comprehensive internal report that documents the expected complete monorepo structure including `apps/backend/app/clients/meta_client.py`, `apps/backend/app/observability/meta_context.py`, and various other files. This document was compiled from a previous exploration session. The described structures match the actual files found in `apps/backend/`. The report is accurate as a reference but should not be confused with verified current state since it was produced by autonomous execution and not independently verified until now.

**`PHASE-META-COMPLETE.md`**

Deliverable checklist for the meta-agent sidecar implementation. All 12 deliverables claim completion. On audit: 10 of 12 are confirmed by source code. Deliverable 11 ("Non-blocking confirmation") and Deliverable 12 ("Main system independence") cite the `fire_and_forget_meta()` pattern in `apps/backend/app/clients/meta_client.py` — this code exists and implements the pattern correctly (confirmed at `apps/backend/app/clients/meta_client.py:124-136`).

### 1.2 Synthesized Intent

From reading all planning documents together, the intended product is:

1. A WebSocket-driven dashboard that visualizes agent topology and streams events in real-time
2. A passive sidecar that observes event windows and produces heuristic pattern insights without blocking the main system
3. A Neo4j graph store that enables both real-time persistence and historical replay
4. A 4-channel WebSocket architecture (events, metrics, alerts, agents) for separation of concerns
5. A frontend with a 2x2 grid layout (graph + alerts + timeline + decisions) plus a collapsible meta-insights drawer

### 1.3 The Customer-Facing Promise

The `BUSINESS_OVERVIEW.md` and `EXECUTIVE_PITCH.md` promise:

- "Sub-second alert detection latency"
- "100+ agents per system, tested at 1000+"
- "10,000+ events per second with compression"
- "60fps dashboard render time"
- "Multi-tenant isolation by tenant_id from JWT token"
- "SOC 2 ready (full audit trail, no PII exposure controls)"
- "Export traces" capability
- "Custom alerts" capability
- "Auto-configured — < 5 minutes to production"

**What a customer would experience here:** A well-designed pitch with concrete numbers that have no backing measurement or implementation. The performance claims (10K events/sec, 1000+ agents) are not tested, not benchmarked, and not architecture-constrained. The multi-tenant claim depends on JWT which is not implemented. SOC 2 readiness is aspirational. A technical buyer doing due diligence will catch this immediately. A non-technical buyer will feel misled after first contact with the product.

---

## Layer 2 — The Execution

### 2.1 Backend Pipeline

**File:** `apps/backend/app/main.py`

The backend is a FastAPI application running at port 8012. When a user publishes an event via `POST /events/broadcast`, here is the exact step-by-step execution path:

**Step 1:** The request body is parsed into an `Event` Pydantic model (`apps/backend/app/schemas/event.py`). The model provides basic validation.

**Step 2:** `publish_event(payload)` is called (`main.py:141`). This is the central orchestration function.

**Step 3:** `begin_operation_step("publish_event")` updates the thread-local trace context. This is instrumentation only, not blocking.

**Step 4:** `control_plane.evaluate(...)` is called. At `apps/backend/app/control_plane/control_plane.py:11`, `ControlPlane.evaluate()` is a complete no-op that always returns `{"action": "ALLOW", "modifications": None}`. This is documented as a "passive control-plane stub." The RBAC file (`rbac.py`) defines role permissions but they are never enforced in any route or middleware.

**Step 5:** `enrich_event_payload(event_payload)` is called (`apps/backend/app/observability/envelope.py:18`). This function adds the following fields: `event_id` (UUID), `id` (same), `event_type`, `type`, `timestamp`, `agent_id` (coalesced from payload fields), `trace_id` (from thread-local trace context), `session_id`, `step_id`, `parent_step`, `latency_ms`, `input_ref`, `output_ref`, `confidence_score`, `decision_flag`, `previous_event_id`, `parent_event_id`, `step_index`, and a `context` dict mirroring those fields.

**Step 6:** A decision event is published for the control plane evaluation result via `publish_decision("control_plane_evaluate", ...)`. This creates a DECISION-type event in Neo4j and the `recent_decisions` deque.

**Step 7:** `latency_ms` is set from the elapsed time since step 2 started.

**Step 8:** `graph_repository.persist_event(enriched)` is called via `run_in_threadpool` — this is the Neo4j write. The repository's `_persist_event_tx` creates `:Event` nodes, `:Trace` nodes, `:PART_OF` edges, `:NEXT` edges (linking to previous events), `:Agent` nodes, `:PARTICIPATED_IN` edges, and for `TASK_HANDOFF` specifically, `:HANDOFF` edges between agents. This is a well-structured graph schema (`repository.py:160-280`).

**Step 9:** `ws_manager.broadcast(enriched, channel="events")` — the enriched event is serialized to JSON and sent to all connected WebSocket clients on the `events` channel.

**Step 10:** The event is prepended to `recent_events` (a `deque(maxlen=500)`).

**Step 11:** `aggregation_service.ingest_event(enriched)` updates in-memory agent metrics.

**Step 12:** Agent state is updated and potentially persisted to Neo4j.

**Step 13:** Anomaly detection runs if `agent_metric` is available. Anomalies are published to both `alerts` and `events` channels.

**Step 14:** On `TASK_SUCCESS` or `TASK_FAIL`, `_dispatch_meta("trace_complete", trace_id=...)` is called. This builds a `MetaContext` from the last 5 minutes of events/decisions/anomalies and fires a non-blocking HTTP POST to the meta-agent sidecar.

**Step 15:** `log_decision("retry_logic", ...)` is called — this always logs a pass-through decision with `retry_applied: False`. This creates a DECISION event for every single published event, which is currently generating noise: every TASK_SUCCESS produces a "retry_logic" DECISION event broadcast to the events channel (confirmed in the live capture below).

**What `_handle_meta_insights` does with a returned insight:**

When the meta-agent returns insights, `_handle_meta_insights(insights, context)` is called (`main.py:95-125`):
1. Iterates up to 50 insights
2. Wraps each insight in an envelope with `event_type: "META_INSIGHT"`, sets `source: "meta-agent"`, `decision_flag: "PASSIVE"`, and embeds the full insight as `payload`
3. Calls `enrich_event_payload()` — adds standard trace context fields
4. Persists to Neo4j via `graph_repository.persist_event(enriched)`
5. Prepends to `recent_events` deque
6. Broadcasts to `ws_manager` on the `events` channel (not a separate channel)

The insight arrives at the frontend as a normal event on the `events` WebSocket with `event_type === "META_INSIGHT"`.

**How replay works end-to-end:**

Three replay endpoints exist: `GET /replay/events`, `GET /replay/topology`, `GET /replay/range`.

For `/replay/events`: Accepts `from`/`to` timestamp parameters and optional `tenant_id`/`app_id`. Calls `graph_repository.get_events_between(from_dt, to_dt, tenant_id, app_id)`, which runs a Neo4j `MATCH (e:Event) WHERE e.timestamp >= ... AND e.timestamp <= ...` query filtered by tenant and app if provided. Returns a list of `ReplayEvent` objects.

For `/replay/topology`: Accepts a single `timestamp`. Fetches all events up to that timestamp via `get_events_until()`, then calls `build_topology_snapshot(events, target_time)` from `apps/backend/app/neo4j/replay.py`. This function reconstructs agent nodes and handoff edges from the event sequence, producing a point-in-time topology snapshot.

For `/replay/range`: Combines both — returns events list plus topology snapshot at range end.

The replay system is architecturally sound. The frontend's integration with these endpoints is through the `SystemGraphPanel` which accepts `tenantId` and `appId` props and a `disconnected` state, but the actual replay controls (`ReplayTimeline.tsx`, `ReplayControls.tsx`) exist in the component tree. How deeply the frontend consumes these REST endpoints was not fully confirmed from the components read, but the infrastructure exists on both sides.

**What a customer would experience here:** If they connect via `POST /events/broadcast`, events flow, persist, and appear in the dashboard. Every event additionally produces a "retry_logic" DECISION event that will clutter the Decision Log panel. The control plane evaluation always returns ALLOW — there is no actual policy evaluation. Replay works against Neo4j but requires tenant_id/app_id filters to be useful in multi-tenant scenarios (which are not enforced at ingestion).

### 2.2 Meta Agent Sidecar

**Directory:** `services/meta-agent/`

The meta-agent is a separate FastAPI service on port 9001. It is NOT running in the current environment (port 9001 connection refused; port 8012 responds normally). In Docker Compose, it would be launched alongside the backend.

**Architecture:** The sidecar is passive-only by structural design — there is no HTTP client in the sidecar codebase, only an inbound route. The CI guard in `.github/workflows/meta-passive-drift.yml` enforces this statically on every PR and push to main/master.

**The five heuristics** (`services/meta-agent/app/services/heuristics.py`):

**Heuristic 1 — Bottleneck Detection (`detect_bottlenecks`, line 63):**
Finds agents that appear in at least `BOTTLENECK_MIN_TRACE_COUNT` (default: 3) traces where `duration_ms > BOTTLENECK_LATENCY_P95_MS` (default: 2000ms) AND the agent is in DEGRADED or FAILED state. The severity-and-confidence logic scales with how many traces exceed the threshold. Evidence is the set of matching decision IDs.

Assessment: This heuristic is useful but has a significant logic coupling issue. It finds "slow traces" by checking duration against a threshold, then finds decisions for those traces that are attributed to the agent. But it requires the agent to already be in DEGRADED/FAILED state — so it will only fire when there is already a known degradation signal. It will not catch early-stage bottlenecks where an agent is technically ACTIVE but driving slow traces. It is also dependent on `context.decisions` having agent_id populated for the relevant traces, which depends on the enrichment pipeline correctly attributing decisions to agents.

**Heuristic 2 — Repeated Failure (`detect_repeated_failure`, line 103):**
Groups anomalies by type string (extracted from `payload.type` or `payload.anomaly_type`). If a type appears at least `REPEATED_FAILURE_MIN_COUNT` (default: 3) times within a `REPEATED_FAILURE_WINDOW_SECONDS` (default: 300s) sliding window, emits a REPEATED_FAILURE insight.

Assessment: This is the most practically useful heuristic. Repeated anomalies of the same type within a 5-minute window is a clear signal. The type extraction from payload is fragile — it checks `payload.get('type') or payload.get('anomaly_type')` which means the signal depends on the emitter using one of these two specific field names. A custom anomaly with `payload.error_code` would not group correctly.

**Heuristic 3 — Decision Pattern (`detect_decision_pattern`, line 143):**
Tracks decision flags FALLBACK, BLOCK, and RETRY. For each (agent_id, flag) pair, if at least `DECISION_PATTERN_MIN_COUNT` (default: 3) occur within `DECISION_PATTERN_WINDOW_SECONDS` (default: 300s), emits an insight.

Assessment: The intent is good. However, note that the backend's `publish_event` function generates a "retry_logic" DECISION event for every single event processed, always with `decision_flag: None`. This means the decision stream is populated largely with these system-generated no-ops, not with semantic agent decisions. The heuristic only tracks flags in `{FALLBACK, BLOCK, RETRY}`, so the noise events with `None` flags will not trigger false positives. But the signal density of real FALLBACK/BLOCK/RETRY decisions in a typical system will be low, meaning this heuristic will rarely fire against real-world data unless agents explicitly emit decision events with these flags.

**Heuristic 4 — Anomaly Correlation (`detect_anomaly_correlation`, line 184):**
For each decision that has a non-null `decision_flag`, looks for anomalies that occur within `ANOMALY_CORRELATION_WINDOW_SECONDS` (default: 120s) after the decision. If the anomaly rate exceeds `ANOMALY_SPIKE_RATE_PER_MIN` (default: 10/min), emits a correlation insight.

Assessment: The threshold of 10 anomalies per minute is high. In practice, a system generating 10 anomalies per minute is already in clear distress, and a human would notice without the heuristic. More useful would be relative spikes (e.g., 3x baseline rate). The correlation window of 120 seconds is also generous — a causal relationship over 2 minutes is weak. This heuristic will produce false positives in any high-traffic system where decisions and anomalies are both frequent and may coincide by chance.

**Heuristic 5 — Load Risk (`detect_load_risk`, line 229):**
Fires when ALL THREE of these conditions are met simultaneously: trace count >= 50, p95 latency > 3000ms, and >= 2 agents in DEGRADED state. Always emits HIGH severity with fixed confidence 0.86.

Assessment: The triple conjunction is good — each condition alone is weak, the combination is genuinely high-signal. However, the fixed confidence of 0.86 is arbitrary. The p95 calculation (`quantiles(durations, n=100, method='inclusive')[94]`) is correct Python statistics. The hard-coded confidence value is the main weakness — it should scale with how far each condition exceeds its threshold.

**Overall heuristic assessment:** The five heuristics cover the right conceptual territory. The implementations are deterministic, well-bounded (all have timeout handling in `analyzer.py`), and tested. The weaknesses are: dependency on specific payload field names, the bottleneck heuristic requiring pre-existing degradation signals, and the anomaly correlation threshold being too high for early warning. For a v1, this is acceptable. For production deployment, threshold calibration against real agent systems is essential.

**What a customer would experience here:** If their agents emit events with the standard schema, the meta-agent will run heuristics and surface bottlenecks, repeated failures, decision anomalies, and load risks within the 5-minute sliding window. The insights arrive in the frontend MetaInsightsPanel as META_INSIGHT events on the events WebSocket channel. The quality of insights depends entirely on the quality and structure of the events the customer's agents emit. The experience depends heavily on whether the meta-agent is running — in the current environment, it is not.

The dedup mechanism (`services/meta-agent/app/services/dedup.py`) is a notable engineering strength. The SHA-256 fingerprint over `(category, trace_id, agent_id, sorted evidence IDs, window_bucket)` ensures that the same pattern detected in overlapping 5-minute windows (which happens at 60-second periodic dispatch intervals) does not produce duplicate insights. The 1-minute window bucket quantization (`replace(second=0, microsecond=0)`) means insights are deduplicated within the same minute. This is correct and will prevent alert fatigue from repeated identical insights.

### 2.3 Frontend Store and Selectors

**File:** `apps/frontend/src/store/useObservabilityStore.ts`

The store uses `useSyncExternalStore` — not Zustand. The `package.json` confirms there is no `zustand` dependency. The architecture document incorrectly describes it as Zustand. This is a discrepancy but not a bug — `useSyncExternalStore` is React's built-in external store subscription hook and is appropriate for this pattern.

The store holds: `events` (Map by event_id), `eventOrder` (insertion order array), `metrics`, `alerts`, `agents`, `traces`, `traceOrder`, `decisionEvents` (index of DECISION-type event IDs), `anomalyEvents`, `insightEvents` (index of META_INSIGHT event IDs, capped at 500), `selectedTraceId`, `selectedAgentId`, `selectedEventId`, `mode` (LIVE/PAUSED), `connection`, `graphMode` (OBSERVABILITY/PIPELINE/CINEMATIC), `safeMode`, `graphFilters`, `replay`, `latestMetrics`, `agentSnapshots`, `graphData`.

**`store/selectors.ts`** exports derived selectors including `useMetaInsightEvents()` which resolves `insightEvents` IDs against the `events` map to return `ObservabilityEvent[]`. The `usePausedSnapshot<T>` selector freezes a ref when `mode === "PAUSED"`, preventing re-renders during inspection.

**`store/graphEngine.ts`** manages graph topology state. The `GRAPH_EVENT_TYPES` set (line 66-79) determines which events affect graph state. It includes `AGENT_SPAWN`, `TASK_START`, `TASK_HANDOFF`, `TASK_SUCCESS`, `TASK_FAIL`, `AGENT_MOVE`, `AGENT_TERMINATION`, `DECISION_EVENT`, `DECISION`, `ANOMALY`, `META_INSIGHT`.

What `upsertNode` adds to the graph: A `GraphNode` with fields `id` (agent_id string), `state` ('ACTIVE'/'DEGRADED'/'FAILED'), `lastEventTimestamp` (numeric), `position` (optional `{x, y}`), `decisionCount`, `anomalyCount`, `insightCount`. Nodes are updated on any event that carries an agent_id — including META_INSIGHT events which increment `insightCount`.

**What a customer would experience here:** The store architecture is solid. Events flow in, get indexed by type, and selectors serve the right data to each panel. The discrepancy with the architecture docs (Zustand vs. useSyncExternalStore) is a documentation error that would confuse a new engineer onboarding.

### 2.4 Frontend Graph Pipeline (with Captured Live Event JSON)

**Live events captured at 2026-04-24 19:12:20 UTC via `ws://localhost:8012/ws/events`:**

**Event 1 — Connection handshake:**
```json
{
  "type": "CONNECTION_ESTABLISHED",
  "timestamp": "2026-04-24T19:12:19.889089",
  "message": "Connected to SwarmVision Graph event stream",
  "channel": "events"
}
```

**Event 2 — TASK_SUCCESS (pulse emitter generated):**
```json
{
  "id": "09da2063-43ec-4199-8dd8-a20bbb3017f0",
  "type": "TASK_SUCCESS",
  "timestamp": "2026-04-24T19:12:20.835393",
  "source": "agent",
  "payload": {
    "agent_id": "agent-1",
    "task_id": "94c86f7a",
    "processing_time_ms": 4568
  },
  "event_id": "09da2063-43ec-4199-8dd8-a20bbb3017f0",
  "event_type": "TASK_SUCCESS",
  "agent_id": "agent-1",
  "trace_id": "6ca2326d-9457-4bd2-87bd-308ac0883ac0",
  "session_id": "924693ec-f3da-416f-8f6a-53de28b452c5",
  "step_id": "f35bf3bb-c7f4-4c20-b3c8-ed388c08ca80",
  "parent_step": "4fa27ff4-080a-4d8f-9e61-6505d2dce54c",
  "latency_ms": 13.9,
  "confidence_score": null,
  "decision_flag": "ALLOW",
  "previous_event_id": "fdd2dc05-9bb6-40a0-b108-1c85a1dd2e34",
  "parent_event_id": "fdd2dc05-9bb6-40a0-b108-1c85a1dd2e34",
  "step_index": 8609
}
```

**Event 3 — DECISION (retry_logic system event, auto-generated):**
```json
{
  "event_type": "DECISION",
  "decision_point": "retry_logic",
  "input": {"event_type": "TASK_SUCCESS"},
  "output": {"retry_applied": false},
  "reason": "No retry policy configured (non-breaking pass-through)",
  "trace_id": "6ca2326d-9457-4bd2-87bd-308ac0883ac0",
  "source": "system",
  "event_id": "6f1cf88c-cdcc-496c-a99f-0e17bf37a2b5",
  "timestamp": "2026-04-24T19:12:20.883201",
  "agent_id": null,
  "decision_flag": null,
  "step_index": 8610
}
```

**Observations from the live capture:**

1. The enrichment pipeline is working correctly. Every event gets a UUID event_id, step_index, trace_id, session_id, parent linkage, and latency timing.

2. The step_index is at 8609 for a standard event — this means approximately 8,609 events have been processed since startup, suggesting the pulse emitter has been running for a significant time before this capture.

3. Every TASK_SUCCESS event is followed immediately by a DECISION event with `decision_point: "retry_logic"` and `retry_applied: false`. This is the `log_decision("retry_logic", ...)` call at `main.py:180-187`. This doubles the event volume and populates the Decision Log panel with semantically empty "no retry" entries. This is a significant product UX problem — the Decision Log is described as a key differentiator for "routing decision accountability," but it will be dominated by these system-generated noise entries.

4. The DECISION event has `agent_id: null` — it will not be associated with any agent in the graph.

5. The `decision_flag` on the TASK_SUCCESS event is `"ALLOW"` — this comes from the control plane's always-ALLOW evaluation. Every event will carry `decision_flag: "ALLOW"`, which dilutes the meaning of that field.

**Graph pipeline behavior:** When these events arrive in the frontend:
- Event 2 (TASK_SUCCESS): `graphEngine` will attempt to upsert a node for `agent-1`. Since `event_type: TASK_SUCCESS` is in `GRAPH_EVENT_TYPES`, the node will be updated. The agent appears in the topology with state ACTIVE (unless anomaly detection fires).
- Event 3 (DECISION): agent_id is null, so no node upsert occurs. The event is indexed in `decisionEvents`. It will appear in the DecisionPanel as a row.

**Are the three view modes genuinely different or CSS-only?**

The `GraphMode` type (`useObservabilityStore.ts:7`) has three values: `OBSERVABILITY`, `PIPELINE`, and `CINEMATIC`. The frontend has three component files: `ObservabilityGraph.tsx`, `PipelineGraph.tsx`, and `CinematicGraph.tsx`. The `graphModeAdapters.ts` file and `GraphModeSwitcher.tsx` suggest mode switching exists. Without reading those component implementations in full, the architecture supports distinct views (the three files are separately named and `@xyflow/react` and `react-force-graph-3d` are both in `package.json`). [INFERRED: the three modes are structurally distinct — 2D XYFlow graph vs. 3D force-directed graph vs. a cinematic presentation — not CSS-only.]

**What prevents a clean agent topology:** The pulse emitter (`apps/backend/app/core/pulse.py`) generates events with `agent_id` values from a pool of `agent-1` through `agent-5`. The `TASK_HANDOFF` events include `source_agent_id` and `target_agent_id` which create `HANDOFF` edges in Neo4j. However, the pulse emitter's events are random — the topology will not reflect any real agent architecture. The DECISION events from `retry_logic` have `null` agent_id and do not contribute to topology edges. The `control_plane_evaluate` DECISION also has limited agent_id attribution. The result is a topology with 5 nodes (agent-1 through agent-5) connected by random handoffs, which conveys no semantic information about real agent architecture. This is a demo limitation, not a production one.

**What a customer would experience here:** They will see 5 agents in the graph, random handoffs between them, and a Decision Log flooded with "No retry policy configured" entries. The graph topology is functional but not meaningful. A new developer integrating their own agents would need to suppress the pulse emitter and send real events. The SDK (see 2.6) is supposed to help with this, but it is absent.

### 2.5 Other Frontend Panels

**`components/observability/AlertsPanel.tsx`:** Renders ANOMALY-type events from `anomalyEvents` index. Uses `AlertRow.tsx` (memoized) with 48px row height. Virtualizes at >150 rows via react-window. Collapsible.

**`components/observability/ExecutionTimelinePanel.tsx`:** Shows events filtered to the `selectedTraceId`. Uses `TimelineEventRow.tsx` with 52px rows. Virtualizes at >150 rows.

**`components/observability/DecisionPanel.tsx`:** Shows DECISION-type events from `decisionEvents` index. Has filter bar and search (via `DecisionFilterBar.tsx`). Persists filter state to localStorage. Uses 56px rows with react-window at >150 rows.

**`components/observability/MetaInsightsPanel.tsx`:** Collapsible bottom drawer for META_INSIGHT events. Uses `MetaInsightRow.tsx` (memoized) with 72px rows. Empty state: "No meta insights yet — analysis begins when events start streaming." The component exists and is wired into `App.tsx:202`.

**`components/observability/EventDetailsDrawer.tsx`:** Slide-in panel for selected event detail, showing full JSON payload.

**`components/observability/SystemGraphPanel.tsx`:** Wraps the graph visualization with controls. Accepts `tenantId`, `appId`, `disconnected` props.

**Zustand vs. useSyncExternalStore:** The `package.json` has no `zustand` in dependencies. The store file confirms `useSyncExternalStore`. The documentation claim of "Zustand (observability store)" in `ARCHITECTURE.md` is wrong.

**What a customer would experience here:** The four panels are functional. The primary UX problems are: (1) the Decision Panel is polluted with system-generated retry_logic entries; (2) MetaInsightsPanel will be empty if the meta-agent sidecar is not running; (3) the graph topology is random in demo mode and will require integration work to be meaningful.

### 2.6 SDK

**`packages/sdk/`** — The directory exists and is empty. No SDK files are present.

**`packages/shared-types/`** — The directory exists and is empty. The ARCHITECTURE.md (`line 213`) states this package contains TypeScript interfaces for all event types and enums. Nothing is there.

The architecture document (`ARCHITECTURE.md:213-216`) states: `packages/sdk` contains `EventEmitter` and `WebSocketConnector`. The `SETUP.md` mentions SDK build and type-check commands. `BUSINESS_OVERVIEW.md` describes "Connect your agents to SwarmVision APIs" and the `EXECUTIVE_PITCH.md` shows "5 minutes to connect" as a deployment step. The `SWARMVISION_FULL_REPORT.md` (Section 9) dedicates a section to "SDK and Shared Types" and describes the `EventEmitter` and `WebSocketConnector` in detail.

**There is no SDK and there are no shared types.** [ABSENT]

What the integration would require today without an SDK: A developer would need to discover `POST /events/broadcast` from the architecture docs, construct payloads matching the `Event` Pydantic schema in `apps/backend/app/schemas/event.py`, handle HTTP errors manually, manage trace_id and session_id context across calls, and figure out the right field names (noting the dual-field issue where events carry both `event_type` and `type`, both `event_id` and `id`). The `enrich_event_payload` function in the backend will fill in missing fields, but the caller needs to know which fields are required vs. enriched.

The API contract is well-defined enough that building a minimal SDK is perhaps 2-3 days of engineering work for a Python library. The gap is not the technical complexity of building it — it is that it was not built.

The ARCHITECTURE.md describes `packages/sdk` as containing `WebSocketConnector` — suggesting the intent was also to let agents subscribe to the event stream directly from within their process, not just publish. This is an interesting architectural affordance that would enable bidirectional agent observability: an agent could listen to META_INSIGHT events about its own behavior. This design intent is not realized.

**What a customer would experience here:** They read the pitch, they're told there's an SDK, they open the `packages/sdk` directory, and find nothing. For a developer-led product, this is a severe trust breach at the moment of highest intent. The best-case scenario is that a determined customer writes their own HTTP client. The realistic scenario is that they stop evaluating.

### 2.7 Infrastructure

**`docker-compose.yml`:**

Three services: `swarmvision-backend` (port 8012 exposed to host), `meta-agent` (port 9001 exposed internally only via `expose`), and `neo4j` (both ports internal via `expose`).

The `meta-agent` service has a healthcheck via `curl -f http://localhost:9001/health`. The backend depends on both `neo4j` and `meta-agent`. The `neo4j` service uses `NEO4J_AUTH=${NEO4J_USER:-neo4j}/${NEO4J_PASSWORD}` — note the asymmetry: the variable is `NEO4J_PASSWORD` in the `neo4j` service definition but must be set or the auth line becomes `neo4j/` (empty password), which Neo4j may or may not accept depending on version.

**`.env` / `.env.example`:** The `.env.example` correctly documents that `NEO4J_PASSWORD` and `META_SHARED_SECRET` have no defaults and must be set. The actual `.env` (which should not be committed) contains what appear to be development credentials (`NEO4J_PASSWORD=swarm-dev-password-2026`, `META_SHARED_SECRET=dev-shared-secret-9f3b2c1e4a7d`). This `.env` file exists in the repository root. Whether it is gitignored was not confirmed. If it is not gitignored, these secrets are exposed.

**Is RBAC actually enforced?**

No. `apps/backend/app/control_plane/rbac.py` defines `PERMISSIONS_BY_ROLE` and `has_permission()` but neither function is called anywhere in `main.py` or any middleware. The `ControlPlane.evaluate()` method ignores any role context and always returns ALLOW. There is no JWT validation middleware in the backend. Routes are fully open to any caller.

**Does multi-tenant isolation work at the data level?**

Partially. The Neo4j schema stores `tenant_id` and `app_id` on Event nodes (`repository.py:191`). The replay and analytics endpoints accept `tenant_id` and `app_id` query parameters and pass them to Neo4j queries as filters. However:
1. There is no authentication — any caller can specify any tenant_id.
2. The event ingestion endpoint (`POST /events/broadcast`) does not require or enforce tenant_id. Events without tenant_id get `null` and mix with all tenants in queries that don't filter by tenant.
3. There is no JWT extraction of tenant_id.

Conclusion: multi-tenant data separation in the schema exists but is entirely honor-system. Any caller can read any tenant's data by simply not providing a filter.

**Would the stack boot on a fresh machine?**

Backend prerequisites: Python 3.11, `requirements.txt` installs FastAPI 0.115, uvicorn, pydantic, neo4j driver, httpx, prometheus-client, slowapi, pytest. Running `uvicorn app.main:app --host 0.0.0.0 --port 8012` would start the backend. It would connect to Neo4j at `bolt://localhost:7687` by default — on a fresh machine, this would fail. The backend handles Neo4j failures gracefully (sets `available=False`, continues running). The `pulse_emitter_active` in the health check was confirmed `true` in the live capture, meaning the demo pulse runs without Neo4j.

Meta-agent prerequisites: Python 3.11 + the same requirements stack. Would start but silently disable Neo4j storage.

Frontend prerequisites: Node.js 18+, `npm install`, `npm run dev`. The frontend has all dependencies in `package.json` (React 18, @xyflow/react, react-force-graph-3d, three, react-window). No Zustand is listed (confirming the useSyncExternalStore implementation).

Docker Compose path: would attempt to build `./apps/backend` and `./services/meta-agent` Dockerfiles. The backend Dockerfile is not in the repository listing visible so far — let me note [INFERRED: backend Dockerfile exists at `apps/backend/Dockerfile` given it is referenced in docker-compose.yml and the directory is present].

**`.github/workflows/meta-passive-drift.yml`:**

This CI workflow runs on every PR and push to main/master. It performs three checks:
1. Counts POST routes in `services/meta-agent/app/api/routes.py` — expects exactly 1.
2. Verifies no `@router.put` or `@router.delete` in the meta-agent app.
3. Verifies no references to `swarmvision-backend`, `localhost:8000`, or `/events/broadcast` in the meta-agent code.
4. Verifies `services/meta-agent/app/clients/main_backend_client.py` does not exist.

This is a real, working CI guard. It is currently the only CI workflow in the repository. There is no CI for the backend, frontend, or shared packages.

**What a customer would experience here:** `docker-compose up` would work if the user copies `.env.example` to `.env` and sets passwords. The meta-agent would not communicate with the backend in the default `.env` (because `META_AGENT_ENABLED` defaults to `false` in the backend settings — it requires the docker-compose environment variable `META_AGENT_ENABLED=true` which IS set in the compose file). The frontend has no Docker service defined — it must be run separately.

### 2.8 Dead-Code and Drift Survey

**`apps/backend/app/agents/__init__.py`:** Empty module (`__init__.py` only). The `agents/` package exists but contains no implementation.

**`apps/backend/app/control_plane/control_plane.py`:** Functional stub only (3 lines of logic). The `rbac.py` is dead code — `has_permission()` is never called.

**`apps/backend/app/analytics/service.py`:** Exists and is imported from `main.py`. The analytics endpoints (`/analytics/summary`, `/analytics/failures`, `/analytics/latency`, `/analytics/bottlenecks`) are fully implemented and call `build_*_response()` functions.

**`apps/backend/app/core/settings.py`:** Has `redis_enabled` and `redis_url` settings. The `agent_state_store` is initialized with `redis_url` and `redis_enabled`. Redis support exists at the configuration and connection level, but is disabled by default.

**`main.py:180-187`:** The `log_decision("retry_logic", ...)` call runs after every single event published. This is labeled "non-breaking pass-through" but generates persistent noise in the Decision Log and Neo4j storage. This is either a debugging artifact that was never removed, or an intentional design choice to demonstrate the Decision Log works. In either case, it should be a configuration-gated behavior.

**`services/meta-agent/requirements.txt` line 9:** `slowapi==0.1.9` is listed as a dependency but `slowapi` is not used anywhere in the meta-agent codebase — `LocalRateLimiter` is a hand-rolled implementation. This is dead dependency.

**`packages/sdk/`:** Empty directory. Dead space.

**`packages/shared-types/`:** Empty directory. The SWARMVISION_FULL_REPORT.md describes `packages/shared-types` as containing TypeScript interfaces, but the directory is empty.

**Architecture document port mismatch:** `docs/ARCHITECTURE.md` and `docs/SETUP.md` both reference port 8000 as the backend port. The actual running service is on 8012 (confirmed by live health check). The docker-compose maps `8012:8012`. This discrepancy would cause immediate confusion for a new developer following the setup guide.

---

## Layer 3 — The Product Reality

### 3.1 Onboarding Experience

The onboarding path as documented in `SETUP.md`:

1. Clone the repo.
2. `cd apps/frontend && npm install && npm run dev` — The frontend will start at `http://localhost:5173`.
3. `cd apps/backend && pip install -r requirements.txt && python -m app.main` — SETUP.md says port 8000, but the frontend is configured to connect to `ws://localhost:8012/ws/events` (confirmed in `App.tsx:14`). A developer following SETUP.md will end up with a backend on 8000 and a frontend expecting 8012. The frontend will show disconnected.

This is a broken setup guide. It would fail for a first-time user on step 3.

The correct port is 8012 (used in docker-compose, used in the frontend default WS_URL). The SETUP.md is stale.

**What would a customer experience trying to onboard:**

Step 1: Clone — OK.
Step 2: Frontend starts — OK.
Step 3: Backend starts on 8000 per SETUP.md, frontend expects 8012. Disconnect banner appears.
Step 4: User checks SETUP.md's troubleshooting section — it says "Ensure backend is running on http://localhost:8000." This contradicts the frontend config.
Step 5: User would need to discover the port discrepancy by reading `App.tsx` or `docker-compose.yml`. This is a 10-30 minute confusion tax for a technical user, and a show-stopper for a non-technical one.

### 3.2 The Five-Minute Demo Test

**The pitch says:** "Open dashboard → Auto-connects to system → See live agents → Spot anomalies → Click an alert → Drill into full trace + context. Under 2 minutes to value."

**What actually happens:**

1. Dashboard connects. The 4 channel pills show CONNECTED.
2. Events stream in — agent-1 through agent-5 appear in the graph.
3. No alerts appear in the AlertsPanel (alerts require ANOMALY events; anomaly detection fires when an agent's failure rate exceeds 10% or latency spikes 1.5x baseline — which the random pulse emitter eventually produces, but not immediately).
4. The Decision Panel fills with "retry_logic — No retry policy configured" entries.
5. The Execution Timeline is empty until a trace is selected.
6. MetaInsightsPanel shows "No meta insights yet" because the meta-agent is not running.

**Time to first meaningful insight: probably 2-5 minutes before an anomaly appears in the alerts panel, assuming the pulse emitter runs long enough to trigger the failure rate threshold.**

The five-minute demo, as scripted in the Executive Pitch appendix, references clicking a "bottleneck alert" and seeing a "full trace with JSON context." This requires: (1) an anomaly to have fired, (2) the anomaly to have been correlated with a trace, (3) the meta-agent to be running and returning insights. In the current state, none of these three conditions are reliably met in a cold demo.

### 3.3 Production Deployment Check

**Is it production-deployable today?**

For a single-tenant development deployment: Yes, with caveats.
- Run `cp .env.example .env`, set passwords, run `docker-compose up`.
- The backend will start, Neo4j will initialize, events will flow.
- The meta-agent will run but insights won't return to the frontend reliably because the `_handle_meta_insights` callback depends on the meta-agent returning insights synchronously in the HTTP response, but the call is fire-and-forget in `fire_and_forget_meta()`.

Wait — this is worth examining precisely. `fire_and_forget_meta(context, on_insights=_handle_meta_insights)` is called at `main.py:138`. In `meta_client.py:124-136`, `fire_and_forget_meta` creates an asyncio task via `asyncio.create_task(dispatch_to_meta(context, on_insights=on_insights))`. The `dispatch_to_meta` function at line 81-121 does make an HTTP POST to the meta-agent, awaits the response, and if `on_insights` is provided and insights are returned, calls `await maybe_coro` (line 115). So `_handle_meta_insights` WILL be called — the insight flow is: backend fires task → task POSTs to meta-agent → meta-agent responds with insights → backend task calls `_handle_meta_insights` → insights are persisted and broadcast. This is correct and will work when the meta-agent is running.

For enterprise/production: Not deployable without addressing authentication (no JWT), RBAC (not enforced), multi-tenant isolation (honor-system), and the SDK gap.

**What a customer would experience:** A demo environment that works for a single team with the pulse emitter generating fake events. Not a production system.

### 3.4 Competitive Reality

SwarmVision positions against Langfuse, LangSmith, and Arize Phoenix in the LLM observability space, and against generic APM tools like Datadog in the description at `BUSINESS_OVERVIEW.md:263-276`.

**What SwarmVision has that competitors lack:**
- A live graph visualization of agent topology (most LLM observability tools focus on linear trace visualization)
- The passive meta-agent concept: a separate microservice that observes events and surfaces heuristic patterns without being in the critical path
- Real-time WebSocket streaming (Langfuse and LangSmith are primarily async/polling)
- Decision audit log as a first-class UI panel

**What competitors have that SwarmVision lacks:**
- SDK/instrumentation libraries (LangSmith and Langfuse have Python and JS SDKs with automatic LLM call tracing)
- Cost tracking (LangSmith tracks token usage and cost)
- Prompt versioning (Langfuse has prompt management)
- Real production deployments and battle-tested reliability
- Authentication and multi-tenant security

**Is the passive meta-agent concept novel?**

In the LLM observability space: Yes. Langfuse, LangSmith, and Arize Phoenix do not have an equivalent passive sidecar that runs windowed heuristic analysis over event streams and produces structured pattern insights. The architectural choice to make it passive (fire-and-forget, no blocking of the main path, no control capability) is principled and defensible. The concept is worth pursuing.

However, the execution of the heuristics is basic. The five heuristics are threshold-based counting rules. They will produce useful signal for obvious failure modes but will miss subtle patterns that require cross-window correlation, baselining, or ML. The pitch deck's claim of "Automatic pattern detection — 5 categories" is accurate but undersells the threshold-based nature of the implementation.

**SwarmVision's unique wedge:** The live graph topology visualization combined with real-time event streaming and the passive analysis sidecar is a genuinely different user experience from text-trace tools. The "control tower" metaphor is apt. The product needs to deliver on that metaphor end-to-end: the graph needs to reflect real agent topology, the alerts need to be meaningful, and the Decision Log needs to contain real decisions, not system-generated noise.

### 3.5 The Product Identity Question

There is a fundamental ambiguity in what SwarmVision currently is:

**Path A — Demo system with synthetic data:** The pulse emitter generates random events, the graph shows 5 synthetic agents, the Decision Panel fills with retry_logic no-ops. This is a working visualization demo that shows what the product could look like. It has no integration story for real agents.

**Path B — Integration platform for real agent systems:** The backend exposes `POST /events/broadcast`, has a rich enrichment pipeline, Neo4j storage, replay, and analytics. This path requires an SDK (absent) and clear documentation for integration (SETUP.md is stale).

The product is currently trying to be both, which weakens both. A potential customer evaluating the demo sees the demo data and wonders how to replace it with their data — there's no SDK and no clear integration guide. A potential customer trying to integrate sees a complex system with a broken setup guide and no instrumentation library.

**What a customer would experience here:** Confusion about whether this is a standalone analytics dashboard or an integration platform.

---

## Layer 4 — The Path Forward

### 4.1 Scenario A — Stay the Course

Continue building features: improve heuristics, add more graph visualizations, build analytics dashboards. Fix the setup guide. Keep the current architecture.

**Risk:** The core integration gap (no SDK) means no customer can actually connect real agents. More dashboard features on top of synthetic data is aesthetically richer but commercially worthless. The competitive window for observability tooling is narrowing as Langfuse, Arize, and LangSmith all add graph visualization features.

**Realistic outcome:** A good-looking demo platform that generates investor interest but struggles to convert to paying customers because integration requires custom engineering work. Suitable for raising a seed round with a technical co-founder who can build the SDK and integration layer.

### 4.2 Scenario B — Narrow the Product

Decide: SwarmVision is a passive analysis layer, not a dashboard. Stop building frontend panels. Focus on making the meta-agent sidecar installable as a library with zero configuration, shipping insights to existing Datadog/Grafana/PagerDuty destinations. Deprecate the custom dashboard in favor of a Grafana plugin or Slack integration.

**Risk:** Abandons the visual differentiation that makes SwarmVision interesting. The graph topology view is genuinely novel.

**Realistic outcome:** Higher integration velocity (easier to add a sidecar library than to replace a monitoring stack), more immediate customer value. Loss of the "beautiful dashboard" wedge. Suitable if the team is small and wants to get to revenue faster.

### 4.3 Scenario C — Structural Rework

Address the four structural gaps in parallel: (1) build the SDK, (2) fix authentication, (3) silence the retry_logic noise events, (4) update SETUP.md to reflect port 8012. Then run a real alpha with one customer who has a multi-agent system in production.

**Risk:** Higher investment of engineering time before revenue. But each of the four gaps is individually tractable.

**Realistic outcome:** A product that matches the pitch deck in 4-6 weeks of focused engineering. The hardest part is finding the alpha customer.

### 4.4 Recommended Scenario

**Scenario C with elements of B.**

The core backend and meta-agent are solid. Don't rework them. Do the following in strict priority order:

1. Kill the `log_decision("retry_logic", ...)` call from `publish_event` or gate it behind `META_DEBUG=True`. This single change makes the Decision Log useful.
2. Fix the SETUP.md port (8000 → 8012).
3. Build a minimal Python SDK: a class with `track_event(event_type, agent_id, trace_id, payload)` that POSTs to `/events/broadcast`. 200 lines of code. Ship it.
4. Ship a working Docker Compose demo with the frontend served by a static web server (nginx or Caddy). The frontend currently requires Node dev server — add a frontend Dockerfile.
5. Build one real integration with one real agent framework (LangGraph or CrewAI). Get one customer to run it in staging.

Only after those five steps: add JWT authentication, enforce tenant isolation, and address the pitch deck's enterprise-grade claims.

### 4.5 First Three Moves

**Move 1 (today):** Remove or gate the `log_decision("retry_logic", ...)` call at `apps/backend/app/main.py:180-187`. This is a one-line change. It immediately makes the Decision Log meaningful.

**Move 2 (this week):** Build a minimal Python SDK. Create `packages/sdk/python/swarmvision/__init__.py` with a `SwarmVisionClient` class that wraps `POST /events/broadcast`. Include a `track_agent_spawn`, `track_task_start`, `track_task_success`, `track_task_fail`, `track_handoff`, and `track_decision` convenience method. Publish to PyPI. This creates the integration story.

**Move 3 (this month):** Write a working integration guide for one specific framework (LangGraph is the obvious choice given the target market). Instrument a sample LangGraph pipeline, capture real agent topology events, and replace the pulse emitter with real data in the demo. Record a screen capture of this. This is the actual five-minute demo.

---

## Verdict

SwarmVision has a real product concept — real-time graph visualization of multi-agent AI systems with passive heuristic analysis — that is genuinely differentiated from existing observability tools. The backend engineering is solid, the meta-agent sidecar is well-designed, and the event pipeline is correct. The live capture confirms the system works.

The gap between what works and what is claimed is significant. The marketing pitch describes JWT authentication, SOC 2 readiness, multi-tenant isolation, tested scalability to 1000+ agents, and an SDK. None of these exist. The SETUP.md has the wrong port. There is no SDK.

The product is approximately 65% complete as a single-tenant demo environment and 15-20% complete as a commercial platform.

The most dangerous thing about the current state is not the technical gaps — they are all fixable — it is the pitch narrative that describes a production-grade enterprise platform when the reality is a well-engineered prototype. Showing this to a sophisticated technical buyer without qualification will damage credibility. Showing it to a non-technical buyer as-is, with the current marketing language, would be misleading.

The honest path forward is to align the narrative to the reality for the next 60 days — call it a "developer preview," state that authentication and multi-tenancy are on the roadmap, and focus on making the integration story (SDK + one real framework integration) work. The visual differentiation is real and worth protecting. The technical foundation is strong enough to build on. But the foundation and the pitch are currently not in the same building.

Shipping the five changes in Section 4.5 would move the readiness rating from 15% commercial to approximately 45% commercial. That is achievable in 4-6 weeks by a single engineer. At 45%, the product would be ready for a qualified, well-scoped technical pilot.

---

## Appendix A — Files Consulted

| File | Status | Notes |
|---|---|---|
| `docs/prompts/PROMPT_META-02_v3_CALIBRATED.md` | Read | Complete |
| `docs/ARCHITECTURE.md` | Read | Port discrepancy (8000 vs 8012); Zustand claim incorrect |
| `docs/SETUP.md` | Read | Wrong port (8000), stale |
| `docs/PHASE2_GUIDE.md` | [ABSENT] | Not found |
| `docs/PHASE2_SUMMARY.md` | [ABSENT] | Not found |
| `BUSINESS_OVERVIEW.md` | Read | Complete |
| `EXECUTIVE_PITCH.md` | Read | Complete |
| `UI_DESIGN_GUIDE.md` | Read | Complete |
| `SWARMVISION_FULL_REPORT.md` | Read (partial — first 100 lines + sections) | Internal reference doc |
| `PHASE-META-COMPLETE.md` | Read | Complete deliverable checklist |
| `services/meta-agent/app/main.py` | Read | Complete |
| `services/meta-agent/app/api/routes.py` | Read | Complete |
| `services/meta-agent/app/api/middleware.py` | Read | Complete |
| `services/meta-agent/app/core/settings.py` | Read | Complete |
| `services/meta-agent/app/core/thresholds.py` | Read | Complete |
| `services/meta-agent/app/schemas/context.py` | Read | Complete |
| `services/meta-agent/app/schemas/insight.py` | Read | Complete |
| `services/meta-agent/app/services/analyzer.py` | Read | Complete |
| `services/meta-agent/app/services/heuristics.py` | Read | Complete |
| `services/meta-agent/app/services/dedup.py` | Read | Complete |
| `services/meta-agent/app/services/storage.py` | Read | Complete |
| `services/meta-agent/app/services/serializer.py` | Read | Complete |
| `services/meta-agent/app/services/metrics.py` | Read | Complete |
| `services/meta-agent/app/tests/test_contracts.py` | Read | Complete |
| `services/meta-agent/app/tests/test_heuristics.py` | Read | Complete |
| `services/meta-agent/app/tests/test_failure_isolation.py` | Read | Complete |
| `services/meta-agent/app/tests/test_backpressure.py` | Read | Complete |
| `services/meta-agent/app/tests/test_idempotency.py` | Read | Complete |
| `services/meta-agent/app/tests/test_passive_drift.py` | Read | Complete |
| `services/meta-agent/app/tests/test_health.py` | Read | Complete |
| `services/meta-agent/app/tests/test_retention.py` | Read | Complete |
| `services/meta-agent/app/tests/test_security.py` | Read | Complete |
| `services/meta-agent/app/tests/test_timeout.py` | Read | Complete |
| `services/meta-agent/requirements.txt` | Read | Complete; slowapi unused |
| `services/meta-agent/Dockerfile` | Read | Complete |
| `services/meta-agent/README.md` | Read | Complete |
| `apps/backend/app/main.py` | Read | Complete (766 lines) |
| `apps/backend/app/clients/meta_client.py` | Read | Complete |
| `apps/backend/app/core/settings.py` | Read | Complete |
| `apps/backend/app/control_plane/control_plane.py` | Read | Complete — stub only |
| `apps/backend/app/control_plane/rbac.py` | Read | Complete — dead code |
| `apps/backend/app/observability/envelope.py` | Read | Complete |
| `apps/backend/app/observability/meta_context.py` | Read | Complete |
| `apps/backend/app/websocket/manager.py` | Read | Complete |
| `apps/backend/app/core/pulse.py` | Read | Complete |
| `apps/backend/app/neo4j/repository.py` | Read | Partial (lines 1-300) |
| `apps/frontend/src/App.tsx` | Read | Complete |
| `apps/frontend/src/store/useObservabilityStore.ts` | Read | Partial (lines 1-80) |
| `apps/frontend/src/store/graphEngine.ts` | Read | Partial (lines 1-80) |
| `apps/frontend/package.json` | Read | Complete — no Zustand |
| `docker-compose.yml` | Read | Complete |
| `.env.example` | Read | Complete |
| `.env` | Read | Complete — development credentials present |
| `.github/workflows/meta-passive-drift.yml` | Read | Complete |
| `packages/sdk/` | Directory exists, empty | [ABSENT] |
| `packages/shared-types/` | Directory exists, empty | [ABSENT] |
| `apps/backend/app/agents/` | Directory with empty __init__.py | Dead code |

---

## Appendix B — Runtime Evidence Captured

**Backend health check (2026-04-24 19:12 UTC):**

```json
{
  "status": "ok",
  "service": "SwarmVision Graph API",
  "version": "0.1.0",
  "websocket_connections": 4,
  "pulse_emitter_active": true,
  "neo4j": {
    "available": true,
    "enabled": true,
    "message": "Neo4j ready",
    "last_error": null
  }
}
```

The backend is running. Neo4j is connected. The pulse emitter is active (generating synthetic events). 4 WebSocket connections are active (likely the 4 channels the frontend maintains).

**Meta-agent health check:** Connection refused on port 9001. The meta-agent sidecar is not running in the current environment.

**GET /agents (backend):** HTTP 404. The `/agents` route does not exist in `main.py`. The health check confirms agent data comes through the `agents` WebSocket channel, not a REST endpoint.

**WebSocket events captured (`ws://localhost:8012/ws/events`):**

Three events captured (see Section 2.4 for full JSON). Step index 8609 on the first event confirms the system has been running and processing events for an extended period. The enrichment pipeline is confirmed working (event_id, trace_id, session_id, step_id, parent_step, latency_ms all correctly populated). The retry_logic DECISION event is confirmed as a real byproduct of every published event.

---

## Appendix C — Open Questions

1. **SDK gap:** Is there a timeline for building the Python SDK? This is the single most blocking item for customer integration. An SDK stub exists as empty directories, suggesting intent.

2. **Port documentation:** Who updated the port from 8000 to 8012, and when was SETUP.md last updated? This suggests the docs are not being kept in sync with implementation changes.

3. **`.env` in repository:** Is the `.env` file gitignored? If not, the development credentials are in version control. The `.gitignore` file in `apps/backend/` was not read — this should be verified.

4. **Pulse emitter in production:** Is the `EventPulseEmitter` intended to run in production, or only in demo mode? It generates random events that will mix with real agent events and trigger meta-agent analysis of synthetic data. There should be a config flag to disable it.

5. **Frontend Docker image:** Is there a plan to containerize the frontend? The current `docker-compose.yml` has no frontend service. A customer doing `docker-compose up` will see a backend but no UI.

6. **Test coverage:** The meta-agent has comprehensive tests (10+ test files, all passing per the PHASE-META-COMPLETE.md). The backend has a `tests/` directory in `apps/backend/` (seen in directory listing) but no backend tests were read. Are they passing? The frontend has `App.phase5.test.tsx` through `App.phase8.test.tsx` — these phase-labeled test files suggest tests were written for each development phase. Their current state is unknown.

7. **Analytics service gap:** The analytics endpoints (`/analytics/summary`, `/analytics/failures`, etc.) exist in the backend and are implemented. No analytics visualization panel was found in the frontend component list. Is there a plan to surface analytics in the UI?

8. **Replay frontend integration:** The frontend has `ReplayTimeline.tsx` and `ReplayControls.tsx`, and the backend has full replay endpoints. Is the frontend actually calling the replay REST endpoints, or are these component stubs?

9. **Meta-agent in docker-compose vs. development:** The meta-agent has Python 3.11 and 3.14 `__pycache__` directories (both CPython 311 and 314 .pyc files visible). This suggests the sidecar has been run with both Python 3.11 and Python 3.14 at some point. Python 3.14 support in the dependencies (especially FastAPI 0.115, pydantic 2.9.2) should be verified — as of early 2026, some of these packages may not officially support 3.14.

10. **The FOLLOWUPS.md reference:** `ARCHITECTURE.md:293` references `FOLLOWUPS.md` for a P2 item (Rule 1 CI guard — frontend forbidden-pattern grep pending). This file was not found in the repository. Is it tracked elsewhere?
