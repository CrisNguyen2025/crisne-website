"""Read-only local turn tracer for the `abot-trace-report` skill.

Runs one message through `NextGenRoadmapAgent` in an isolated in-memory Thread
(never writes ThreadMessage, ThreadState, OwnerMemory touches, or DB mutations)
and emits the same JSON shape as `fetch-trace.ts` on stdout.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
RAG_ROOT = REPO_ROOT / "roadmap-rag-assistant"
if str(RAG_ROOT) not in sys.path:
    sys.path.insert(0, str(RAG_ROOT))

MAX_IO_CHARS = 4000


def _iso_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _cut(value: Any, mask_fn: Any) -> Any:
    masked = mask_fn(data=value) if mask_fn is not None else value
    if masked is None or isinstance(masked, (int, float, bool)):
        return masked
    text = masked if isinstance(masked, str) else json.dumps(masked, ensure_ascii=False, default=str)
    return f"{text[:MAX_IO_CHARS]}… [cut, {len(text)} chars]" if len(text) > MAX_IO_CHARS else masked


class _CaptureObservation:
    def __init__(
        self,
        registry: list[_CaptureObservation],
        trace_id: str,
        *,
        name: str,
        as_type: str = "span",
        parent_id: str | None = None,
        model: str | None = None,
        input_data: Any = None,
        metadata: Any = None,
    ) -> None:
        self.id = uuid.uuid4().hex[:16]
        self.trace_id = trace_id
        self.parent_id = parent_id
        self.name = name
        self.type = as_type.upper()
        self.level = "DEFAULT"
        self.status_message: str | None = None
        self.start_time = _iso_now()
        self._t0 = time.perf_counter()
        self.latency_ms: int | None = None
        self.model = model
        self.usage: dict[str, Any] | None = None
        self.input = input_data
        self.output: Any = None
        self.metadata: dict[str, Any] = dict(metadata) if isinstance(metadata, dict) else {}
        registry.append(self)
        self._registry = registry

    def start_observation(self, *, name: str, as_type: str = "span", **kwargs: Any) -> _CaptureObservation:
        return _CaptureObservation(
            self._registry,
            self.trace_id,
            name=name,
            as_type=as_type,
            parent_id=self.id,
            model=kwargs.get("model"),
            input_data=kwargs.get("input"),
            metadata=kwargs.get("metadata"),
        )

    def update(self, **kwargs: Any) -> None:
        if "output" in kwargs:
            self.output = kwargs["output"]
        if kwargs.get("level"):
            self.level = str(kwargs["level"]).upper()
        if "status_message" in kwargs:
            self.status_message = kwargs["status_message"]
        if kwargs.get("usage_details") is not None:
            self.usage = kwargs["usage_details"]
        if kwargs.get("model"):
            self.model = kwargs["model"]
        meta = kwargs.get("metadata")
        if isinstance(meta, dict):
            self.metadata.update(meta)

    def end(self) -> None:
        if self.latency_ms is None:
            self.latency_ms = round((time.perf_counter() - self._t0) * 1000)


class _CaptureLangfuse:
    def __init__(self, trace_id: str) -> None:
        self.trace_id = trace_id
        self.observations: list[_CaptureObservation] = []

    def start_observation(self, *, name: str, as_type: str = "agent", **kwargs: Any) -> _CaptureObservation:
        return _CaptureObservation(
            self.observations,
            self.trace_id,
            name=name,
            as_type=as_type,
            input_data=kwargs.get("input"),
            metadata=kwargs.get("metadata"),
        )


def _depth_of(obs: _CaptureObservation, by_id: dict[str, _CaptureObservation]) -> int:
    depth = 0
    cur = by_id.get(obs.parent_id) if obs.parent_id else None
    while cur is not None and depth < 50:
        depth += 1
        cur = by_id.get(cur.parent_id) if cur.parent_id else None
    return depth


async def _init_read_only_data(force_sqlite: bool) -> str:
    from rag_service.adapters.http_adapter import HttpApiAdapter
    from rag_service.adapters.sqlite_adapter import SqliteAdapter
    from rag_service.config import settings
    from rag_service.domains.roadmap.retrieval.engine import rag_engine
    from rag_service.tools import init_adapter

    sqlite_path = Path(settings.sqlite_db_path)
    if not sqlite_path.is_absolute():
        candidate = (RAG_ROOT / sqlite_path).resolve()
        sqlite_path = candidate if candidate.exists() else (REPO_ROOT / "prisma" / "dev.db")

    if not force_sqlite and settings.rag_adapter_mode == "http":
        http_adapter = HttpApiAdapter(settings.nextjs_api_base_url, settings.admin_api_key)
        init_adapter(http_adapter)
        count = await rag_engine.sync_live_database()
        if count > 0 or rag_engine._last_error is None:
            return "http"
        await http_adapter.close()

    settings.rag_adapter_mode = "sqlite"
    init_adapter(SqliteAdapter(str(sqlite_path)))
    await rag_engine.sync_live_database()
    return f"sqlite:{sqlite_path.name}"


def _isolate_stores() -> None:
    from rag_service.core.augmentation import history as history_mod
    from rag_service.core.generation import delivery as delivery_mod
    from rag_service.core.memory import owner_memory_store
    from rag_service.domains.roadmap import agent as agent_mod
    from rag_service.state import session_store

    ram_history = history_mod.InMemoryHistoryStore()
    history_mod.history_store = ram_history
    delivery_mod.history_store = ram_history
    agent_mod.history_store = ram_history
    session_store._api = None
    owner_memory_store.record_usage = lambda _ids: None  # type: ignore[method-assign]


def _build_page_context(args: argparse.Namespace) -> dict[str, str] | None:
    ctx: dict[str, str] = {}
    if args.topic:
        ctx["roadmapSlug"] = args.topic
    if args.lesson_id:
        ctx["itemId"] = args.lesson_id
    if args.section:
        ctx["section"] = args.section
    return ctx or None


async def _run_trace(args: argparse.Namespace) -> dict[str, Any]:
    from dotenv import load_dotenv

    for env_path in (REPO_ROOT / ".env.local", REPO_ROOT / ".env", RAG_ROOT / ".env"):
        if env_path.exists():
            load_dotenv(env_path, override=False)

    from rag_service import observability
    from rag_service.auth import set_actor
    from rag_service.domains.roadmap.agent import NextGenRoadmapAgent, build_agent
    from rag_service.pii import mask_trace_data

    trace_id = uuid.uuid4().hex
    capture = _CaptureLangfuse(trace_id)
    observability.get_langfuse = lambda: capture  # type: ignore[assignment]
    _isolate_stores()
    data_source = await _init_read_only_data(args.sqlite)

    set_actor(args.actor)
    agent = NextGenRoadmapAgent(llm_model=None) if args.offline else build_agent()
    session_id = f"{args.actor}:dev-trace-{trace_id[:8]}"
    page_context = _build_page_context(args)

    sse_steps: list[dict[str, Any]] = []
    tokens: list[str] = []
    async for ev in agent.astream_events(
        {"messages": [{"role": "user", "content": args.message}], "context": page_context, "fast": True},
        config={"configurable": {"thread_id": session_id}},
    ):
        if ev.get("type") == "step" and ev.get("status") != "running":
            sse_steps.append({k: v for k, v in ev.items() if k != "type"})
        elif ev.get("type") == "token":
            tokens.append(ev.get("delta", ""))

    by_id = {obs.id: obs for obs in capture.observations}
    root = capture.observations[0] if capture.observations else None
    env_label = f"local-{'offline' if args.offline else 'dev'} ({data_source})"

    return {
        "traceId": trace_id,
        "found": len(capture.observations) > 0,
        "searchedDays": 0,
        "traceUrl": None,
        "traceName": root.name if root else "roadmap-assistant",
        "environment": env_label,
        "startTime": root.start_time if root else _iso_now(),
        "totalLatencyMs": root.latency_ms if root else None,
        "sessionId": session_id,
        "observations": [
            {
                "depth": _depth_of(obs, by_id),
                "name": obs.name,
                "type": obs.type,
                "level": obs.level,
                "statusMessage": obs.status_message,
                "startTime": obs.start_time,
                "latencyMs": obs.latency_ms,
                "timeToFirstTokenMs": None,
                "model": obs.model,
                "usage": obs.usage,
                "cost": None,
                "metadata": _cut(obs.metadata or None, mask_trace_data),
                "input": _cut(obs.input, mask_trace_data),
                "output": _cut(obs.output, mask_trace_data),
            }
            for obs in capture.observations
        ],
        "sseSteps": sse_steps,
        "scores": [],
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run one isolated local Abot turn and emit trace JSON.")
    parser.add_argument("message", help="User message to trace")
    parser.add_argument("--topic", default="", help="Optional active Topic slug (page_context.roadmapSlug)")
    parser.add_argument("--lesson-id", default="", help="Optional open Lesson id (page_context.itemId)")
    parser.add_argument("--section", default="", help="Optional Section name (page_context.section)")
    parser.add_argument("--actor", choices=("owner", "visitor"), default="owner", help="Caller Actor")
    parser.add_argument("--sqlite", action="store_true", help="Force reading from local SQLite DB")
    parser.add_argument("--offline", action="store_true", help="Run with llm_model=None (deterministic router + RAG)")
    return parser.parse_args()


def main() -> None:
    os.environ.setdefault("LANGFUSE_TRACING_ENVIRONMENT", "local-dev")
    args = _parse_args()
    with contextlib.redirect_stdout(sys.stderr):
        payload = asyncio.run(_run_trace(args))
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
