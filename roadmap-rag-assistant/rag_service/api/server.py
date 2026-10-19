"""FastAPI application entry point.

Start with:
    uvicorn rag_service.api.server:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from rag_service import observability
from rag_service.auth import is_valid_internal_key, parse_actor, set_actor
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
        f"(adapter={settings.rag_adapter_mode}, source={settings.nextjs_api_base_url if settings.rag_adapter_mode == 'http' else settings.sqlite_db_path}, "
        f"model={settings.llm_model})"
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

# Only requests forwarded by the Next.js proxy are served; /health stays open for uptime checks
PUBLIC_PATHS = {"/health"}


@app.middleware("http")
async def require_internal_key(request: Request, call_next):
    if request.method != "OPTIONS" and request.url.path not in PUBLIC_PATHS:
        if not is_valid_internal_key(request.headers.get("x-internal-key"), settings.internal_api_key):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
    # The proxy decides who the caller is; route handlers read it via rag_service.auth
    set_actor(parse_actor(request.headers.get("x-actor")))
    return await call_next(request)


# Added after the auth middleware so it runs first and can answer preflight requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
from rag_service.api.routes import router  # noqa: E402

app.include_router(router)
