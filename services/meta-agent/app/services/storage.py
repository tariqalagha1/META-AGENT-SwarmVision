from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

try:
    from neo4j import GraphDatabase
except ModuleNotFoundError:  # pragma: no cover
    GraphDatabase = None

from app.core.settings import Settings
from app.schemas.insight import MetaInsight


class InsightStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.driver = None
        self.enabled = False

    def connect(self) -> None:
        if GraphDatabase is None:
            self.enabled = False
            return
        self.driver = GraphDatabase.driver(
            self.settings.NEO4J_URI,
            auth=(self.settings.NEO4J_USER, self.settings.NEO4J_PASSWORD.get_secret_value()),
            connection_timeout=3,
        )
        self.driver.verify_connectivity()
        self._ensure_schema()
        self.enabled = True

    def close(self) -> None:
        if self.driver is not None:
            self.driver.close()
            self.driver = None
        self.enabled = False

    def upsert_insight(self, insight: MetaInsight) -> bool:
        if not self.enabled or self.driver is None:
            return False

        payload = insight.model_dump(mode='json')
        with self.driver.session(database=self.settings.NEO4J_DATABASE) as session:
            result = session.run(
                """
                MERGE (m:MetaInsight {dedup_key: $dedup_key})
                ON CREATE SET
                    m.insight_id = $insight_id,
                    m.schema_version = $schema_version,
                    m.event_type = $event_type,
                    m.timestamp = datetime($timestamp),
                    m.trace_id = $trace_id,
                    m.agent_id = $agent_id,
                    m.category = $category,
                    m.severity = $severity,
                    m.confidence = $confidence,
                    m.title = $title,
                    m.summary = $summary,
                    m.suggestion = $suggestion,
                    m.heuristic_name = $heuristic_name,
                    m.thresholds_used = $thresholds_used,
                    m.window_start = datetime($window_start),
                    m.window_end = datetime($window_end),
                    m.truncation_applied = $truncation_applied,
                    m.occurrence_count = 1,
                    m.created_at = datetime($now),
                    m.updated_at = datetime($now)
                ON MATCH SET
                    m.occurrence_count = coalesce(m.occurrence_count, 1) + 1,
                    m.updated_at = datetime($now)
                RETURN m.occurrence_count AS occurrence_count
                """,
                dedup_key=payload['dedup_key'],
                insight_id=str(payload['insight_id']),
                schema_version=payload['schema_version'],
                event_type=payload['event_type'],
                timestamp=payload['timestamp'],
                trace_id=payload.get('trace_id'),
                agent_id=payload.get('agent_id'),
                category=payload['category'],
                severity=payload['severity'],
                confidence=float(payload['confidence']),
                title=payload['title'],
                summary=payload['summary'],
                suggestion=payload.get('suggestion'),
                heuristic_name=payload['metadata']['heuristic_name'],
                thresholds_used=payload['metadata']['thresholds_used'],
                window_start=payload['metadata']['window_start'],
                window_end=payload['metadata']['window_end'],
                truncation_applied=payload['metadata']['truncation_applied'],
                now=datetime.utcnow().isoformat(),
            )
            row = result.single()
            created_new = bool(row and int(row['occurrence_count']) == 1)

            self._upsert_evidence(session, payload)
            return created_new

    def prune_retention(self, retention_days: int = 30, max_rows: int = 10_000) -> None:
        if not self.enabled or self.driver is None:
            return
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        with self.driver.session(database=self.settings.NEO4J_DATABASE) as session:
            session.run(
                """
                MATCH (m:MetaInsight)
                WHERE m.timestamp < datetime($cutoff)
                DETACH DELETE m
                """,
                cutoff=cutoff.isoformat(),
            )
            session.run(
                """
                MATCH (m:MetaInsight)
                WITH m ORDER BY m.timestamp DESC
                SKIP $max_rows
                DETACH DELETE m
                """,
                max_rows=max_rows,
            )

    def get_recent(self, limit: int = 50) -> list[dict[str, Any]]:
        if not self.enabled or self.driver is None:
            return []
        with self.driver.session(database=self.settings.NEO4J_DATABASE) as session:
            result = session.run(
                """
                MATCH (m:MetaInsight)
                RETURN m
                ORDER BY m.timestamp DESC
                LIMIT $limit
                """,
                limit=limit,
            )
            return [dict(record['m']) for record in result]

    def _ensure_schema(self) -> None:
        if self.driver is None:
            return
        with self.driver.session(database=self.settings.NEO4J_DATABASE) as session:
            session.run("CREATE CONSTRAINT meta_insight_dedup_unique IF NOT EXISTS FOR (m:MetaInsight) REQUIRE m.dedup_key IS UNIQUE")
            session.run('CREATE INDEX meta_insight_category IF NOT EXISTS FOR (m:MetaInsight) ON (m.category)')
            session.run('CREATE INDEX meta_insight_timestamp IF NOT EXISTS FOR (m:MetaInsight) ON (m.timestamp)')
            session.run('CREATE INDEX meta_insight_trace_id IF NOT EXISTS FOR (m:MetaInsight) ON (m.trace_id)')
            session.run('CREATE INDEX meta_insight_agent_id IF NOT EXISTS FOR (m:MetaInsight) ON (m.agent_id)')

    def _upsert_evidence(self, session, payload: dict[str, Any]) -> None:
        for event_id in payload['evidence']['event_ids']:
            session.run(
                """
                MATCH (m:MetaInsight {dedup_key: $dedup_key})
                MERGE (e:Event {id: $id})
                MERGE (m)-[:EVIDENCES]->(e)
                """,
                dedup_key=payload['dedup_key'],
                id=event_id,
            )

        for decision_id in payload['evidence']['decision_ids']:
            session.run(
                """
                MATCH (m:MetaInsight {dedup_key: $dedup_key})
                MERGE (d:Decision {id: $id})
                MERGE (m)-[:EVIDENCES]->(d)
                """,
                dedup_key=payload['dedup_key'],
                id=decision_id,
            )

        for anomaly_id in payload['evidence']['anomaly_ids']:
            session.run(
                """
                MATCH (m:MetaInsight {dedup_key: $dedup_key})
                MERGE (a:Anomaly {id: $id})
                MERGE (m)-[:EVIDENCES]->(a)
                """,
                dedup_key=payload['dedup_key'],
                id=anomaly_id,
            )


def apply_retention_policy(
    rows: list[dict[str, Any]],
    now: datetime,
    retention_days: int = 30,
    max_rows: int = 10_000,
) -> list[dict[str, Any]]:
    cutoff = now - timedelta(days=retention_days)
    fresh = [row for row in rows if row.get('timestamp') and row['timestamp'] >= cutoff]
    fresh.sort(key=lambda row: row['timestamp'], reverse=True)
    return fresh[:max_rows]
