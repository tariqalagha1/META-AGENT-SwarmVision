"""Neo4j-backed event repository for living graph persistence."""

from __future__ import annotations

from datetime import datetime
import json
import logging
from typing import Any

try:
    from neo4j import GraphDatabase
except ModuleNotFoundError:  # pragma: no cover - optional until dependency is installed
    GraphDatabase = None

from app.core.settings import Settings
from app.observability import normalize_error

logger = logging.getLogger(__name__)

SUPPORTED_EVENT_TYPES = {
    "AGENT_SPAWN",
    "AGENT_MOVE",
    "TASK_START",
    "TASK_HANDOFF",
    "TASK_SUCCESS",
    "TASK_FAIL",
    "AGENT_TERMINATION",
    "PIPELINE_UPDATE",
    "HEALTH_CHECK",
    "DECISION_POINT",
    "DECISION",
    "ANOMALY",
    "META_INSIGHT",
}


class Neo4jGraphRepository:
    """Persistence layer for event history and graph state."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.driver = None
        self.available = False
        self.last_error: str | None = None

    def connect(self) -> bool:
        """Connect to Neo4j and install basic constraints."""

        if not self.settings.neo4j_enabled:
            self.available = False
            self.last_error = "Neo4j disabled by configuration"
            return False

        if GraphDatabase is None:
            self.available = False
            self.last_error = "Neo4j driver package is not installed"
            return False

        try:
            self.driver = GraphDatabase.driver(
                self.settings.neo4j_uri,
                auth=(self.settings.neo4j_username, self.settings.neo4j_password),
                connection_timeout=self.settings.neo4j_connect_timeout,
            )
            self.driver.verify_connectivity()
            self._ensure_schema()
            self.available = True
            self.last_error = None
            logger.info("Neo4j repository connected")
            return True
        except Exception as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("neo4j_connect_error=%s", normalize_error(exc))
            return False

    def close(self) -> None:
        """Close the Neo4j driver."""

        if self.driver is not None:
            self.driver.close()
            self.driver = None
        self.available = False

    def get_status(self) -> dict[str, Any]:
        """Return repository availability information."""

        return {
            "available": self.available,
            "enabled": self.settings.neo4j_enabled,
            "message": "Neo4j ready" if self.available else "Neo4j replay unavailable",
            "last_error": self.last_error,
        }

    def persist_event(self, event: dict[str, Any]) -> bool:
        """Persist a meaningful live event into Neo4j."""

        if not self.available or self.driver is None:
            return False

        event_type = event.get("event_type") or event.get("type")
        if event_type not in SUPPORTED_EVENT_TYPES:
            return False

        payload = event.get("payload", {}) or {}
        context = event.get("context", {}) or {}
        params = {
            "id": event.get("event_id") or event.get("id"),
            "type": event_type,
            "timestamp": self._as_datetime_string(event["timestamp"]),
            "source": event.get("source", "unknown"),
            "payload_json": json.dumps(payload),
            "context_json": json.dumps(context),
            "event_id": event.get("event_id") or event.get("id"),
            "event_type": event.get("event_type") or event.get("type"),
            "agent_id": event.get("agent_id") or payload.get("agent_id"),
            "agent_name": payload.get("agent_name"),
            "agent_type": payload.get("agent_type"),
            "task_id": payload.get("task_id"),
            "source_agent_id": payload.get("source_agent_id"),
            "target_agent_id": payload.get("target_agent_id"),
            "trace_id": event.get("trace_id") or context.get("trace_id"),
            "session_id": event.get("session_id") or context.get("session_id"),
            "step_id": event.get("step_id") or context.get("step_id"),
            "parent_step": event.get("parent_step") or context.get("parent_step"),
            "parent_event_id": event.get("parent_event_id")
            or context.get("parent_event_id")
            or event.get("previous_event_id")
            or context.get("previous_event_id"),
            "step_index": int(event.get("step_index", 0)),
            "latency_ms": event.get("latency_ms", 0),
            "input_ref": event.get("input_ref") or context.get("input_ref"),
            "output_ref": event.get("output_ref") or context.get("output_ref"),
            "confidence_score": event.get("confidence_score"),
            "decision_flag": event.get("decision_flag"),
            "previous_event_id": event.get("previous_event_id")
            or context.get("previous_event_id"),
            "decision_name": payload.get("decision_point") or payload.get("name"),
            "decision_reason": payload.get("reason"),
            "related_event_id": payload.get("related_event_id")
            or context.get("related_event_id"),
            "tenant_id": context.get("tenant_id"),
            "app_id": context.get("app_id"),
            "app_name": context.get("app_name"),
            "environment": context.get("environment"),
            "app_version": context.get("version"),
        }

        try:
            with self.driver.session(database=self.settings.neo4j_database) as session:
                session.execute_write(self._persist_event_tx, params)
            return True
        except Exception as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("neo4j_persist_error=%s", normalize_error(exc))
            return False

    @staticmethod
    def _persist_event_tx(tx, params: dict[str, Any]) -> None:
        tx.run(
            """
            MERGE (e:Event {id: $id})
            SET e.type = $type,
                e.event_id = $event_id,
                e.event_type = $event_type,
                e.timestamp = datetime($timestamp),
                e.source = $source,
                e.payload_json = $payload_json,
                e.context_json = $context_json,
                e.agent_id = $agent_id,
                e.task_id = $task_id,
                e.source_agent_id = $source_agent_id,
                e.target_agent_id = $target_agent_id,
                e.trace_id = $trace_id,
                e.session_id = $session_id,
                e.step_id = $step_id,
                e.parent_step = $parent_step,
                e.parent_event_id = $parent_event_id,
                e.step_index = $step_index,
                e.latency_ms = $latency_ms,
                e.input_ref = $input_ref,
                e.output_ref = $output_ref,
                e.confidence_score = $confidence_score,
                e.decision_flag = $decision_flag,
                e.tenant_id = $tenant_id,
                e.app_id = $app_id,
                e.app_name = $app_name,
                e.environment = $environment,
                e.app_version = $app_version
            """,
            **params,
            )

        if params["trace_id"]:
            tx.run(
                """
                MERGE (t:Trace {trace_id: $trace_id})
                SET t.session_id = coalesce($session_id, t.session_id),
                    t.last_seen_at = datetime($timestamp)
                WITH t
                MATCH (e:Event {id: $id})
                MERGE (e)-[:PART_OF]->(t)
                """,
                **params,
            )

        if params["parent_event_id"]:
            tx.run(
                """
                MATCH (prev:Event {id: $parent_event_id})
                MATCH (curr:Event {id: $id})
                MERGE (prev)-[:NEXT]->(curr)
                """,
                **params,
            )

        if params["type"] in {"DECISION_POINT", "DECISION"}:
            tx.run(
                """
                MERGE (d:Decision {id: $id})
                SET d.name = coalesce($decision_name, d.name),
                    d.reason = coalesce($decision_reason, d.reason),
                    d.trace_id = $trace_id,
                    d.session_id = $session_id,
                    d.timestamp = datetime($timestamp)
                WITH d
                OPTIONAL MATCH (related:Event {id: $related_event_id})
                MATCH (self_event:Event {id: $id})
                WITH d, coalesce(related, self_event) AS target_event
                MERGE (d)-[:TRIGGERED]->(target_event)
                """,
                **params,
            )

        if params["agent_id"]:
            tx.run(
                """
                MERGE (a:Agent {id: $agent_id})
                SET a.name = coalesce($agent_name, a.name, $agent_id),
                    a.agent_type = coalesce($agent_type, a.agent_type, 'unknown'),
                    a.last_seen_at = datetime($timestamp),
                    a.tenant_id = coalesce($tenant_id, a.tenant_id),
                    a.app_id = coalesce($app_id, a.app_id)
                WITH a
                MATCH (e:Event {id: $id})
                MERGE (a)-[:PARTICIPATED_IN {event_id: $id}]->(e)
                """,
                **params,
            )

        if (
            params["type"] == "TASK_HANDOFF"
            and params["source_agent_id"]
            and params["target_agent_id"]
        ):
            tx.run(
                """
                MERGE (source:Agent {id: $source_agent_id})
                SET source.last_seen_at = datetime($timestamp),
                    source.tenant_id = coalesce($tenant_id, source.tenant_id),
                    source.app_id = coalesce($app_id, source.app_id)
                MERGE (target:Agent {id: $target_agent_id})
                SET target.last_seen_at = datetime($timestamp),
                    target.tenant_id = coalesce($tenant_id, target.tenant_id),
                    target.app_id = coalesce($app_id, target.app_id)
                WITH source, target
                MATCH (e:Event {id: $id})
                MERGE (source)-[h:HANDOFF {event_id: $id}]->(target)
                SET h.timestamp = datetime($timestamp),
                    h.task_id = $task_id,
                    h.type = $type,
                    h.tenant_id = $tenant_id,
                    h.app_id = $app_id
                MERGE (source)-[:SOURCE_OF {event_id: $id}]->(e)
                MERGE (e)-[:TARGETS {event_id: $id}]->(target)
                """,
                **params,
            )

    def get_events_between(
        self,
        from_timestamp: datetime,
        to_timestamp: datetime,
        tenant_id: str | None = None,
        app_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch ordered events for a historical replay range."""

        if not self.available or self.driver is None:
            return []

        try:
            with self.driver.session(database=self.settings.neo4j_database) as session:
                result = session.run(
                    """
                    MATCH (e:Event)
                    WHERE e.timestamp >= datetime($from_timestamp)
                      AND e.timestamp <= datetime($to_timestamp)
                      AND ($tenant_id IS NULL OR e.tenant_id = $tenant_id)
                      AND ($app_id IS NULL OR e.app_id = $app_id)
                    RETURN e
                    ORDER BY coalesce(e.step_index, 0) ASC, e.timestamp ASC
                    """,
                    from_timestamp=from_timestamp.isoformat(),
                    to_timestamp=to_timestamp.isoformat(),
                    tenant_id=tenant_id,
                    app_id=app_id,
                )
                return [self._event_from_record(record["e"]) for record in result]
        except Exception as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("neo4j_replay_query_error=%s", normalize_error(exc))
            return []

    def get_events_until(
        self,
        timestamp: datetime,
        tenant_id: str | None = None,
        app_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch all replayable events up to a timestamp."""

        if not self.available or self.driver is None:
            return []

        try:
            with self.driver.session(database=self.settings.neo4j_database) as session:
                result = session.run(
                    """
                    MATCH (e:Event)
                    WHERE e.timestamp <= datetime($timestamp)
                      AND ($tenant_id IS NULL OR e.tenant_id = $tenant_id)
                      AND ($app_id IS NULL OR e.app_id = $app_id)
                    RETURN e
                    ORDER BY coalesce(e.step_index, 0) ASC, e.timestamp ASC
                    """,
                    timestamp=timestamp.isoformat(),
                    tenant_id=tenant_id,
                    app_id=app_id,
                )
                return [self._event_from_record(record["e"]) for record in result]
        except Exception as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("neo4j_topology_query_error=%s", normalize_error(exc))
            return []

    def _ensure_schema(self) -> None:
        if self.driver is None:
            return

        with self.driver.session(database=self.settings.neo4j_database) as session:
            session.run(
                """
                CREATE CONSTRAINT event_id_unique IF NOT EXISTS
                FOR (e:Event) REQUIRE e.id IS UNIQUE
                """
            )
            session.run(
                """
                CREATE CONSTRAINT agent_id_unique IF NOT EXISTS
                FOR (a:Agent) REQUIRE a.id IS UNIQUE
                """
            )
            session.run(
                """
                CREATE CONSTRAINT trace_id_unique IF NOT EXISTS
                FOR (t:Trace) REQUIRE t.trace_id IS UNIQUE
                """
            )
            session.run(
                """
                CREATE CONSTRAINT decision_id_unique IF NOT EXISTS
                FOR (d:Decision) REQUIRE d.id IS UNIQUE
                """
            )

    def get_trace_events(self, trace_id: str) -> list[dict[str, Any]]:
        if not self.available or self.driver is None:
            return []
        try:
            with self.driver.session(database=self.settings.neo4j_database) as session:
                result = session.run(
                    """
                    MATCH (e:Event)-[:PART_OF]->(t:Trace {trace_id: $trace_id})
                    RETURN e
                    ORDER BY coalesce(e.step_index, 0) ASC, e.timestamp ASC
                    """,
                    trace_id=trace_id,
                )
                return [self._event_from_record(record["e"]) for record in result]
        except Exception as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("neo4j_trace_query_error=%s", normalize_error(exc))
            return []

    def get_recent_anomalies(self, limit: int = 100) -> list[dict[str, Any]]:
        if not self.available or self.driver is None:
            return []
        try:
            with self.driver.session(database=self.settings.neo4j_database) as session:
                result = session.run(
                    """
                    MATCH (e:Event)
                    WHERE e.type = 'ANOMALY' OR e.event_type = 'ANOMALY'
                    RETURN e
                    ORDER BY e.timestamp DESC
                    LIMIT $limit
                    """,
                    limit=limit,
                )
                return [self._event_from_record(record["e"]) for record in result]
        except Exception as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("neo4j_anomaly_query_error=%s", normalize_error(exc))
            return []

    def persist_agent_state(self, state: dict[str, Any]) -> bool:
        if not self.available or self.driver is None:
            return False
        try:
            with self.driver.session(database=self.settings.neo4j_database) as session:
                session.run(
                    """
                    MERGE (a:Agent {id: $agent_id})
                    SET a.state = $state,
                        a.last_seen_at = datetime($last_seen),
                        a.latency_avg = $latency_avg,
                        a.error_rate = $error_rate,
                        a.throughput = $throughput
                    WITH a
                    CREATE (s:AgentStateSnapshot {
                        id: randomUUID(),
                        timestamp: datetime($last_seen),
                        state: $state,
                        latency_avg: $latency_avg,
                        error_rate: $error_rate,
                        throughput: $throughput
                    })
                    MERGE (a)-[:HAS_STATE]->(s)
                    """,
                    **state,
                )
            return True
        except Exception as exc:
            logger.warning("neo4j_agent_state_persist_error=%s", normalize_error(exc))
            return False

    @staticmethod
    def _event_from_record(node) -> dict[str, Any]:
        payload_json = node.get("payload_json", "{}")
        payload = json.loads(payload_json) if payload_json else {}
        context_json = node.get("context_json", "{}")
        context = json.loads(context_json) if context_json else {}
        timestamp = node.get("timestamp")
        if hasattr(timestamp, "to_native"):
            timestamp = timestamp.to_native()

        return {
            "id": node["id"],
            "event_id": node.get("event_id", node["id"]),
            "type": node["type"],
            "event_type": node.get("event_type", node["type"]),
            "timestamp": timestamp.isoformat()
            if isinstance(timestamp, datetime)
            else str(timestamp),
            "source": node.get("source", "unknown"),
            "agent_id": node.get("agent_id"),
            "trace_id": node.get("trace_id"),
            "session_id": node.get("session_id"),
            "step_id": node.get("step_id"),
            "parent_step": node.get("parent_step"),
            "parent_event_id": node.get("parent_event_id"),
            "step_index": int(node.get("step_index", 0)),
            "latency_ms": node.get("latency_ms", 0),
            "input_ref": node.get("input_ref"),
            "output_ref": node.get("output_ref"),
            "confidence_score": node.get("confidence_score"),
            "decision_flag": node.get("decision_flag"),
            "payload": payload,
            "context": context,
        }

    @staticmethod
    def _as_datetime_string(value: Any) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)
