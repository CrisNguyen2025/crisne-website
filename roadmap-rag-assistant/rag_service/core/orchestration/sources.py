"""Core RAG answer: retrieve live sources, then answer from them, with the LLM or a formatted fallback.

Nothing here knows the business. The domain supplies what varies through SourceDeps: the search
function, how a result is formatted and linked, the replies for "no match" and "search failed", and
the generation pipeline. The step events and trace flags are the same for every domain.
"""

from __future__ import annotations

import asyncio
from contextlib import suppress
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Awaitable, Callable, Coroutine, Optional, Sequence

from rag_service.core.augmentation.context import GenerationRequest
from rag_service.core.generation.pipeline import GenerationFailed
from rag_service.core.provenance import format_fallback_provenance_footer
from rag_service.core.retrieval.rerank import RERANK_POOL
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
    # Optional reordering of the candidates: (llm, query, matches) -> matches. Search fetches RERANK_POOL when set.
    rerank: Optional[Callable[[Any, str, list], Awaitable[list]]] = None
    # Optional gate for the reranker: (query, matches) -> True when the order is uncertain enough to pay for it.
    # None reranks every question.
    rerank_needed: Optional[Callable[[str, list], bool]] = None
    fetch_provenances: Optional[Callable[[list[str]], Awaitable[dict]]] = None
    load_memories: Optional[Callable[[], Coroutine[Any, Any, Sequence[Any]]]] = None
    page_hint: str = ""


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


@dataclass(frozen=True)
class _RetrievalOutcome:
    matches: list[tuple[Any, float]]
    plan: QueryPlan
    before_gate: int
    reranked: bool
    dropped_titles: list[str]


def _dropped_gate_titles(
    before: list[tuple[Any, float]],
    kept: list[tuple[Any, float]],
    trace_fields: Callable[[Any], dict],
) -> list[str]:
    kept_ids = {id(doc) for doc, _ in kept}
    return [
        str(trace_fields(doc).get("title") or getattr(doc, "id", ""))
        for doc, _ in before
        if id(doc) not in kept_ids
    ]


async def _retrieve_candidate_docs(
    llm: Any,
    query: str,
    session_id: str,
    deps: SourceDeps,
) -> _RetrievalOutcome:
    plan = await deps.plan(llm, query, session_id) if deps.plan else QueryPlan(query)
    queries = plan.queries()
    pool = RERANK_POOL if deps.rerank else 4
    if len(queries) == 1:
        matches = await deps.search(query, limit=pool)
    else:
        results = await asyncio.gather(*(deps.search(q, limit=pool) for q in queries))
        matches = merge_ranked(results, pool)
    did_rerank = False
    if deps.rerank is not None:
        if deps.rerank_needed is None or deps.rerank_needed(query, matches):
            matches = (await deps.rerank(llm, query, matches))[:4]
            did_rerank = True
        else:
            matches = matches[:4]
    pre_gate = list(matches)
    before_gate = len(pre_gate)
    if deps.accept:
        # A rewrite resolved "bài đó" to a name, so the check also accepts the rewrite's words;
        # other variants are not used here, so a drifting phrasing cannot let an unrelated match through.
        gate_query = f"{query} {plan.variants[0]}" if plan.rewritten and plan.variants else query
        matches = deps.accept(gate_query, pre_gate)
    dropped = _dropped_gate_titles(pre_gate, matches, deps.trace_fields) if before_gate != len(matches) else []
    if (trace := current_trace()) is not None:
        trace.flags["queries"] = len(queries)
        trace.flags["rewritten"] = plan.rewritten
        trace.flags["reranked"] = did_rerank
    return _RetrievalOutcome(
        matches=matches,
        plan=plan,
        before_gate=before_gate,
        reranked=did_rerank,
        dropped_titles=dropped,
    )


async def _fetch_lesson_provenances_safe(
    matches: list[tuple[Any, float]],
    owner: bool,
    deps: SourceDeps,
) -> dict:
    if not owner or deps.fetch_provenances is None:
        return {}
    item_ids = [
        str(doc.id)
        for doc, _ in matches
        if getattr(doc, "doc_type", "") == "item" and getattr(doc, "id", None)
    ]
    if not item_ids:
        return {}
    prov_step = start_step("load-provenance", "span", input={"source_count": len(item_ids)})
    try:
        found = await deps.fetch_provenances(item_ids) or {}
    except Exception as exc:
        end_step(prov_step, level="WARNING", status_message=f"{type(exc).__name__}: {exc}")
        return {}
    entries = sum(len(v) for v in found.values() if isinstance(v, list))
    end_step(prov_step, output={"matched_items": len(found), "provenance_entries": entries})
    return found


def _build_retrieval_done_event(
    matches: list[tuple[Any, float]],
    plan: Any,
    before_gate: int,
    deps: SourceDeps,
    owner: bool,
) -> dict:
    return step_event(
        "retrieve",
        "retrieval",
        "done",
        count=len(matches),
        detail=f"{len(matches)} tài liệu",
        queries=len(plan.queries()),
        rewritten=plan.rewritten or None,
        before_gate=before_gate if before_gate != len(matches) else None,
        items=[
            {**deps.item_fields(doc), "href": deps.href_of(doc), **({"score": round(score, 4)} if owner else {})}
            for doc, score in matches
        ],
    )


async def _await_memories_safe(task: asyncio.Task[Sequence[Any]] | None) -> Sequence[Any]:
    if task is None:
        return ()
    try:
        return await task
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        print(f"[Agent] Memory load skipped ({type(exc).__name__}: {exc}).")
        return ()


async def _cancel_if_pending(task: asyncio.Task[Any] | None) -> None:
    if task is None:
        return
    if task.done():
        if not task.cancelled():
            _ = task.exception()
        return
    task.cancel()
    with suppress(BaseException):
        await task


async def _stream_answer_body(
    *,
    query: str,
    session_id: str,
    owner: bool,
    delay: float,
    llm: Any,
    deps: SourceDeps,
    matches: list[tuple[Any, float]],
    owner_memories: Sequence[Any],
    mem_task: asyncio.Task[Sequence[Any]] | None = None,
    memory_scope: Optional[str],
) -> AsyncGenerator[dict, None]:
    if mem_task is not None and not owner_memories:
        lesson_provenances, owner_memories = await asyncio.gather(
            _fetch_lesson_provenances_safe(matches, owner, deps),
            _await_memories_safe(mem_task),
        )
    else:
        lesson_provenances = await _fetch_lesson_provenances_safe(matches, owner, deps)
    rag_context = deps.format_context(matches)
    if owner and lesson_provenances:
        rag_context += format_fallback_provenance_footer(matches, lesson_provenances)

    llm_failed: bool | str = False
    if deps.pipeline.available(llm):
        try:
            req = GenerationRequest(
                mode="rag",
                query=query,
                thread_id=session_id,
                sources=matches,
                owner_memories=owner_memories if owner else (),
                memory_scope=memory_scope,
                lesson_provenances=lesson_provenances if owner else {},
                page_hint=deps.page_hint,
            )
            async for ev in deps.pipeline.astream(llm, req):
                yield ev
            return
        except GenerationFailed as exc:
            llm_failed = exc.reason

    yield step_event(
        "answer",
        "generation",
        "done",
        mode="context",
        fallback_reason=llm_fallback_reason(llm, llm_failed),
    )
    async for ev in stream_words(rag_context, delay):
        yield ev


async def answer_from_sources(
    *,
    query: str,
    session_id: str,
    owner: bool,
    delay: float,
    llm: Any,
    deps: SourceDeps,
    owner_memories: Sequence[Any] = (),
    memory_scope: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    """Retrieve for `query`, then answer from what was found (LLM), fall back to the formatted sources, or say nothing matched."""
    mem_task: asyncio.Task[Sequence[Any]] | None = (
        asyncio.create_task(deps.load_memories())
        if owner and not owner_memories and deps.load_memories is not None
        else None
    )
    if mem_task is not None:
        await asyncio.sleep(0)
    try:
        yield {"type": "tool_start", "name": deps.tool_name, "args": {"query": query}}
        yield step_event("retrieve", "retrieval", "running")
        retrieval_step = start_step(
            "retrieve-live-knowledge",
            "retriever",
            input={"query": query, "limit": 4},
            metadata={"adapter_mode": deps.adapter_mode, "scoring": deps.scoring},
        )
        try:
            outcome = await _retrieve_candidate_docs(llm, query, session_id, deps)
            matches, plan, before_gate = outcome.matches, outcome.plan, outcome.before_gate
        except Exception as exc:
            # Index/adapter failure is not "no match": say so instead of the no-result reply.
            print(f"[Agent] Retrieval error ({type(exc).__name__}: {exc}).")
            end_step(retrieval_step, level="ERROR", status_message=f"{type(exc).__name__}: {exc}")
            if (trace := current_trace()) is not None:
                trace.flags["retrieval_error"] = True
            yield {"type": "tool_end", "name": deps.tool_name, "result": "Lỗi tra cứu", "is_error": True}
            yield step_event("retrieve", "retrieval", "error")
            async for ev in stream_words(deps.retrieval_error_reply, delay):
                yield ev
            return
        except BaseException as exc:  # client disconnected while searching
            end_step_on_error(retrieval_step, exc)
            raise
        end_step(
            retrieval_step,
            output=[
                {"rank": i + 1, "score": round(score, 4), **deps.trace_fields(doc)}
                for i, (doc, score) in enumerate(matches)
            ],
            metadata={
                "adapter_mode": deps.adapter_mode,
                "scoring": deps.scoring,
                "queries": plan.queries(),
                "rewritten": plan.rewritten,
                "reranked": outcome.reranked,
                "before_gate": before_gate,
                "dropped_by_gate": outcome.dropped_titles,
            },
        )
        if (trace := current_trace()) is not None:
            trace.flags["retrieved"] = len(matches)
        yield {"type": "tool_end", "name": deps.tool_name, "result": f"Tìm thấy {len(matches)} tài liệu", "is_error": False}
        yield _build_retrieval_done_event(matches, plan, before_gate, deps, owner)

        if not matches:
            await _await_memories_safe(mem_task)
            resp = deps.no_match_reply(owner)
            yield step_event("answer", "generation", "done", mode="no_match")
            async for ev in stream_words(resp, delay):
                yield ev
            return

        async for ev in _stream_answer_body(
            query=query,
            session_id=session_id,
            owner=owner,
            delay=delay,
            llm=llm,
            deps=deps,
            matches=matches,
            owner_memories=owner_memories,
            mem_task=mem_task,
            memory_scope=memory_scope,
        ):
            yield ev
    finally:
        await _cancel_if_pending(mem_task)
