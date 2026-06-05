# DR Simulation Report (Staged)

Date: 2026-05-29  
Scope: Neo4j backup/restore simulation (Stage-like local validation)

## Result
- Status: **Blocked by environment**
- Blocker: Docker daemon unavailable on host

## Evidence
Command executed:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Observed output:

```text
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

## Impact
- Could not run:
  - `infra/backup/backup-neo4j.ps1`
  - `infra/backup/restore-neo4j.ps1`
- No live restore validation evidence can be produced until Docker is available.

## Ready-to-run procedure once Docker is active
1. Verify container:
```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

2. Create backup:
```powershell
.\infra\backup\backup-neo4j.ps1 -ContainerName neo4j
```

3. Restore latest backup:
```powershell
.\infra\backup\restore-neo4j.ps1 -ContainerName neo4j -DumpFile <path-to-dump>
```

4. Validate application health:
```powershell
curl.exe -sS http://localhost:8012/health
```

5. Validate replay path after restore (tenant/app scoped):
```powershell
curl.exe -sS "http://localhost:8012/replay/status"
```

## Sign-off criteria
- Neo4j health returns available `true`.
- Backend `/health` returns status `ok`.
- Replay endpoints respond without data integrity errors.
