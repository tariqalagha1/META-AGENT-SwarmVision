param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$ContainerName = "postgres",
  [string]$Database = "swarmvision",
  [string]$User = "postgres"
)

$ErrorActionPreference = "Stop"
if (!(Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

Write-Host "Restoring PostgreSQL backup from $BackupFile"
docker cp $BackupFile "${ContainerName}:/tmp/backup.sql.gz"
docker exec $ContainerName sh -lc "gunzip -c /tmp/backup.sql.gz | psql -U $User -d $Database"
Write-Host "PostgreSQL restore complete."
