from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import logging

from fastapi import FastAPI

from app.api.middleware import install_middlewares
from app.api.routes import build_router
from app.core.settings import settings
from app.core.thresholds import Thresholds
from app.services.analyzer import Analyzer
from app.services.storage import InsightStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

store = InsightStore(settings)
thresholds = Thresholds()
analyzer = Analyzer(settings=settings, thresholds=thresholds)
rate_limiter = None
_retention_task: asyncio.Task | None = None


async def retention_loop() -> None:
    while True:
        await asyncio.sleep(86_400)
        try:
            store.prune_retention()
        except Exception as exc:
            logger.warning('retention_prune_failed error=%s', exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _retention_task
    try:
        store.connect()
    except Exception as exc:
        logger.warning('store_connect_failed continuing_without_persistence error=%s', exc)

    try:
        store.prune_retention()
    except Exception as exc:
        logger.warning('initial_prune_failed error=%s', exc)

    _retention_task = asyncio.create_task(retention_loop())
    yield

    if _retention_task:
        _retention_task.cancel()
        try:
            await _retention_task
        except asyncio.CancelledError:
            pass
    store.close()


app = FastAPI(
    title='SwarmVision Meta Agent Sidecar',
    version=settings.SERVICE_VERSION,
    lifespan=lifespan,
)

rate_limiter = install_middlewares(app, settings)
app.include_router(build_router(settings, analyzer, store, rate_limiter))
