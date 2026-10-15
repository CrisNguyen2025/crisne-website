"""FastAPI route handlers — /chat, /chat/stream (SSE), /health."""

from __future__ import annotations

import json
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from rag_service.agent import build_agent, FallbackAgent
from rag_service.api.schemas import (
    ActionConfirmRequest,
    ActionConfirmResponse,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    PlanRequest,
    PlanResponse,
    ToolCallResult,
)
from rag_service.auth import Actor, OWNER_ONLY_MESSAGE, is_owner, parse_actor, set_actor
from rag_service.config import settings
from rag_service.tools import ALL_TOOLS

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


async def _sse_stream_generator(
    message: str, thread_id: str, context: dict | None = None, actor: Actor | None = None
) -> AsyncGenerator[str, None]:
    """Universal SSE generator that handles both LangChain and FallbackAgent streaming."""
    # The body is streamed after the handler returns: set the caller where the agent runs
    if actor is not None:
        set_actor(actor)
    agent = _get_agent()
    accumulated_tokens: list[str] = []
    executed_tools: list[dict] = []

    config = {"configurable": {"thread_id": thread_id}}

    async def _stream_from_fallback(f_agent: FallbackAgent):
        async for ev in f_agent.astream_events(
            {"messages": [{"role": "user", "content": message}], "context": context},
            config=config,
        ):
            ev_type = ev.get("type")
            if ev_type == "tool_start":
                payload = {"name": ev.get("name"), "args": ev.get("args", {})}
                yield f"event: tool_start\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
            elif ev_type == "tool_end":
                tool_record = {"name": ev.get("name"), "result": ev.get("result", "")}
                executed_tools.append(tool_record)
                yield f"event: tool_end\ndata: {json.dumps(tool_record, ensure_ascii=False)}\n\n"
            elif ev_type == "token":
                delta = ev.get("delta", "")
                accumulated_tokens.append(delta)
                yield f"event: token\ndata: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"

    try:
        if isinstance(agent, FallbackAgent):
            async for chunk in _stream_from_fallback(agent):
                yield chunk
        else:
            # LangGraph / LangChain Gemini Agent
            try:
                async for event in agent.astream_events(
                    {"messages": [{"role": "user", "content": message}], "context": context},
                    config=config,
                    version="v2",
                ):
                    event_name = event.get("event")

                    if event_name == "on_tool_start":
                        name = event.get("name", "tool")
                        args = event.get("data", {}).get("input", {})
                        yield f"event: tool_start\ndata: {json.dumps({'name': name, 'args': args}, ensure_ascii=False)}\n\n"

                    elif event_name == "on_tool_end":
                        name = event.get("name", "tool")
                        output = str(event.get("data", {}).get("output", ""))
                        tool_record = {"name": name, "result": output}
                        executed_tools.append(tool_record)
                        yield f"event: tool_end\ndata: {json.dumps(tool_record, ensure_ascii=False)}\n\n"

                    elif event_name == "on_chat_model_stream":
                        chunk = event.get("data", {}).get("chunk")
                        if chunk and hasattr(chunk, "content"):
                            delta = chunk.content
                            if isinstance(delta, str) and delta:
                                accumulated_tokens.append(delta)
                                yield f"event: token\ndata: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            except Exception as gemini_err:
                print(f"[Routes] Gemini API error ({gemini_err}). Gracefully falling back to NLP agent...")
                fallback = FallbackAgent(tools=ALL_TOOLS)
                async for chunk in _stream_from_fallback(fallback):
                    yield chunk

        # Final done event
        final_message = "".join(accumulated_tokens)
        done_payload = {
            "message": final_message,
            "tool_calls": executed_tools,
        }
        yield f"event: done\ndata: {json.dumps(done_payload, ensure_ascii=False)}\n\n"

    except Exception as exc:
        err_payload = {"error": str(exc)}
        yield f"event: error\ndata: {json.dumps(err_payload, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    """Server-Sent Events (SSE) streaming endpoint for real-time tokens and tool events."""
    return StreamingResponse(
        _sse_stream_generator(req.message, req.thread_id, req.context, _actor_of(request)),
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
            tool_calls = [
                ToolCallResult(name=m.name, args={}, result=m.content)
                for m in msgs if getattr(m, "type", "") == "tool"
            ]
            last_content = msgs[-1].content if msgs else ""
            return ChatResponse(message=last_content, tool_calls=tool_calls)

        result = agent.invoke(
            {"messages": [{"role": "user", "content": req.message}], "context": req.context, "fast": True},
            config={"configurable": {"thread_id": req.thread_id}},
        )

        tool_calls: list[ToolCallResult] = []
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
        final_text = last_msg.content if hasattr(last_msg, "content") else str(last_msg)
        return ChatResponse(message=final_text, tool_calls=tool_calls)

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
        return ChatResponse(message=last_content, tool_calls=tool_calls)


@router.post("/chat/plan", response_model=PlanResponse)
async def plan(req: PlanRequest):
    """Choose one WebMCP tool for the browser to execute. Does not execute anything itself."""
    from rag_service.webmcp_planner import plan_webmcp_call

    agent = _get_agent()
    result = await plan_webmcp_call(getattr(agent, "llm", None), req.message, req.tools, req.context)
    return PlanResponse(**result)


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        adapter_mode=settings.rag_adapter_mode,
        llm_model=settings.llm_model,
        tools_count=len(ALL_TOOLS),
    )


@router.post("/chat/confirm", response_model=ActionConfirmResponse)
async def confirm_action(req: ActionConfirmRequest, request: Request) -> ActionConfirmResponse:
    """Confirm and execute a pending dry-run CUD action."""
    from rag_service.execution.executor import ActionExecutor
    from rag_service.state.session_store import session_store

    set_actor(_actor_of(request))
    if not is_owner():
        return ActionConfirmResponse(success=False, message=OWNER_ONLY_MESSAGE)

    tid = req.action_id or req.thread_id
    ctx = session_store.get_or_create(tid)
    if not ctx.pending_confirmation:
        return ActionConfirmResponse(
            success=False,
            message="Không có thao tác nào đang chờ xác nhận."
        )

    action = ctx.pending_confirmation
    ctx.pending_confirmation = None
    executor = ActionExecutor()
    ok, msg = await executor.aexecute(action, session_id=tid)
    return ActionConfirmResponse(success=ok, message=msg)


@router.post("/chat/cancel", response_model=ActionConfirmResponse)
async def cancel_action(req: ActionConfirmRequest) -> ActionConfirmResponse:
    """Cancel a pending dry-run CUD action."""
    from rag_service.state.session_store import session_store

    tid = req.action_id or req.thread_id
    ctx = session_store.get_or_create(tid)
    ctx.pending_confirmation = None
    return ActionConfirmResponse(success=True, message="Đã hủy bỏ thao tác theo yêu cầu.")


