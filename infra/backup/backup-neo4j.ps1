param(
  [string]$ContainerName = "neo4j",
  [string]$BackupDir = ".\infra\backup\artifacts\neo4j"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $BackupDir "neo4j-$stamp.dump"

Write-Host "Creating Neo4j backup: $target"
docker exec $ContainerName neo4j-admin database dump neo4j --to-path=/tmp
docker cp "${ContainerName}:/tmp/neo4j.dump" $target
Write-Host "Neo4j backup complete: $target"
