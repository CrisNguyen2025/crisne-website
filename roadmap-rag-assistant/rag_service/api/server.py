"""FastAPI application entry point.

Start with:
    uvicorn rag_service.api.server:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from rag_service import observability
from rag_service.config import settings
from rag_service.tools import init_adapter


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle — initialises the data adapter."""
    load_dotenv()

    # Select and initialise adapter based on config
    if settings.rag_adapter_mode == "sqlite":
        from rag_service.adapters.sqlite_adapter import SqliteAdapter

        adapter = SqliteAdapter(settings.sqlite_db_path)
    else:
        from rag_service.adapters.http_adapter import HttpApiAdapter

        adapter = HttpApiAdapter(settings.nextjs_api_base_url, settings.admin_api_key)

    init_adapter(adapter)
    observability.get_langfuse()  # log once at startup whether tracing is on
    print(
        f"🚀 Roadmap RAG Assistant started "
        f"(adapter={settings.rag_adapter_mode}, model={settings.llm_model})"
    )

    yield

    # Cleanup
    observability.flush()
    if hasattr(adapter, "close"):
        await adapter.close()
    print("👋 Roadmap RAG Assistant stopped")


app = FastAPI(
    title="Roadmap RAG Assistant",
    description="Mini RAG service for CUD operations on Topic/Layer/Group/Item via natural language",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
from rag_service.api.routes import router  # noqa: E402

app.include_router(router)
