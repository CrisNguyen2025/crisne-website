"""Core RAG answer: retrieve live sources, then answer from them, with the LLM or a formatted fallback.

Nothing here knows the business. The domain supplies what varies through SourceDeps: the search
function, how a result is formatted and linked, the replies for "no match" and "search failed", and
the generation pipeline. The step events and trace flags are the same for every domain.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Awaitable, Callable, Optional

from rag_service.core.augmentation.context import GenerationRequest
from rag_service.core.generation.pipeline import GenerationFailed
from rag_service.core.retrieval.transform import QueryPlan, merge_ranked
from rag_service.observability import current_trace, end_step, end_step_on_error, start_step
from rag_service.steps import step_event


@dataclass(frozen=True)
class SourceDeps:
    search: Callable[..., Awaitable[list]]      # (query, limit=) -> [(doc, score)]
    format_context: Callable[[list], str]         # markdown fallback when the LLM is not used
    href_of: Callable[[Any], str]                 # link for a document, shown in the retrieve step
    item_fields: Callable[[Any], dict]            # fields of a document in the retrieve step's items
    trace_fields: Callable[[Any], dict]           # fields of a document in the retrieval trace
    no_match_reply: Callable[[bool], str]         # owner -> reply when nothing matched
    retrieval_error_reply: str
    pipeline: Any                                 # GenerationPipeline (has available() and astream())
    tool_name: str = "search_live_knowledge"
    scoring: str = "rrf(vector+keyword)"
    adapter_mode: str = ""
    # Optional query transformation: (llm, query, session_id) -> QueryPlan. None = search the question as asked.
    plan: Optional[Callable[[Any, str, str], Awaitable[QueryPlan]]] = None
    # Optional final check of the merged matches against the original question: (query, matches) -> matches.
    accept: Optional[Callable[[str, list], list]] = None


async def stream_words(text: str, delay: float) -> AsyncGenerator[dict, None]:
    """Stream words over SSE. `delay` (seconds per word) adds an optional typing effect; 0 disables it."""
    words = text.split(" ")
    for i, word in enumerate(words):
        delta = word + (" " if i < len(words) - 1 else "")
        yield {"type": "token", "delta": delta}
        if delay:
            await asyncio.sleep(delay)


def llm_fallback_reason(llm: Any, failed: bool | str) -> Optional[str]:
    """Why an answer did not come from the LLM: none configured, the call failed, or rate limited.

    A string is a reason from the generation pipeline ("llm_error", "grounding") and is kept as is.
    """
    if isinstance(failed, str):
        return failed
    if llm is None:
        return None
    return "llm_error" if failed else "rate_limited"


async def answer_from_sources(
    *, query: str, session_id: str, owner: bool, delay: float, llm: Any, deps: SourceDeps
) -> AsyncGenerator[dict, None]:
    """Retrieve for `query`, then answer from what was found (LLM), fall back to the formatted sources, or say nothing matched."""
    search, format_context, href_of = deps.search, deps.format_context, deps.href_of
    item_fields, trace_fields = deps.item_fields, deps.trace_fields
    no_match_reply, retrieval_error_reply, pipeline = deps.no_match_reply, deps.retrieval_error_reply, deps.pipeline
    tool_name, scoring, adapter_mode = deps.tool_name, deps.scoring, deps.adapter_mode
    yield {"type": "tool_start", "name": tool_name, "args": {"query": query}}
    yield step_event("retrieve", "retrieval", "running")
    retrieval_step = start_step(
        "retrieve-live-knowledge",
        "retriever",
        input={"query": query, "limit": 4},
        metadata={"adapter_mode": adapter_mode, "scoring": scoring},
    )
    try:
        plan = await deps.plan(llm, query, session_id) if deps.plan else QueryPlan(query)
        queries = plan.queries()
        if len(queries) == 1:
            matches = await search(query, limit=4)
        else:
            results = await asyncio.gather(*(search(q, limit=4) for q in queries))
            matches = merge_ranked(results, 4)
        before_gate = len(matches)
        if deps.accept:
            # A rewrite resolved "bài đó" to a name, so the check also accepts the rewrite's words;
            # other variants are not used here, so a drifting phrasing cannot let an unrelated match through.
            gate_query = f"{query} {plan.variants[0]}" if plan.rewritten and plan.variants else query
            matches = deps.accept(gate_query, matches)
        if (trace := current_trace()) is not None:
            trace.flags["queries"] = len(queries)
            trace.flags["rewritten"] = plan.rewritten
    except Exception as exc:
        # Index/adapter failure is not "no match": say so instead of the no-result reply.
        print(f"[Agent] Retrieval error ({type(exc).__name__}: {exc}).")
        end_step(retrieval_step, level="ERROR", status_message=f"{type(exc).__name__}: {exc}")
        if (trace := current_trace()) is not None:
            trace.flags["retrieval_error"] = True
        yield {"type": "tool_end", "name": tool_name, "result": "Lỗi tra cứu", "is_error": True}
        yield step_event("retrieve", "retrieval", "error")
        async for ev in stream_words(retrieval_error_reply, delay):
            yield ev
        return
    except BaseException as exc:  # client disconnected while searching
        end_step_on_error(retrieval_step, exc)
        raise
    end_step(
        retrieval_step,
        output=[
            {"rank": i + 1, "score": round(score, 4), **trace_fields(doc)}
            for i, (doc, score) in enumerate(matches)
        ],
    )
    if (trace := current_trace()) is not None:
        trace.flags["retrieved"] = len(matches)
    yield {"type": "tool_end", "name": tool_name, "result": f"Tìm thấy {len(matches)} tài liệu", "is_error": False}
    yield step_event(
        "retrieve",
        "retrieval",
        "done",
        count=len(matches),
        detail=f"{len(matches)} tài liệu",
        queries=len(queries),
        rewritten=plan.rewritten or None,
        before_gate=before_gate if before_gate != len(matches) else None,
        items=[
            {**item_fields(doc), "href": href_of(doc), **({"score": round(score, 4)} if owner else {})}
            for doc, score in matches
        ],
    )

    if matches:
        rag_context = format_context(matches)

        # Synthesize with LLM if available
        llm_failed = False
        if pipeline.available(llm):
            try:
                req = GenerationRequest(
                    mode="rag", query=query, thread_id=session_id, sources=matches
                )
                async for ev in pipeline.astream(llm, req):
                    yield ev
                return
            except GenerationFailed as exc:
                llm_failed = exc.reason

        # Fallback directly to formatted markdown context
        yield step_event(
            "answer",
            "generation",
            "done",
            mode="context",
            fallback_reason=llm_fallback_reason(llm, llm_failed),
        )
        async for ev in stream_words(rag_context, delay):
            yield ev
        return
    else:
        resp = no_match_reply(owner)
        yield step_event("answer", "generation", "done", mode="no_match")
        async for ev in stream_words(resp, delay):
            yield ev
        return
