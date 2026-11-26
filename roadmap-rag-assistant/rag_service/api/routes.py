"""FastAPI route handlers — /chat, /chat/stream (SSE), /health."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import json
from typing import Any, AsyncGenerator, Sequence

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from rag_service.agent import build_agent, FallbackAgent
from rag_service.api.schemas import (
    ActionConfirmRequest,
    ActionConfirmResponse,
    ChatRequest,
    ChatResponse,
    ContextRequest,
    HealthResponse,
    MatchLessonsRequest,
    MatchLessonsResponse,
    PlanRequest,
    PlanResponse,
    ToolCallResult,
)
from rag_service.auth import Actor, OWNER_ONLY_MESSAGE, is_owner, parse_actor, set_actor
from rag_service.config import settings
from rag_service.tools import ALL_TOOLS
from rag_service.write_grant import write_granted

router = APIRouter()

# Lazy-initialised agent (built on first request)
_agent = None


def _get_agent():
    global _agent
    if _agent is None:
        _agent = build_agent()
    return _agent


def _actor_of(request: Request) -> Actor:
    """Caller as stated by the Next.js proxy (the auth middleware already checked the key)."""
    return parse_actor(request.headers.get("x-actor"))


_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()
_DEBOUNCE_TASKS: dict[str, asyncio.Task[Any]] = {}
MEMORY_EXTRACT_DEBOUNCE_SECONDS = 1.5
_SKIP_MEMORY_TOOLS = {
    "save_owner_memory",
    "archive_owner_memory",
    "list_owner_memories",
    "start_lesson_quiz",
    "grade_lesson_quiz",
    "mark_lesson_reviewed",
}


@dataclass
class _SseTurnState:
    accumulated_tokens: list[str] = field(default_factory=list)
    executed_tools: list[dict] = field(default_factory=list)
    steps: dict[str, dict] = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)
    changes: list[dict] = field(default_factory=list)
    had_preview: bool = False
    trace_id: str | None = None
    answer_mode: str | None = None


def _sse_line(event: str, payload: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


_WEBMCP_READ_ONLY_TOOLS = frozenset({"get_current_context", "list_roadmaps", "get_roadmap", "export_roadmaps"})


def _normalize_action_preview_payload(ev: dict) -> dict:
    payload = {k: v for k, v in ev.items() if k != "type"}
    if "confirmable" not in payload:
        payload["confirmable"] = True
    if "kind" not in payload:
        from rag_service.state.session_store import session_store

        action_id = str(payload.get("action_id") or "")
        active = session_store.get_or_create(action_id).active_pending() if action_id else None
        payload["kind"] = active[1] if active else "section_rename"
    return payload


def _record_step_event(ev: dict, state: _SseTurnState) -> str:
    payload = {k: v for k, v in ev.items() if k != "type"}
    state.steps[payload["id"]] = {**state.steps.get(payload["id"], {}), **payload}
    if payload.get("id") == "answer" and payload.get("mode"):
        state.answer_mode = str(payload["mode"])
    return _sse_line("step", payload)


def _dispatch_fallback_event(ev: dict, state: _SseTurnState) -> str | None:
    ev_type = ev.get("type")
    if ev_type == "tool_start":
        return _sse_line("tool_start", {"name": ev.get("name"), "args": ev.get("args", {})})
    if ev_type == "tool_end":
        tool_record: dict[str, Any] = {"name": ev.get("name"), "result": ev.get("result", "")}
        if "is_error" in ev:
            tool_record["is_error"] = bool(ev["is_error"])
        state.executed_tools.append(tool_record)
        return _sse_line("tool_end", tool_record)
    if ev_type == "token":
        delta = ev.get("delta", "")
        state.accumulated_tokens.append(delta)
        return _sse_line("token", {"delta": delta})
    if ev_type == "step":
        return _record_step_event(ev, state)
    if ev_type == "change_review":
        payload = {k: v for k, v in ev.items() if k != "type"}
        state.changes.append(payload)
        return _sse_line("change_review", payload)
    if ev_type == "action_preview":
        state.had_preview = True
        return _sse_line("action_preview", _normalize_action_preview_payload(ev))
    if ev_type == "metadata":
        state.metadata.update({k: v for k, v in ev.items() if k != "type"})
        return None
    if ev_type == "trace":
        state.trace_id = ev.get("trace_id")
        return f"event: trace\ndata: {json.dumps({'trace_id': state.trace_id})}\n\n"
    return None


async def _stream_fallback_sse(
    f_agent: FallbackAgent,
    message: str,
    context: dict | None,
    extra_input: dict,
    config: dict,
    state: _SseTurnState,
) -> AsyncGenerator[str, None]:
    async for ev in f_agent.astream_events(
        {"messages": [{"role": "user", "content": message}], "context": context, **extra_input},
        config=config,
    ):
        chunk = _dispatch_fallback_event(ev, state)
        if chunk is not None:
            yield chunk


def _dispatch_langgraph_event(event: dict, state: _SseTurnState) -> str | None:
    event_name = event.get("event")
    if event_name == "on_tool_start":
        name = event.get("name", "tool")
        args = event.get("data", {}).get("input", {})
        return _sse_line("tool_start", {"name": name, "args": args})
    if event_name == "on_tool_end":
        name = event.get("name", "tool")
        raw_output = event.get("data", {}).get("output", "")
        tool_record: dict[str, Any] = {"name": name, "result": str(raw_output)}
        # LangChain marks a failed tool call on its ToolMessage
        status = getattr(raw_output, "status", None)
        if status in ("success", "error"):
            tool_record["is_error"] = status == "error"
        state.executed_tools.append(tool_record)
        return _sse_line("tool_end", tool_record)
    if event_name == "on_chat_model_stream":
        chunk = event.get("data", {}).get("chunk")
        delta = getattr(chunk, "content", None) if chunk else None
        if isinstance(delta, str) and delta:
            state.accumulated_tokens.append(delta)
            return _sse_line("token", {"delta": delta})
    return None


def _build_done_payload(state: _SseTurnState) -> dict[str, Any]:
    done_payload: dict[str, Any] = {
        "message": "".join(state.accumulated_tokens),
        "tool_calls": state.executed_tools,
        "steps": list(state.steps.values()),
    }
    if state.metadata:
        done_payload["metadata"] = state.metadata
    if state.changes:
        done_payload["changes"] = state.changes
    if state.trace_id:
        done_payload["trace_id"] = state.trace_id
    return done_payload


async def drain_background_tasks(max_wait_seconds: float = 3.0) -> None:
    """Await queued background extraction and usage-touch tasks cleanly on server shutdown."""
    from rag_service.core.memory import owner_memory_store

    pending = [task for task in list(_BACKGROUND_TASKS) if not task.done()]
    if pending:
        await asyncio.wait(pending, timeout=max_wait_seconds)
    try:
        async with asyncio.timeout(max_wait_seconds):
            await owner_memory_store.flush_touches()
    except Exception as exc:
        print(f"[Routes] Skipped flushing memory touches on shutdown: {exc}")


def _maybe_schedule_memory_extraction(
    agent: Any,
    message: str,
    final_message: str,
    thread_id: str,
    context: dict | None,
    state: _SseTurnState | None = None,
    *,
    had_preview: bool = False,
    has_changes: bool = False,
    executed_tool_names: Sequence[str] = (),
) -> None:
    # Background Owner Memory auto-suggestion (ADR-0015 / ADR-0020): strictly Owner-only, non-blocking,
    # skipped on explicit memory/CUD/preview/quiz turns to avoid redundant LLM calls.
    skip_preview = had_preview or (state.had_preview if state is not None else False)
    skip_changes = has_changes or bool(state.changes if state is not None else False)
    tools = list(executed_tool_names)
    if state is not None:
        tools.extend(str(t.get("name") or "") for t in state.executed_tools)
    if (
        not is_owner()
        or skip_preview
        or skip_changes
        or any(name in _SKIP_MEMORY_TOOLS for name in tools)
    ):
        return
    from rag_service.core.memory import has_memory_signal, maybe_suggest_memories
    from rag_service.state import session_store

    extract_llm = getattr(agent, "router_llm", None) or getattr(agent, "llm", None)
    effective_reply = "" if (state is not None and state.answer_mode == "context") else final_message
    if extract_llm is None or not has_memory_signal(message, effective_reply):
        return
    ctx_topic = ((context or {}).get("roadmapSlug") or "").strip() or session_store.get_or_create(
        thread_id
    ).active_topic_slug
    prior = _DEBOUNCE_TASKS.get(thread_id)
    if prior is not None and not prior.done():
        prior.cancel()

    async def _debounced_extract() -> None:
        if MEMORY_EXTRACT_DEBOUNCE_SECONDS > 0:
            await asyncio.sleep(MEMORY_EXTRACT_DEBOUNCE_SECONDS)
        await maybe_suggest_memories(
            extract_llm,
            user_message=message,
            assistant_reply=effective_reply,
            scope=ctx_topic,
            source_thread_id=thread_id,
        )

    task = asyncio.create_task(_debounced_extract())
    _DEBOUNCE_TASKS[thread_id] = task
    _BACKGROUND_TASKS.add(task)

    def _cleanup(done_task: asyncio.Task[Any]) -> None:
        _BACKGROUND_TASKS.discard(done_task)
        if _DEBOUNCE_TASKS.get(thread_id) is done_task:
            _DEBOUNCE_TASKS.pop(thread_id, None)

    task.add_done_callback(_cleanup)
    _schedule_lazy_observations(extract_llm)


def _schedule_lazy_observations(extract_llm: Any) -> None:
    if not is_owner() or extract_llm is None:
        return
    from rag_service.domains.roadmap.observations import maybe_schedule_lazy_observations

    obs_task = asyncio.create_task(maybe_schedule_lazy_observations(extract_llm))
    _BACKGROUND_TASKS.add(obs_task)
    obs_task.add_done_callback(_BACKGROUND_TASKS.discard)


def _schedule_sync_chat_memory(agent: Any, req: ChatRequest, response: ChatResponse) -> None:
    if not is_owner():
        return
    from rag_service.state.session_store import _PENDING_FIELDS, session_store

    ctx = session_store.get_or_create(req.thread_id)
    has_pending = any(getattr(ctx, slot, None) is not None for slot in _PENDING_FIELDS)
    tool_names = [t.name for t in response.tool_calls]
    has_changes = any(
        name.startswith(("create_", "update_", "delete_", "rename_"))
        or name in ("import_items_from_text", "promote_concept_to_lesson")
        for name in tool_names
    )
    _maybe_schedule_memory_extraction(
        agent,
        req.message,
        response.message,
        req.thread_id,
        req.context,
        had_preview=has_pending or ("Xác nhận thực hiện" in response.message),
        has_changes=has_changes,
        executed_tool_names=tool_names,
    )


def _build_sse_extra_input(titles: list[str] | None, target: dict | None) -> dict:
    extra_input: dict = {}
    if titles:
        extra_input["titles"] = titles
    if target is not None:
        extra_input["target"] = target
    return extra_input


async def _stream_sse_agent_events(
    agent: Any,
    message: str,
    context: dict | None,
    extra_input: dict,
    config: dict,
    state: _SseTurnState,
) -> AsyncGenerator[str, None]:
    if isinstance(agent, FallbackAgent):
        async for chunk in _stream_fallback_sse(agent, message, context, extra_input, config, state):
            yield chunk
        return
    try:
        async for event in agent.astream_events(
            {"messages": [{"role": "user", "content": message}], "context": context, **extra_input},
            config=config,
            version="v2",
        ):
            sse_chunk = _dispatch_langgraph_event(event, state)
            if sse_chunk is not None:
                yield sse_chunk
    except Exception as gemini_err:
        print(f"[Routes] Gemini API error ({gemini_err}). Gracefully falling back to NLP agent...")
        fallback = FallbackAgent(tools=ALL_TOOLS)
        async for chunk in _stream_fallback_sse(fallback, message, context, extra_input, config, state):
            yield chunk


async def _sse_stream_generator(
    message: str,
    thread_id: str,
    context: dict | None = None,
    actor: Actor | None = None,
    titles: list[str] | None = None,
    target: dict | None = None,
) -> AsyncGenerator[str, None]:
    """Universal SSE generator that handles both LangChain and FallbackAgent streaming."""
    # The body is streamed after the handler returns: set the caller where the agent runs
    if actor is not None:
        set_actor(actor)
    agent = _get_agent()
    state = _SseTurnState()
    config = {"configurable": {"thread_id": thread_id}}
    # Only sent with a confirmation that edits names or target; other agents never see the keys
    extra_input = _build_sse_extra_input(titles, target)

    try:
        async for chunk in _stream_sse_agent_events(agent, message, context, extra_input, config, state):
            yield chunk

        done_payload = _build_done_payload(state)
        yield _sse_line("done", done_payload)
        _maybe_schedule_memory_extraction(
            agent, message, done_payload["message"], thread_id, context, state
        )

    except Exception as exc:
        yield _sse_line("error", {"error": str(exc)})


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    """Server-Sent Events (SSE) streaming endpoint for real-time tokens and tool events."""
    return StreamingResponse(
        _sse_stream_generator(
            req.message,
            req.thread_id,
            req.context,
            _actor_of(request),
            req.titles,
            req.target.model_dump(exclude_none=True) if req.target else None,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request) -> ChatResponse:
    """Synchronous chat endpoint (compatible with legacy SDK callers)."""
    set_actor(_actor_of(request))
    agent = _get_agent()

    try:
        if isinstance(agent, FallbackAgent):
            res = await agent.ainvoke(
                {"messages": [{"role": "user", "content": req.message}], "context": req.context, "fast": True},
                config={"configurable": {"thread_id": req.thread_id}},
            )
            msgs = res.get("messages", [])
            tool_calls: list[ToolCallResult] = [
                ToolCallResult(name=m.name, args={}, result=m.content)
                for m in msgs if getattr(m, "type", "") == "tool"
            ]
            last_content = msgs[-1].content if msgs else ""
            response = ChatResponse(message=last_content, tool_calls=tool_calls)
            _schedule_sync_chat_memory(agent, req, response)
            return response

        result = agent.invoke(
            {"messages": [{"role": "user", "content": req.message}], "context": req.context, "fast": True},
            config={"configurable": {"thread_id": req.thread_id}},
        )

        tool_calls = []
        messages = result.get("messages", [])
        for msg in messages:
            if hasattr(msg, "type") and msg.type == "tool":
                tool_calls.append(
                    ToolCallResult(
                        name=msg.name or "tool",
                        args={},
                        result=str(msg.content)[:500],
                    )
                )

        last_msg = messages[-1] if messages else None
        final_text = last_msg.content if last_msg is not None and hasattr(last_msg, "content") else str(last_msg)
        response = ChatResponse(message=final_text, tool_calls=tool_calls)
        _schedule_sync_chat_memory(agent, req, response)
        return response

    except Exception as exc:
        print(f"[Routes] Chat error ({exc}), using fallback agent...")
        fallback = FallbackAgent(tools=ALL_TOOLS)
        res = await fallback.ainvoke(
            {"messages": [{"role": "user", "content": req.message}], "context": req.context, "fast": True},
            config={"configurable": {"thread_id": req.thread_id}},
        )
        msgs = res.get("messages", [])
        tool_calls = [
            ToolCallResult(name=m.name, args={}, result=m.content)
            for m in msgs if getattr(m, "type", "") == "tool"
        ]
        last_content = msgs[-1].content if msgs else ""
        response = ChatResponse(message=last_content, tool_calls=tool_calls)
        _schedule_sync_chat_memory(fallback, req, response)
        return response


@router.post("/chat/context")
async def chat_context(req: ContextRequest) -> dict:
    """What the thread's next answer carries, against Abot's budget (rag_service/context_usage.py)."""
    import asyncio

    from rag_service.context_usage import conversation_context
    from rag_service.core.augmentation.history import history_store
    from rag_service.core.memory import owner_memory_store
    from rag_service.domains.roadmap.profile import PROFILE
    from rag_service.state import session_store

    # Restore Owner thread state & history from Turso if this instance just cold-started (ADR-0012)
    await asyncio.gather(history_store.load(req.thread_id), session_store.load(req.thread_id))
    session_ctx = session_store.get_or_create(req.thread_id)
    memories = await owner_memory_store.list_active(session_ctx.active_topic_slug) if is_owner() else []

    return conversation_context(
        req.thread_id,
        PROFILE,
        model=settings.llm_model,
        window=settings.llm_context_window or None,
        history=history_store,
        owner_memories=memories,
        memory_scope=session_ctx.active_topic_slug,
    )


@router.post("/chat/plan", response_model=PlanResponse)
async def plan(req: PlanRequest, request: Request) -> PlanResponse:
    """Choose one read-only WebMCP tool for the browser to execute. Does not execute anything itself."""
    from rag_service.webmcp_planner import plan_webmcp_call

    set_actor(_actor_of(request))
    candidate_tools = (
        req.tools
        if is_owner()
        else [t for t in req.tools if str(t.get("name") or "") in _WEBMCP_READ_ONLY_TOOLS]
    )
    agent = _get_agent()
    result = await plan_webmcp_call(getattr(agent, "llm", None), req.message, candidate_tools, req.context)
    chosen = result.get("tool")
    if chosen and chosen not in _WEBMCP_READ_ONLY_TOOLS:
        reply = (
            OWNER_ONLY_MESSAGE
            if not is_owner()
            else "Thao tác ghi cần chạy qua khung chat Abot để xem Preview và xác nhận trước."
        )
        return PlanResponse(tool=None, args={}, reply=reply)
    return PlanResponse(**result)


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint."""
    from rag_service.domains.roadmap.retrieval.engine import rag_engine

    return HealthResponse(
        status="ok",
        adapter_mode=settings.rag_adapter_mode,
        llm_model=settings.llm_model,
        tools_count=len(ALL_TOOLS),
        index=rag_engine.index_status(),
    )


@router.post("/internal/reindex", status_code=202)
async def reindex() -> dict:
    """Next.js calls this after each roadmap write; the rebuild runs in the background.

    Behind the internal key like every route; it only re-reads the roadmap, so any actor may trigger it.
    """
    from rag_service.domains.roadmap.retrieval.engine import rag_engine

    rag_engine.request_reindex()
    return {"status": "queued"}


@router.post("/internal/memory-cache/invalidate", status_code=200)
async def invalidate_memory_cache() -> dict:
    """Next.js calls this after Owner Memory mutations in /api/v1/memories so RAM cache drops immediately (ADR-0015)."""
    from rag_service.core.memory import owner_memory_store

    owner_memory_store.invalidate()
    return {"status": "invalidated"}


@router.post("/memories/observations/refresh")
async def refresh_owner_observations(request: Request):
    """Owner-only endpoint to trigger immediate 30-day observation synthesis + stale pruning."""
    from fastapi.responses import JSONResponse
    from rag_service.domains.roadmap.observations import synthesize_owner_observations

    set_actor(_actor_of(request))
    if not is_owner():
        return JSONResponse({"error": OWNER_ONLY_MESSAGE}, status_code=403)
    try:
        raw_body = await request.json()
    except Exception:
        raw_body = {}
    force = bool(raw_body.get("force", True)) if isinstance(raw_body, dict) else True
    agent = _get_agent()
    llm = getattr(agent, "router_llm", None) or getattr(agent, "llm", None)
    return await synthesize_owner_observations(llm, force=force)


@router.post("/internal/match-lessons", response_model=MatchLessonsResponse)
async def match_lessons_internal(req: MatchLessonsRequest) -> MatchLessonsResponse:
    from rag_service.domains.roadmap.linking_advisor import match_news_to_lessons

    result = await match_news_to_lessons(
        title=req.title,
        tldr=req.tldr,
        takeaways=req.takeaways,
        tags=req.tags,
        limit=req.limit,
    )
    return MatchLessonsResponse(**result)


@router.post("/chat/confirm", response_model=ActionConfirmResponse, response_model_exclude_none=True)
async def confirm_action(req: ActionConfirmRequest, request: Request) -> ActionConfirmResponse:
    """Confirm and execute any pending previewed action."""
    from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
    from rag_service.state.session_store import session_store

    set_actor(_actor_of(request))
    if not is_owner():
        return ActionConfirmResponse(success=False, message=OWNER_ONLY_MESSAGE)

    tid = req.action_id or req.thread_id
    ctx = session_store.get_or_create(tid)
    if ctx.active_pending() is None:
        return ActionConfirmResponse(
            success=False,
            message="Không có thao tác nào đang chờ xác nhận (hoặc thao tác đã hết hạn sau 10 phút).",
        )

    agent = _get_agent()
    runner = agent if hasattr(agent, "confirm_pending_action") else NextGenRoadmapAgent(llm_model=None)
    target_dict = req.target.model_dump(exclude_none=True) if req.target else None
    with write_granted("confirmed preview"):
        ok, msg, kind, changes_payload = await runner.confirm_pending_action(
            session_id=tid,
            session_ctx=ctx,
            titles=req.titles,
            target=target_dict,
        )
    return ActionConfirmResponse(success=ok, message=msg, kind=kind, changes=changes_payload)


@router.post("/chat/cancel", response_model=ActionConfirmResponse, response_model_exclude_none=True)
async def cancel_action(req: ActionConfirmRequest, request: Request) -> ActionConfirmResponse:
    """Cancel any pending previewed action."""
    from rag_service.state.session_store import session_store

    set_actor(_actor_of(request))
    if not is_owner():
        return ActionConfirmResponse(success=False, message=OWNER_ONLY_MESSAGE)

    tid = req.action_id or req.thread_id
    ctx = session_store.get_or_create(tid)
    active = ctx.active_pending()
    cancelled_kind = active[1] if active is not None else None
    ctx.clear_confirmable_pending()
    return ActionConfirmResponse(
        success=True,
        message="Đã hủy bỏ thao tác theo yêu cầu.",
        kind=cancelled_kind,
    )


