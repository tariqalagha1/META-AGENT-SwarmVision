from __future__ import annotations

import asyncio
from datetime import datetime
import logging

from app.core.settings import Settings
from app.core.thresholds import Thresholds
from app.schemas.context import MetaContext
from app.schemas.insight import MetaInsight
from app.services.dedup import compute_dedup_key
from app.services.heuristics import HEURISTICS

logger = logging.getLogger(__name__)


class Analyzer:
    def __init__(self, settings: Settings, thresholds: Thresholds):
        self.settings = settings
        self.thresholds = thresholds

    async def analyze(self, context: MetaContext) -> tuple[list[MetaInsight], bool]:
        started = datetime.utcnow()
        insights: list[MetaInsight] = []
        timed_out = False

        global_budget = max(self.settings.ANALYZE_TIMEOUT_MS / 1000.0, 0.05)
        heuristic_budget = max(self.settings.HEURISTIC_TIMEOUT_MS / 1000.0, 0.05)

        for heuristic_name, heuristic in HEURISTICS:
            elapsed = (datetime.utcnow() - started).total_seconds()
            remaining = global_budget - elapsed
            if remaining <= 0:
                timed_out = True
                logger.warning('analyze_timeout global budget exceeded')
                break

            try:
                timeout = min(heuristic_budget, remaining)
                produced = await asyncio.wait_for(
                    asyncio.to_thread(heuristic, context, self.thresholds),
                    timeout=timeout,
                )
                for insight in produced:
                    insight.dedup_key = compute_dedup_key(insight)
                insights.extend(produced)
            except asyncio.TimeoutError:
                timed_out = True
                logger.warning('heuristic_timeout heuristic=%s', heuristic_name)
                continue
            except Exception as exc:
                logger.warning('heuristic_failure heuristic=%s error=%s', heuristic_name, exc)
                continue

        insights.sort(key=lambda item: (item.severity, item.timestamp.isoformat(), item.dedup_key))
        return insights, timed_out
