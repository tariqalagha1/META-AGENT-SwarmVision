"""
Event Pulse Emitter

Generates demo swarm events at regular intervals for testing and demonstration.
"""

import asyncio
import logging
from datetime import datetime
from uuid import uuid4
from typing import Callable
import random

from app.core.settings import get_settings
from app.observability import normalize_error

logger = logging.getLogger(__name__)
settings = get_settings()


class SwarmEvent:
    """Simple swarm event generator"""

    _agent_ids = [f"agent-{i}" for i in range(1, 6)]
    _task_ids = [f"task-{i}" for i in range(1, 10)]
    _pipeline_nodes = ["entry", "processing", "validation", "enrichment", "output"]

    @staticmethod
    def agent_spawn():
        """Generate AGENT_SPAWN event"""
        agent_id = str(uuid4())[:8]
        agent_name = f"Agent-{agent_id}"
        return {
            "id": str(uuid4()),
            "type": "AGENT_SPAWN",
            "timestamp": datetime.utcnow().isoformat(),
            "source": "system",
            "payload": {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "agent_type": random.choice(["analyzer", "processor", "validator", "transformer"]),
            }
        }

    @staticmethod
    def task_start():
        """Generate TASK_START event"""
        task_id = str(uuid4())[:8]
        agent_id = random.choice(SwarmEvent._agent_ids)
        return {
            "id": str(uuid4()),
            "type": "TASK_START",
            "timestamp": datetime.utcnow().isoformat(),
            "source": "agent",
            "payload": {
                "agent_id": agent_id,
                "task_id": task_id,
            }
        }

    @staticmethod
    def agent_move():
        """Generate AGENT_MOVE event"""
        agent_id = random.choice(SwarmEvent._agent_ids)
        current_node = random.choice(SwarmEvent._pipeline_nodes)
        next_node = random.choice([n for n in SwarmEvent._pipeline_nodes if n != current_node])
        return {
            "id": str(uuid4()),
            "type": "AGENT_MOVE",
            "timestamp": datetime.utcnow().isoformat(),
            "source": "system",
            "payload": {
                "agent_id": agent_id,
                "from_node": current_node,
                "to_node": next_node,
            }
        }

    @staticmethod
    def task_handoff():
        """Generate TASK_HANDOFF event"""
        task_id = str(uuid4())[:8]
        source_agent_id = random.choice(SwarmEvent._agent_ids)
        target_agent_id = random.choice([a for a in SwarmEvent._agent_ids if a != source_agent_id])
        return {
            "id": str(uuid4()),
            "type": "TASK_HANDOFF",
            "timestamp": datetime.utcnow().isoformat(),
            "source": "agent",
            "payload": {
                "source_agent_id": source_agent_id,
                "target_agent_id": target_agent_id,
                "task_id": task_id,
            }
        }

    @staticmethod
    def task_success():
        """Generate TASK_SUCCESS event"""
        task_id = str(uuid4())[:8]
        agent_id = random.choice(SwarmEvent._agent_ids)
        return {
            "id": str(uuid4()),
            "type": "TASK_SUCCESS",
            "timestamp": datetime.utcnow().isoformat(),
            "source": "agent",
            "payload": {
                "agent_id": agent_id,
                "task_id": task_id,
                "processing_time_ms": random.randint(100, 5000),
            }
        }

    @staticmethod
    def get_random_event():
        """Get a random event from the available types"""
        generators = [
            SwarmEvent.agent_spawn,
            SwarmEvent.task_start,
            SwarmEvent.agent_move,
            SwarmEvent.task_handoff,
            SwarmEvent.task_success,
        ]
        return random.choice(generators)()


class EventPulseEmitter:
    """Manages periodic event emission for demonstration"""

    def __init__(self, broadcast_callback: Callable):
        """
        Initialize the pulse emitter
        
        Args:
            broadcast_callback: Async function to call when emitting events
        """
        self.broadcast_callback = broadcast_callback
        self.is_running = False
        self.pulse_interval = settings.pulse_interval_seconds
        self.pulse_task = None

    async def start(self):
        """Start the pulse emitter"""
        if self.is_running:
            logger.warning("Pulse emitter already running")
            return

        self.is_running = True
        self.pulse_task = asyncio.create_task(self._pulse_loop())
        logger.info(f"Event pulse emitter started (interval: {self.pulse_interval}s)")

    async def stop(self):
        """Stop the pulse emitter"""
        self.is_running = False
        if self.pulse_task:
            self.pulse_task.cancel()
            try:
                await self.pulse_task
            except asyncio.CancelledError:
                pass
        logger.info("Event pulse emitter stopped")

    async def _pulse_loop(self):
        """Main pulse loop that emits events at regular intervals"""
        try:
            # Emit initial system startup event
            startup_event = {
                "id": str(uuid4()),
                "type": "HEALTH_CHECK",
                "timestamp": datetime.utcnow().isoformat(),
                "source": "system",
                "payload": {
                    "system_health": {
                        "status": "operational",
                        "agents_active": 5,
                        "tasks_processing": 3,
                        "uptime_seconds": 0
                    }
                }
            }
            await self.broadcast_callback(startup_event)
            logger.info("Emitted startup health check event")

            # Emit events at regular intervals
            while self.is_running:
                try:
                    event = SwarmEvent.get_random_event()
                    await self.broadcast_callback(event)
                    logger.debug(f"Emitted event: {event['type']}")
                except Exception as exc:
                    logger.error("event_emit_error=%s", normalize_error(exc))

                # Wait before emitting next event
                await asyncio.sleep(self.pulse_interval)

        except asyncio.CancelledError:
            logger.info("Pulse loop cancelled")
        except Exception as exc:
            logger.error("pulse_loop_fatal=%s", normalize_error(exc))
            self.is_running = False

    def set_interval(self, interval: float):
        """Set the interval between events (in seconds)"""
        self.pulse_interval = max(settings.pulse_min_interval_seconds, interval)
        logger.info(f"Pulse interval set to {self.pulse_interval}s")
