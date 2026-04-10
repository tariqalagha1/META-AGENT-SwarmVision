"""
SwarmVision Graph - Backend API Service

Main FastAPI application with WebSocket support, Neo4j persistence,
and replay endpoints for historical graph state.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import logging

from fastapi import FastAPI, HTTPException, Query, WebSocket
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.analytics import (
    build_bottlenecks_response,
    build_failures_response,
    build_latency_response,
    build_summary_response,
)
from app.core.pulse import EventPulseEmitter
from app.core.settings import get_settings
from app.neo4j import Neo4jGraphRepository, build_topology_snapshot
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
from app.websocket.manager import WebSocketManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()
ws_manager = WebSocketManager()
graph_repository = Neo4jGraphRepository(settings)
pulse_emitter = None


async def publish_event(event_payload: dict) -> None:
    """Persist an event when possible and broadcast it to clients."""

    await run_in_threadpool(graph_repository.persist_event, event_payload)
    await ws_manager.broadcast(event_payload)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""

    global pulse_emitter

    logger.info("SwarmVision Graph backend starting up")
    graph_repository.connect()

    pulse_emitter = EventPulseEmitter(publish_event)
    await pulse_emitter.start()

    yield

    logger.info("SwarmVision Graph backend shutting down")
    if pulse_emitter:
        await pulse_emitter.stop()
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

    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug("Received from client: %s", data)
            await websocket.send_text(
                '{"type":"ACKNOWLEDGED","message":"Message received"}'
            )
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
        await ws_manager.disconnect(websocket)


@app.post("/events/broadcast")
async def broadcast_event(event: Event):
    """Broadcast an event to all connected WebSocket clients."""

    try:
        payload = event.model_dump(mode="json")
        await publish_event(payload)
        return {"message": "Event broadcasted successfully", "event": event}
    except Exception as exc:
        logger.error("Broadcast error: %s", exc)
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
        return _replay_unavailable_response()

    from_dt, to_dt, events = await _load_events_for_range(
        from_timestamp, to_timestamp, tenant_id, app_id
    )
    return AnalyticsBottlenecksResponse(
        **build_bottlenecks_response(events, from_dt, to_dt)
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
