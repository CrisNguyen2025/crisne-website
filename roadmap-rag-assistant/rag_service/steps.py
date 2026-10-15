"""Step events: a structured timeline of one chat turn, streamed to the UI as `event: step`.

Contract (data of each SSE `step` event, JSON):

    id           str    Stable within the turn. Later events with the same id update that step.
    kind         str    routing | retrieval | tool | generation | guard
    status       str    running | done | error
    duration_ms  int    On done/error, when a running event for the same id came first (server clock).
    detail       str    Optional short summary, already human readable.

Per kind (all optional unless noted):

    routing      intent, confidence, method (heuristic | llm | default)
    retrieval    count (required), items: [{title, type, topic, href, score*}]
    tool         name (required), args*, result (first 300 chars, on done)
    generation   mode: llm | context | no_match | template; fallback_reason: llm_error
    guard*       grounding: ok | issues; ungrounded_terms, future_promise, invalid_links

    * owner only: visitors never receive scores, tool args or the guard step.
      `score` orders the items only: its scale depends on which retrieval path matched
      (cosine, RRF or BM25), so never show it as a percentage.

`tool_start` / `tool_end` / `token` / `done` / `error` events are unchanged; `done` also carries
`steps`: the final state of every step, in the order they started. A routing step exists only
when the intent router runs (commands like /plan or a pending confirmation skip it). A tool step
that is `done` has finished; whether it succeeded is in its `result`.
"""

from __future__ import annotations

import time
from typing import Any, AsyncGenerator, AsyncIterator

from rag_service.auth import is_owner

# Tools the agent describes with a richer explicit step; the wrapper does not mirror them.
EXPLICIT_TOOL_STEPS = {"search_live_knowledge"}
TOOL_RESULT_PREVIEW = 300


def step_event(step_id: str, kind: str, status: str, **fields: Any) -> dict:
    """Build a step event; fields set to None are left out."""
    ev = {"type": "step", "id": step_id, "kind": kind, "status": status}
    ev.update({k: v for k, v in fields.items() if v is not None})
    return ev


async def with_steps(events: AsyncIterator[dict]) -> AsyncGenerator[dict, None]:
    """Add timing to the agent's step events and mirror tool_start/tool_end as tool steps.

    Steps still running when the turn fails are closed as `error`, so the UI never shows a
    spinner that never stops.
    """
    started: dict[str, tuple[float, str]] = {}  # id -> (start time, kind)
    open_tools: list[tuple[str, str]] = []
    tool_count = 0

    def timed(ev: dict) -> dict:
        if ev["status"] == "running":
            started[ev["id"]] = (time.monotonic(), ev["kind"])
        elif ev["id"] in started:
            ev["duration_ms"] = round((time.monotonic() - started.pop(ev["id"])[0]) * 1000)
        return ev

    try:
        async for ev in events:
            kind = ev.get("type")
            name = ev.get("name", "tool")
            if kind == "step":
                yield timed(ev)
                continue
            yield ev
            if kind == "tool_start" and name not in EXPLICIT_TOOL_STEPS:
                tool_count += 1
                step_id = f"tool-{tool_count}"
                open_tools.append((name, step_id))
                args = ev.get("args") if is_owner() else None
                yield timed(step_event(step_id, "tool", "running", name=name, args=args))
            elif kind == "tool_end":
                idx = next((i for i, (n, _) in enumerate(open_tools) if n == name), None)
                if idx is not None:
                    _, step_id = open_tools.pop(idx)
                    result = str(ev.get("result", ""))[:TOOL_RESULT_PREVIEW]
                    yield timed(step_event(step_id, "tool", "done", name=name, result=result))
    except Exception:
        for step_id, (_, step_kind) in list(started.items()):
            yield timed(step_event(step_id, step_kind, "error"))
        raise
