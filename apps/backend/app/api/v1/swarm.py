from __future__ import annotations

from fastapi import APIRouter

from app.schemas.swarm import SwarmRunRequest, SwarmRunResponse
from app.services.swarm_runner import SwarmRunner

router = APIRouter(prefix="/api/v1", tags=["swarm"])
_runner = SwarmRunner()


@router.post("/swarm/run", response_model=SwarmRunResponse)
async def run_swarm(request: SwarmRunRequest) -> SwarmRunResponse:
    return await _runner.run(request)

