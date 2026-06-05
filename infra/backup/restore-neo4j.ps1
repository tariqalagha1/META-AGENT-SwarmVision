param(
  [Parameter(Mandatory = $true)]
  [string]$DumpFile,
  [string]$ContainerName = "neo4j"
)

$ErrorActionPreference = "Stop"
if (!(Test-Path $DumpFile)) {
  throw "Dump file not found: $DumpFile"
}

Write-Host "Restoring Neo4j from $DumpFile"
docker cp $DumpFile "${ContainerName}:/tmp/neo4j.dump"
docker exec $ContainerName neo4j stop
docker exec $ContainerName neo4j-admin database load neo4j --from-path=/tmp --overwrite-destination=true
docker exec $ContainerName neo4j start
Write-Host "Neo4j restore complete."
