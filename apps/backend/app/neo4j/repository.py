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

logger = logging.getLogger(__name__)

SUPPORTED_EVENT_TYPES = {
    "AGENT_SPAWN",
    "TASK_START",
    "TASK_HANDOFF",
    "TASK_SUCCESS",
    "TASK_FAIL",
    "AGENT_TERMINATION",
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
            logger.warning("Neo4j unavailable: %s", exc)
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

        event_type = event.get("type")
        if event_type not in SUPPORTED_EVENT_TYPES:
            return False

        payload = event.get("payload", {}) or {}
        context = event.get("context", {}) or {}
        params = {
            "id": event["id"],
            "type": event_type,
            "timestamp": self._as_datetime_string(event["timestamp"]),
            "source": event.get("source", "unknown"),
            "payload_json": json.dumps(payload),
            "context_json": json.dumps(context),
            "agent_id": payload.get("agent_id"),
            "agent_name": payload.get("agent_name"),
            "agent_type": payload.get("agent_type"),
            "task_id": payload.get("task_id"),
            "source_agent_id": payload.get("source_agent_id"),
            "target_agent_id": payload.get("target_agent_id"),
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
            logger.warning("Neo4j persistence failed, disabling replay: %s", exc)
            return False

    @staticmethod
    def _persist_event_tx(tx, params: dict[str, Any]) -> None:
        tx.run(
            """
            MERGE (e:Event {id: $id})
            SET e.type = $type,
                e.timestamp = datetime($timestamp),
                e.source = $source,
                e.payload_json = $payload_json,
                e.context_json = $context_json,
                e.agent_id = $agent_id,
                e.task_id = $task_id,
                e.source_agent_id = $source_agent_id,
                e.target_agent_id = $target_agent_id,
                e.tenant_id = $tenant_id,
                e.app_id = $app_id,
                e.app_name = $app_name,
                e.environment = $environment,
                e.app_version = $app_version
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
                    ORDER BY e.timestamp ASC
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
            logger.warning("Neo4j replay query failed: %s", exc)
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
                    ORDER BY e.timestamp ASC
                    """,
                    timestamp=timestamp.isoformat(),
                    tenant_id=tenant_id,
                    app_id=app_id,
                )
                return [self._event_from_record(record["e"]) for record in result]
        except Exception as exc:
            self.available = False
            self.last_error = str(exc)
            logger.warning("Neo4j topology query failed: %s", exc)
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
            "type": node["type"],
            "timestamp": timestamp.isoformat()
            if isinstance(timestamp, datetime)
            else str(timestamp),
            "source": node.get("source", "unknown"),
            "payload": payload,
            "context": context,
        }

    @staticmethod
    def _as_datetime_string(value: Any) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)
