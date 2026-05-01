"""
SwarmVision Graph - Backend API Service

Main FastAPI application with WebSocket support, Neo4j persistence,
and replay endpoints for historical graph state.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from collections import deque
import logging
from time import perf_counter
import asyncio
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.analytics import (
    build_bottlenecks_response,
    build_failures_response,
    build_latency_response,
    build_summary_response,
)
from app.clients import fire_and_forget_meta
from app.clients.meta_client import configure_meta_client
from app.control_plane import ControlPlane
from app.core.pulse import EventPulseEmitter
from app.core.settings import get_settings
from app.neo4j import Neo4jGraphRepository, build_topology_snapshot
from app.observability import (
    AgentStateStore,
    AggregationService,
    begin_operation_step,
    build_agent_panel_payload,
    build_decision_event,
    build_meta_context,
    detect_agent_anomalies,
    enrich_event_payload,
    get_trace_context,
    initialize_trace_context,
    log_decision,
    normalize_error,
    register_event_in_trace,
)
from app.realtime.diagnostic_stream import register_diagnostic_emitter
from app.realtime.runtime_stream import register_runtime_event_emitter
from app.schemas.event import Event
from app.schemas.analytics import (
    AnalyticsBottlenecksResponse,
    AnalyticsFailuresResponse,
    AnalyticsLatencyResponse,
    AnalyticsSummaryResponse,
)
from app.schemas.replay import (
    ReplayAgent,
    ReplayEdge,
    ReplayEvent,
    ReplayEventsResponse,
    ReplayRangeResponse,
    ReplayStatusResponse,
    ReplayTopologyResponse,
)
from app.schemas.observability import (
    AgentMetricResponse,
    AnomalyListResponse,
    AnomalyResponseItem,
    TraceEventItem,
    TracePathResponse,
)
from app.websocket.manager import WebSocketManager
from app.api.v1.scrape import router as scrape_router
from app.api.v1.swarm import router as swarm_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()
ws_manager = WebSocketManager()
graph_repository = Neo4jGraphRepository(settings)
control_plane = ControlPlane()
pulse_emitter = None
aggregation_service = AggregationService()
agent_state_store = AgentStateStore(
    redis_url=settings.redis_url,
    redis_enabled=settings.redis_enabled,
)
metrics_stream_task = None
meta_periodic_task = None
recent_anomalies: deque[dict] = deque(maxlen=200)
recent_events: deque[dict] = deque(maxlen=500)
recent_decisions: deque[dict] = deque(maxlen=300)


async def _handle_meta_insights(insights: list[dict], context) -> None:
    """Persist passive meta insights as observability events."""

    if not insights:
        return

    for insight in insights[:50]:
        try:
            payload = {
                "event_type": "META_INSIGHT",
                "timestamp": insight.get("timestamp") or datetime.utcnow().isoformat(),
                "trace_id": insight.get("trace_id") or context.trace_id,
                "agent_id": insight.get("agent_id"),
                "source": "meta-agent",
                "decision_flag": "PASSIVE",
                "confidence_score": insight.get("confidence"),
                "payload": insight,
                "context": {
                    "trigger": context.trigger,
                    "meta_schema_version": insight.get("schema_version", "1.0"),
                },
            }
            enriched = enrich_event_payload(payload)
            await run_in_threadpool(graph_repository.persist_event, enriched)
            recent_events.appendleft(enriched)
            try:
                await ws_manager.broadcast(enriched, channel="events")
            except Exception as broadcast_exc:
                logger.debug("meta_insight_broadcast_failed=%s", normalize_error(broadcast_exc))
        except Exception as exc:
            logger.debug("meta_insight_persist_failed=%s", normalize_error(exc))


def _dispatch_meta(trigger: str, trace_id: str | None = None) -> None:
    context = build_meta_context(
        recent_events=list(recent_events),
        recent_decisions=list(recent_decisions),
        recent_anomalies=list(recent_anomalies),
        aggregation_service=aggregation_service,
        agent_states=agent_state_store.list_states(),
        trace_id=trace_id,
        trigger=trigger,
    )
    fire_and_forget_meta(context, on_insights=_handle_meta_insights)


async def publish_event(event_payload: dict) -> None:
    """Persist an event when possible and broadcast it to clients."""

    begin_operation_step("publish_event")
    started_at = perf_counter()
    gate = control_plane.evaluate(
        {
            "event_type": event_payload.get("event_type") or event_payload.get("type"),
            "trace_id": get_trace_context().trace_id,
        }
    )
    enriched = enrich_event_payload(event_payload)
    enriched["decision_flag"] = enriched.get("decision_flag") or gate["action"]
    await publish_decision(
        name="control_plane_evaluate",
        decision_input={"event_type": enriched["event_type"]},
        decision_output=gate,
        reason="Passive pre-execution policy check",
        related_event_id=enriched["event_id"],
    )
    enriched["latency_ms"] = round((perf_counter() - started_at) * 1000, 2)
    await run_in_threadpool(graph_repository.persist_event, enriched)
    await ws_manager.broadcast(enriched, channel="events")
    recent_events.appendleft(enriched)
    aggregation_service.ingest_event(enriched)
    agent_metric = aggregation_service.get_agent_metric(enriched.get("agent_id", ""))
    if agent_metric:
        state = await agent_state_store.update_from_metrics(agent_metric, enriched)
        if state:
            await run_in_threadpool(graph_repository.persist_agent_state, state)
        if enriched["event_type"] != "ANOMALY":
            anomalies = detect_agent_anomalies(agent_metric)
            for anomaly in anomalies:
                await publish_anomaly_event(anomaly)
    register_event_in_trace(enriched["event_id"])

    if enriched["event_type"] in {"TASK_SUCCESS", "TASK_FAIL"}:
        _dispatch_meta("trace_complete", trace_id=enriched.get("trace_id"))

    await log_decision(
        name="retry_logic",
        input_data={"event_type": enriched["event_type"]},
        output_decision={"retry_applied": False},
        reason="No retry policy configured (non-breaking pass-through)",
        trace_id=enriched["trace_id"],
        emit_event=publish_event_passthrough,
    )


async def publish_decision(
    name: str,
    decision_input: dict,
    decision_output: dict,
    reason: str,
    related_event_id: str | None = None,
) -> None:
    decision_event = build_decision_event(
        name=name,
        decision_input=decision_input,
        decision_output=decision_output,
        reason=reason,
        related_event_id=related_event_id,
    )
    enriched = enrich_event_payload(decision_event)
    await run_in_threadpool(graph_repository.persist_event, enriched)
    recent_decisions.appendleft(enriched)


async def publish_event_passthrough(payload: dict) -> None:
    """Emit an observability-only event without mutating core logic."""
    enriched = enrich_event_payload(payload)
    await run_in_threadpool(graph_repository.persist_event, enriched)
    await ws_manager.broadcast(enriched, channel="events")
    recent_events.appendleft(enriched)
    if enriched.get("event_type") == "DECISION":
        recent_decisions.appendleft(enriched)


async def publish_anomaly_event(payload: dict) -> None:
    enriched = enrich_event_payload(payload)
    recent_anomalies.appendleft(enriched)
    await run_in_threadpool(graph_repository.persist_event, enriched)
    await ws_manager.broadcast(enriched, channel="alerts")
    await ws_manager.broadcast(enriched, channel="events")
    _dispatch_meta("anomaly_detected", trace_id=enriched.get("trace_id"))


async def metrics_stream_loop() -> None:
    while True:
        metrics = aggregation_service.snapshot_metrics()
        await ws_manager.broadcast(
            {
                "event_type": "METRICS_SNAPSHOT",
                "timestamp": metrics["timestamp"],
                "payload": metrics,
            },
            channel="metrics",
        )
        await ws_manager.broadcast(
            {
                "event_type": "AGENT_STATE_SNAPSHOT",
                "timestamp": metrics["timestamp"],
                "payload": build_agent_panel_payload(
                    aggregation_service, agent_state_store.list_states()
                ),
            },
            channel="agents",
        )
        await asyncio.sleep(max(settings.realtime_metrics_interval_seconds, 1))


async def meta_periodic_loop() -> None:
    while True:
        _dispatch_meta("periodic")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""

    global pulse_emitter, metrics_stream_task, meta_periodic_task

    logger.info("SwarmVision Graph backend starting up")
    graph_repository.connect()
    await agent_state_store.connect()

    pulse_emitter = EventPulseEmitter(publish_event)
    await pulse_emitter.start()
    metrics_stream_task = asyncio.create_task(metrics_stream_loop())

    configure_meta_client(
        enabled=settings.meta_agent_enabled,
        url=settings.meta_agent_url,
        timeout_ms=settings.meta_agent_timeout_ms,
        shared_secret=settings.meta_shared_secret,
        semaphore_size=settings.meta_dispatch_semaphore_size,
    )

    if settings.meta_agent_enabled:
        meta_periodic_task = asyncio.create_task(meta_periodic_loop())

    yield

    logger.info("SwarmVision Graph backend shutting down")
    if pulse_emitter:
        await pulse_emitter.stop()
    if metrics_stream_task:
        metrics_stream_task.cancel()
        try:
            await metrics_stream_task
        except asyncio.CancelledError:
            pass
    if meta_periodic_task:
        meta_periodic_task.cancel()
        try:
            await meta_periodic_task
        except asyncio.CancelledError:
            pass
    await agent_state_store.close()
    graph_repository.close()


app = FastAPI(
    title="SwarmVision Graph API",
    description="Real-time agent visualization and monitoring API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scrape_router)
app.include_router(swarm_router)


@app.middleware("http")
async def trace_context_middleware(request: Request, call_next):
    initialize_trace_context(request.headers)
    begin_operation_step("http_request")
    response = await call_next(request)
    trace = get_trace_context()
    response.headers["x-trace-id"] = trace.trace_id
    response.headers["x-session-id"] = trace.session_id
    return response


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring and load balancing."""

    return {
        "status": "ok",
        "service": "SwarmVision Graph API",
        "version": "0.1.0",
        "websocket_connections": ws_manager.get_client_count(),
        "pulse_emitter_active": pulse_emitter.is_running if pulse_emitter else False,
        "neo4j": graph_repository.get_status(),
    }


@app.get("/ws/stats")
async def websocket_stats():
    """Get WebSocket server statistics."""

    return {
        "timestamp": datetime.utcnow().isoformat(),
        **ws_manager.get_stats(),
    }


@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time agent events and updates."""

    initialize_trace_context(dict(websocket.headers))
    begin_operation_step("websocket_session")
    await ws_manager.connect(websocket, channel="events")
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug("Received from client: %s", data)
            await websocket.send_text(
                '{"type":"ACKNOWLEDGED","message":"Message received"}'
            )
    except Exception as exc:
        logger.error("websocket_error=%s", normalize_error(exc))
        err = normalize_error(exc)
        if err["error_type"] == "TIMEOUT":
            await publish_decision(
                name="timeout_handling",
                decision_input={"channel": "events"},
                decision_output={"action": "LOG_ONLY"},
                reason="WebSocket timeout handled without behavior change",
            )
        await ws_manager.disconnect(websocket)


@app.websocket("/events")
async def websocket_events_channel(websocket: WebSocket):
    initialize_trace_context(dict(websocket.headers))
    await ws_manager.connect(websocket, channel="events")
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        await ws_manager.disconnect(websocket)


@app.websocket("/metrics")
async def websocket_metrics_channel(websocket: WebSocket):
    initialize_trace_context(dict(websocket.headers))
    await ws_manager.connect(websocket, channel="metrics")
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        await ws_manager.disconnect(websocket)


@app.websocket("/alerts")
async def websocket_alerts_channel(websocket: WebSocket):
    initialize_trace_context(dict(websocket.headers))
    await ws_manager.connect(websocket, channel="alerts")
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        await ws_manager.disconnect(websocket)


@app.websocket("/agents")
async def websocket_agents_channel(websocket: WebSocket):
    initialize_trace_context(dict(websocket.headers))
    await ws_manager.connect(websocket, channel="agents")
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        await ws_manager.disconnect(websocket)


@app.post("/events/broadcast")
async def broadcast_event(event: Event):
    """Broadcast an event to all connected WebSocket clients."""

    try:
        payload = event.model_dump(mode="json")
        if not payload.get("trace_id"):
            payload["trace_id"] = str(uuid4())
        context = payload.get("context") or {}
        if not isinstance(context, dict):
            context = {}
        context["trace_id"] = payload["trace_id"]
        payload["context"] = context
        await publish_event(payload)
        return {"message": "Event broadcasted successfully", "event": event}
    except Exception as exc:
        logger.error("broadcast_error=%s", normalize_error(exc))
        raise HTTPException(status_code=500, detail="Failed to broadcast event")


@app.get("/replay/status", response_model=ReplayStatusResponse)
async def replay_status():
    """Expose replay availability without interrupting live mode."""

    return ReplayStatusResponse(**graph_repository.get_status())


def _replay_unavailable_response() -> JSONResponse:
    return JSONResponse(status_code=503, content=graph_repository.get_status())


def _parse_timestamp(value: str | None, default: datetime) -> datetime:
    if not value:
        return default
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


async def _load_events_for_range(
    from_timestamp: str | None,
    to_timestamp: str | None,
    tenant_id: str | None = None,
    app_id: str | None = None,
) -> tuple[datetime, datetime, list[dict]]:
    to_dt = _parse_timestamp(to_timestamp, datetime.utcnow())
    if not from_timestamp:
        await publish_decision(
            name="fallback_logic",
            decision_input={"from": None},
            decision_output={"window_minutes": settings.replay_default_window_minutes},
            reason="Default replay window applied",
        )
    from_dt = _parse_timestamp(
        from_timestamp,
        to_dt - timedelta(minutes=settings.replay_default_window_minutes),
    )
    events = await run_in_threadpool(
        graph_repository.get_events_between,
        from_dt,
        to_dt,
        tenant_id,
        app_id,
    )
    return from_dt, to_dt, events


@app.get("/replay/events", response_model=ReplayEventsResponse)
async def replay_events(
    from_timestamp: str | None = Query(default=None, alias="from"),
    to_timestamp: str | None = Query(default=None, alias="to"),
    tenant_id: str | None = Query(default=None),
    app_id: str | None = Query(default=None),
):
    """Fetch persisted replayable events for a time range."""

    if not graph_repository.available:
        await publish_decision(
            name="replay_events_availability",
            decision_input={"path": "/replay/events"},
            decision_output={"available": False},
            reason="Neo4j replay not available",
        )
        return _replay_unavailable_response()

    from_dt, to_dt, events = await _load_events_for_range(
        from_timestamp, to_timestamp, tenant_id, app_id
    )

    return ReplayEventsResponse(
        available=True,
        from_timestamp=from_dt,
        to_timestamp=to_dt,
        count=len(events),
        events=[ReplayEvent(**event) for event in events],
    )


@app.get("/replay/topology", response_model=ReplayTopologyResponse)
async def replay_topology(
    timestamp: str,
    tenant_id: str | None = Query(default=None),
    app_id: str | None = Query(default=None),
):
    """Build a topology snapshot for a specific point in time."""

    if not graph_repository.available:
        await publish_decision(
            name="replay_topology_availability",
            decision_input={"path": "/replay/topology"},
            decision_output={"available": False},
            reason="Neo4j replay not available",
        )
        return _replay_unavailable_response()

    target_time = _parse_timestamp(timestamp, datetime.utcnow())
    events = await run_in_threadpool(
        graph_repository.get_events_until, target_time, tenant_id, app_id
    )
    snapshot = build_topology_snapshot(events, target_time)

    return ReplayTopologyResponse(
        available=True,
        timestamp=target_time,
        event_count=len(events),
        agents=[ReplayAgent(**agent) for agent in snapshot["agents"].values()],
        edges=[ReplayEdge(**edge) for edge in snapshot["edges"].values()],
        active_handoffs=snapshot["active_handoffs"],
    )


@app.get("/replay/range", response_model=ReplayRangeResponse)
async def replay_range(
    from_timestamp: str | None = Query(default=None, alias="from"),
    to_timestamp: str | None = Query(default=None, alias="to"),
    tenant_id: str | None = Query(default=None),
    app_id: str | None = Query(default=None),
):
    """Fetch a replay range plus the topology snapshot at the range end."""

    if not graph_repository.available:
        await publish_decision(
            name="replay_range_availability",
            decision_input={"path": "/replay/range"},
            decision_output={"available": False},
            reason="Neo4j replay not available",
        )
        return _replay_unavailable_response()

    from_dt, to_dt, events = await _load_events_for_range(
        from_timestamp, to_timestamp, tenant_id, app_id
    )
    snapshot = build_topology_snapshot(events, to_dt)

    return ReplayRangeResponse(
        available=True,
        from_timestamp=from_dt,
        to_timestamp=to_dt,
        count=len(events),
        timeline=[
            datetime.fromisoformat(str(event["timestamp"]).replace("Z", "+00:00")).replace(
                tzinfo=None
            )
            for event in events
        ],
        events=[ReplayEvent(**event) for event in events],
        topology=ReplayTopologyResponse(
            available=True,
            timestamp=to_dt,
            event_count=len(events),
            agents=[ReplayAgent(**agent) for agent in snapshot["agents"].values()],
            edges=[ReplayEdge(**edge) for edge in snapshot["edges"].values()],
            active_handoffs=snapshot["active_handoffs"],
        ),
    )


@app.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
async def analytics_summary(
    from_timestamp: str | None = Query(default=None, alias="from"),
    to_timestamp: str | None = Query(default=None, alias="to"),
    tenant_id: str | None = Query(default=None),
    app_id: str | None = Query(default=None),
):
    if not graph_repository.available:
        await publish_decision(
            name="analytics_summary_availability",
            decision_input={"path": "/analytics/summary"},
            decision_output={"available": False},
            reason="Neo4j replay not available",
        )
        return _replay_unavailable_response()

    from_dt, to_dt, events = await _load_events_for_range(
        from_timestamp, to_timestamp, tenant_id, app_id
    )
    return AnalyticsSummaryResponse(**build_summary_response(events, from_dt, to_dt))


@app.get("/analytics/failures", response_model=AnalyticsFailuresResponse)
async def analytics_failures(
    from_timestamp: str | None = Query(default=None, alias="from"),
    to_timestamp: str | None = Query(default=None, alias="to"),
    tenant_id: str | None = Query(default=None),
    app_id: str | None = Query(default=None),
):
    if not graph_repository.available:
        await publish_decision(
            name="analytics_failures_availability",
            decision_input={"path": "/analytics/failures"},
            decision_output={"available": False},
            reason="Neo4j replay not available",
        )
        return _replay_unavailable_response()

    from_dt, to_dt, events = await _load_events_for_range(
        from_timestamp, to_timestamp, tenant_id, app_id
    )
    return AnalyticsFailuresResponse(**build_failures_response(events, from_dt, to_dt))


@app.get("/analytics/latency", response_model=AnalyticsLatencyResponse)
async def analytics_latency(
    from_timestamp: str | None = Query(default=None, alias="from"),
    to_timestamp: str | None = Query(default=None, alias="to"),
    tenant_id: str | None = Query(default=None),
    app_id: str | None = Query(default=None),
):
    if not graph_repository.available:
        await publish_decision(
            name="analytics_latency_availability",
            decision_input={"path": "/analytics/latency"},
            decision_output={"available": False},
            reason="Neo4j replay not available",
        )
        return _replay_unavailable_response()

    from_dt, to_dt, events = await _load_events_for_range(
        from_timestamp, to_timestamp, tenant_id, app_id
    )
    return AnalyticsLatencyResponse(**build_latency_response(events, from_dt, to_dt))


@app.get("/analytics/bottlenecks", response_model=AnalyticsBottlenecksResponse)
async def analytics_bottlenecks(
    from_timestamp: str | None = Query(default=None, alias="from"),
    to_timestamp: str | None = Query(default=None, alias="to"),
    tenant_id: str | None = Query(default=None),
    app_id: str | None = Query(default=None),
):
    if not graph_repository.available:
        await publish_decision(
            name="analytics_bottlenecks_availability",
            decision_input={"path": "/analytics/bottlenecks"},
            decision_output={"available": False},
            reason="Neo4j replay not available",
        )
        return _replay_unavailable_response()

    from_dt, to_dt, events = await _load_events_for_range(
        from_timestamp, to_timestamp, tenant_id, app_id
    )
    return AnalyticsBottlenecksResponse(
        **build_bottlenecks_response(events, from_dt, to_dt)
    )


@app.get("/trace/{trace_id}", response_model=TracePathResponse)
async def trace_path(trace_id: str):
    if not graph_repository.available:
        raise HTTPException(status_code=503, detail="Trace store unavailable")
    events = await run_in_threadpool(graph_repository.get_trace_events, trace_id)
    return TracePathResponse(
        trace_id=trace_id,
        count=len(events),
        events=[
            TraceEventItem(
                event_id=str(event.get("event_id") or event.get("id")),
                event_type=str(event.get("event_type") or event.get("type")),
                timestamp=datetime.fromisoformat(
                    str(event["timestamp"]).replace("Z", "+00:00")
                ).replace(tzinfo=None),
                step_index=int(event.get("step_index", 0)),
                parent_event_id=event.get("parent_event_id"),
                agent_id=event.get("agent_id"),
                payload=event.get("payload", {}),
            )
            for event in events
        ],
    )


@app.get("/agent/{agent_id}/metrics", response_model=AgentMetricResponse)
async def agent_metrics(agent_id: str):
    metric = aggregation_service.get_agent_metric(agent_id)
    state = agent_state_store.get_agent_state(agent_id)
    if not metric or not state:
        raise HTTPException(status_code=404, detail="Agent metrics unavailable")
    last_seen = state.get("last_seen")
    return AgentMetricResponse(
        agent_id=agent_id,
        latency_avg=float(metric.get("latency_avg") or 0),
        failure_rate=float(metric.get("failure_rate") or 0),
        throughput=int(metric.get("throughput") or 0),
        is_bottleneck=bool(metric.get("is_bottleneck")),
        state=str(state.get("state") or "ACTIVE"),
        last_seen=datetime.fromisoformat(last_seen.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
        if last_seen
        else None,
    )


@app.get("/anomalies", response_model=AnomalyListResponse)
async def anomalies(limit: int = Query(default=50, ge=1, le=200)):
    records = list(recent_anomalies)[:limit]
    if graph_repository.available:
        records = await run_in_threadpool(graph_repository.get_recent_anomalies, limit)

    return AnomalyListResponse(
        count=len(records),
        anomalies=[
            AnomalyResponseItem(
                event_id=str(event.get("event_id") or event.get("id")),
                timestamp=datetime.fromisoformat(
                    str(event["timestamp"]).replace("Z", "+00:00")
                ).replace(tzinfo=None),
                type=str((event.get("payload") or {}).get("type") or "ANOMALY"),
                severity=str((event.get("payload") or {}).get("severity") or "MEDIUM"),
                agent_id=(event.get("payload") or {}).get("agent_id")
                or event.get("agent_id"),
                trace_id=event.get("trace_id"),
                details=dict((event.get("payload") or {}).get("details") or {}),
            )
            for event in records
        ],
    )


@app.get("/replay/{trace_id}", response_model=TracePathResponse)
async def replay_by_trace(trace_id: str):
    return await trace_path(trace_id)


async def _emit_diagnostic_to_ws(payload: dict) -> None:
    await ws_manager.broadcast(payload, channel="events")


register_diagnostic_emitter(_emit_diagnostic_to_ws)


async def _emit_runtime_to_pipeline(payload: dict) -> None:
    await publish_event(payload)


register_runtime_event_emitter(_emit_runtime_to_pipeline)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
