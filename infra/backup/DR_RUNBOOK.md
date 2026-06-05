# Disaster Recovery Runbook

## Scope
- Neo4j recovery for backend replay/event graph.
- PostgreSQL recovery template for environments that include Postgres.

## Preconditions
- Production secrets available (`JWT_SECRET`, DB creds).
- Docker access to target containers.
- Latest validated backup artifact present.

## RTO / RPO Targets
- RTO target: 30 minutes.
- RPO target: 15 minutes for production.

## Neo4j Restore Simulation
1. Confirm backup artifacts exist under `infra/backup/artifacts/neo4j`.
2. Stop traffic at load balancer / maintenance mode.
3. Execute restore:
   - `.\infra\backup\restore-neo4j.ps1 -DumpFile <path-to-dump>`
4. Validate:
   - `GET /health` returns `neo4j.available = true`.
   - Replay/analytics endpoints return data for known tenant/app scope.
5. Re-enable traffic.

## PostgreSQL PITR (If enabled in deployment)
1. Validate WAL retention policy in Postgres config.
2. Restore latest base backup:
   - `.\infra\backup\restore-postgres.ps1 -BackupFile <path-to-sql.gz>`
3. Apply WAL replay to recovery target timestamp (deployment-specific).
4. Run smoke tests against tenant-scoped API operations.

## Validation Checklist
- Auth enabled (`AUTH_DISABLED=false`) in target env.
- Tenant escape tests pass against staging/prod mirror.
- Dashboard and core APIs pass synthetic smoke suite.
- Incident timeline documented and signed off.
