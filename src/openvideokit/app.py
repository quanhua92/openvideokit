"""FastAPI app factory — CORS + the `/api` routes + startup hooks."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import CORS_ORIGINS, MAX_CONCURRENT_RENDERS
from .events import set_loop
from .rendering import init_executor, shutdown_executor
from .routes import router
from .store import init_store
from .watcher import start_watcher, stop_watcher


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio
    import logging

    fmt = logging.Formatter(
        "%(asctime)s.%(msecs)03d %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Ensure root has a handler, then format everything
    logging.basicConfig(level=logging.INFO)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for h in root.handlers:
        h.setFormatter(fmt)
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        lg = logging.getLogger(name)
        for h in lg.handlers:
            h.setFormatter(fmt)

    set_loop(asyncio.get_running_loop())
    init_store()
    init_executor(MAX_CONCURRENT_RENDERS)
    start_watcher()
    yield
    stop_watcher()
    shutdown_executor()


def create_app() -> FastAPI:
    app = FastAPI(title="OpenVideoKit", version=__version__, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)
    return app


app = create_app()
