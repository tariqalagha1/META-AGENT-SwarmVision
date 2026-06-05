param(
  [string]$ContainerName = "postgres",
  [string]$Database = "swarmvision",
  [string]$User = "postgres",
  [string]$BackupDir = ".\infra\backup\artifacts\postgres"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $BackupDir "postgres-$Database-$stamp.sql.gz"

Write-Host "Creating PostgreSQL backup: $target"
docker exec $ContainerName sh -lc "pg_dump -U $User $Database | gzip -c > /tmp/backup.sql.gz"
docker cp "${ContainerName}:/tmp/backup.sql.gz" $target
Write-Host "PostgreSQL backup complete: $target"
