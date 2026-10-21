"""Langfuse tracing for the Roadmap Assistant.

One trace per chat turn: an `agent` root observation with child steps
(router, retriever, generation, tools). Everything here is fail-open: when the
LANGFUSE_* keys or the SDK are missing, or Langfuse errors, the agent runs
exactly as before and nothing is traced.

Spans are created with explicit parents (never "current span" context managers)
because the agent is an async generator: context managers held across `yield`
break OpenTelemetry context detach when the stream is cancelled.
"""

from __future__ import annotations

import asyncio
import os
from contextvars import ContextVar
from typing import Any, AsyncGenerator, AsyncIterator, Optional

TRACE_NAME = "roadmap-assistant"
# Also a trace tag: the Next.js triage import filters 👎 scores by it (the portfolio chat shares the score name)
TRACE_TAGS = [TRACE_NAME]

_client: Any = None
_client_ready = False
_warned_missing_keys = False


class TurnTrace:
    """Root observation of one chat turn plus the session id its children inherit."""

    def __init__(self, root: Any, session_id: str) -> None:
        self.root = root
        self.session_id = session_id
        # Turn-level signals merged into the root metadata (filterable in Langfuse).
        self.flags: dict[str, Any] = {}

    def child(self, name: str, as_type: str = "span", **kwargs: Any) -> Any:
        """Start a child observation; returns None if Langfuse fails."""
        try:
            from langfuse import propagate_attributes

            with propagate_attributes(session_id=self.session_id, trace_name=TRACE_NAME, tags=TRACE_TAGS):
                return self.root.start_observation(name=name, as_type=as_type, **kwargs)
        except Exception as exc:
            print(f"[Langfuse] child '{name}' failed: {exc}")
            return None


# The trace of the turn being streamed. Set by `traced_turn`, read by the agent's steps.
_current: ContextVar[Optional[TurnTrace]] = ContextVar("rag_turn_trace", default=None)


def get_langfuse() -> Any:
    """Lazily create the client after `.env` is loaded; None when tracing is off."""
    global _client, _client_ready, _warned_missing_keys
    if _client_ready:
        return _client
    if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
        # Not settled yet: a call made before `.env` is loaded must not switch tracing off for good
        if not _warned_missing_keys:
            print("[Langfuse] LANGFUSE_PUBLIC_KEY/SECRET_KEY not set — tracing disabled.")
            _warned_missing_keys = True
        return None
    _client_ready = True
    try:
        from langfuse import Langfuse

        from rag_service.pii import mask_trace_data

        _client = Langfuse(
            environment=os.getenv("LANGFUSE_TRACING_ENVIRONMENT") or "development",
            release=os.getenv("LANGFUSE_RELEASE") or None,
            # Visitors type emails/phone numbers into the chat; never ship them to Langfuse
            mask=mask_trace_data,
        )
        print("📈 Langfuse tracing enabled.")
    except Exception as exc:
        print(f"[Langfuse] init failed, tracing disabled: {exc}")
        _client = None
    return _client


def current_trace() -> Optional[TurnTrace]:
    return _current.get()


def start_step(name: str, as_type: str = "span", **kwargs: Any) -> Any:
    """Start a child step of the current turn; None when not tracing."""
    trace = _current.get()
    return trace.child(name, as_type, **kwargs) if trace else None


def end_step(obs: Any, **update: Any) -> None:
    """Update (output, level, usage_details, ...) and end a step; no-op for None."""
    if obs is None:
        return
    try:
        if update:
            obs.update(**update)
        obs.end()
    except Exception as exc:
        print(f"[Langfuse] end step failed: {exc}")


def end_step_on_error(obs: Any, exc: BaseException, **update: Any) -> None:
    """End a step its code left through an exception, so the span is still exported.

    A client disconnect (CancelledError / GeneratorExit) is a WARNING, anything else an ERROR.
    """
    if isinstance(exc, (GeneratorExit, asyncio.CancelledError)):
        end_step(obs, level="WARNING", status_message="stream cancelled by client", **update)
    else:
        end_step(obs, level="ERROR", status_message=f"{type(exc).__name__}: {exc}", **update)


def usage_from_langchain(message: Any) -> Optional[dict]:
    """Map LangChain `usage_metadata` to Langfuse usage_details."""
    meta = getattr(message, "usage_metadata", None)
    if not meta:
        return None
    usage = {
        "input": meta.get("input_tokens"),
        "output": meta.get("output_tokens"),
        "total": meta.get("total_tokens"),
    }
    return {k: int(v) for k, v in usage.items() if v is not None} or None


async def traced_turn(
    events: AsyncIterator[dict],
    *,
    message: str,
    session_id: str,
    page_context: Optional[dict] = None,
) -> AsyncGenerator[dict, None]:
    """Wrap the agent's event stream in one trace.

    tool_start/tool_end pairs become `tool` observations, so every agent branch
    is covered without instrumenting each one; streamed tokens become the output.
    """
    lf = get_langfuse()
    trace: Optional[TurnTrace] = None
    if lf is not None:
        try:
            from langfuse import propagate_attributes

            with propagate_attributes(session_id=session_id, trace_name=TRACE_NAME, tags=TRACE_TAGS):
                root = lf.start_observation(
                    name=TRACE_NAME,
                    as_type="agent",
                    input={"message": message, "page_context": page_context},
                )
            trace = TurnTrace(root, session_id)
        except Exception as exc:
            print(f"[Langfuse] trace start failed: {exc}")

    if trace is None:
        async for ev in events:
            yield ev
        return

    token = _current.set(trace)
    open_tools: list[tuple[str, Any]] = []
    output: list[str] = []
    tools_used: list[str] = []
    error: Optional[BaseException] = None
    try:
        # The client sends 👍/👎 with this id, so the feedback score lands on this turn's trace
        if trace_id := getattr(trace.root, "trace_id", None):
            yield {"type": "trace", "trace_id": trace_id}
        async for ev in events:
            kind = ev.get("type")
            if kind == "tool_start":
                name = ev.get("name", "tool")
                tools_used.append(name)
                open_tools.append((name, trace.child(name, "tool", input=ev.get("args") or {})))
            elif kind == "tool_end":
                name = ev.get("name", "tool")
                idx = next((i for i, (n, _) in enumerate(open_tools) if n == name), None)
                if idx is not None:
                    end_step(open_tools.pop(idx)[1], output=ev.get("result", ""))
            elif kind == "token":
                output.append(ev.get("delta", ""))
            yield ev
    except BaseException as exc:  # includes cancellation when the client disconnects
        error = exc
        raise
    finally:
        try:
            _current.reset(token)
        except ValueError:
            pass  # closed from another context (e.g. client disconnect)
        for _, obs in open_tools:
            end_step(obs, level="WARNING", status_message="stream ended before tool_end")
        try:
            update: dict[str, Any] = {
                "output": "".join(output),
                "metadata": {"tools": tools_used, **trace.flags},
            }
            if isinstance(error, (GeneratorExit, asyncio.CancelledError)):
                # User pressed stop or the client disconnected: not a failure.
                update["level"] = "WARNING"
                update["status_message"] = "stream cancelled by client"
            elif error is not None:
                update["level"] = "ERROR"
                update["status_message"] = f"{type(error).__name__}: {error}"
            trace.root.update(**update)
            trace.root.end()
        except Exception as exc:
            print(f"[Langfuse] trace end failed: {exc}")


def flush() -> None:
    if _client is not None:
        try:
            _client.flush()
        except Exception as exc:
            print(f"[Langfuse] flush failed: {exc}")
