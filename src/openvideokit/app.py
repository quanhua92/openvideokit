"""FastAPI app factory — CORS + the `/api` routes + startup hooks."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import CORS_ORIGINS
from .routes import router
from .store import init_store
from .watcher import start_watcher, stop_watcher


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_store()
    start_watcher()
    yield
    stop_watcher()


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
