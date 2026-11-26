"""Next-Gen Roadmap Agent — Enterprise Two-Stage Agentic Architecture.

Architecture:
1. Fast Intent Router: classifies into CUD, Knowledge Query, Plan/Goal, or Chitchat.
2. Structured Entity Extractor: Pydantic schemas enforce verb-free titles and accurate acronyms.
3. Conversational State Machine: resolves pronouns ('vào đó', 'ở trên') across multiple turns.
4. Real Hybrid RAG Engine: queries live website database (Topics, Lessons, Content).
5. Safe Action Executor: dispatches CUD operations to database adapters with state tracking.
"""

from __future__ import annotations

import dataclasses

import asyncio
import inspect
import logging
import os
from pathlib import Path
from typing import Any, AsyncGenerator, Callable, Optional

log = logging.getLogger(__name__)

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.config import settings
from rag_service.llm_keys import KeyRotatingLLM, parse_keys
from rag_service.execution.executor import ActionExecutor
from rag_service.core.generation.delivery import record_turn
from rag_service.core.guards import input_problem, is_harmful_request, is_sensitive_request
from rag_service.core.orchestration.llm_answer import answer_with_llm
from rag_service.core.orchestration.sources import SourceDeps, answer_from_sources, llm_fallback_reason, stream_words
from rag_service.domains.roadmap.agent_actions import RoadmapAgentActions
from rag_service.domains.roadmap.commands import RoadmapCommands
from rag_service.domains.roadmap.lesson_content import LessonContentCommands
from rag_service.domains.roadmap.lesson_edit import LessonEditCommands
from rag_service.domains.roadmap.lesson_status import LessonStatusCommands
from rag_service.domains.roadmap.memory_commands import MemoryCommands
from rag_service.domains.roadmap.quiz_commands import QuizCommands
from rag_service.tools.topic_resolver import resolve_topic
from rag_service.domains.roadmap.sections import SectionCommands
from rag_service.domains.roadmap.pipeline import generation_pipeline
from rag_service.domains.roadmap.profile import PROFILE
from rag_service.core.memory import owner_memory_store
from rag_service.core.provenance import LessonProvenanceStore, default_provenance_api

lesson_provenance_store = LessonProvenanceStore(
    default_provenance_api(
        endpoint_path="/api/v1/roadmaps/provenance-by-lessons",
        query_param="lessonIds",
        response_field="byLessonId",
    )
)
from rag_service.observability import (
    current_trace,
    end_step,
    end_step_on_error,
    start_step,
    traced_turn,
)
from rag_service.steps import step_event, with_steps
from rag_service.core.augmentation.history import history_store
from rag_service.core.retrieval.rerank import rerank
from rag_service.core.retrieval.transform import HISTORY_TURNS, has_history_backref, is_compound, plan_queries
from rag_service.domains.roadmap.retrieval.relevance import asks_about_current_page, filter_on_topic, fold
from rag_service.domains.roadmap.retrieval.engine import lesson_href, rag_engine
from rag_service.domains.roadmap.router import (
    IntentClassificationResult,
    IntentRouter,
    IntentType,
    KnowledgeSubIntent,
    StructuredEntityExtractor,
    normalize_vietnamese,
)
from rag_service.domains.roadmap.router.policy import WRITE_NONE
from rag_service.domains.roadmap.router.route_decision import decide_route
from rag_service.domains.roadmap.router.focus import focus_written
from rag_service.domains.roadmap.router.scope import Scope, classify_for_routing
from rag_service.domains.roadmap.router.understanding import instruction_part
from rag_service.domains.roadmap.router.write_gate import BLOCKED_CHANGE, CONTENT_UNCLEAR, DESCRIPTION_UNSUPPORTED
from rag_service.domains.roadmap.router.policy import TOPIC_REFERENCE, TOPIC_REFERENCE_FOLDED
from rag_service.domains.roadmap.router.grounding import (
    build_grounding,
    mixed_intent_reply,
    RETRIEVAL_ERROR_REPLY,
    TOO_LONG_REPLY,
    BLOCKED_CHANGE_REPLY,
    DESCRIPTION_UNSUPPORTED_REPLY,
    NO_TOPIC_REPLY,
    content_unclear_reply,
    unnamed_create_reply,
    legacy_level_reply,
    domain_gap_reply,
    empty_message_reply,
    empty_roadmap_reply,
    harmful_reply,
    looks_like_title,
    no_match_reply,
    out_of_scope_reply,
    sensitive_reply,
    unclear_reply,
)
from rag_service.state import session_store
from rag_service.tools import ALL_TOOLS


# Placeholders the anaphora resolver leaves when no topic is known from context
# Below this the intent router only guessed (its default fallback is 0.5)
UNCLEAR_CONFIDENCE = 0.7


def log_turn(thread_id: str, steps: dict, tools: list[str], metadata: dict) -> None:
    """One line per chat turn, from the agent so /chat and /chat/stream both log it."""
    route, answer, retrieve = steps.get("route", {}), steps.get("answer", {}), steps.get("retrieve", {})
    found = retrieve.get("count")
    print(
        f"[turn] thread={thread_id} intent={route.get('intent')} route={route.get('method')} "
        f"act={route.get('act')} target={route.get('target')} rule={route.get('rule')} write={route.get('write')} "
        f"queries={retrieve.get('queries')} rewritten={bool(retrieve.get('rewritten'))} "
        f"retrieved={retrieve.get('before_gate', found)} on_topic={found} "
        f"mode={answer.get('mode')} fallback={answer.get('fallback_reason')} "
        f"grounding={metadata.get('grounding')} sources={len(metadata.get('sources', []))} tools={tools}"
    )


def _unless_empty(reply: Callable[[bool], str]) -> Callable[[bool], str]:
    """A "nothing found" reply, unless the roadmap holds nothing at all: then say that, not "try another keyword"."""
    return lambda owner: empty_roadmap_reply(owner) if rag_engine.is_empty() else reply(owner)


async def _plan_queries(llm, query: str, session_id: str, page_hint: str = ""):
    """Query plan for a turn: the recent conversation is passed so references like "bài đó" can be resolved."""
    return await plan_queries(query, history_store.get_recent(session_id, HISTORY_TURNS), llm, page_hint=page_hint)


class NextGenRoadmapAgent(
    RoadmapAgentActions,
    RoadmapCommands,
    SectionCommands,
    LessonEditCommands,
    LessonContentCommands,
    LessonStatusCommands,
    MemoryCommands,
    QuizCommands,
):
    """Enterprise-grade Agentic Roadmap Assistant with Live RAG and State Machine."""

    def __init__(
        self, llm_model: Optional[Any] = None, tools: Optional[list] = None, router_llm: Optional[Any] = None
    ) -> None:
        self.llm = llm_model
        # System 2 (routing + write verification); a small model when LLM_MODEL_ROUTER is set
        self.router_llm = router_llm or llm_model
        self.typing_delay = float(os.getenv("RAG_TYPING_DELAY_MS", "5")) / 1000
        self.tools = {t.name: t for t in (tools or ALL_TOOLS)}
        self.router = IntentRouter(llm_model=self.router_llm, vocabulary=rag_engine.title_vocabulary)
        self.extractor = StructuredEntityExtractor(llm_model=llm_model)
        self.executor = ActionExecutor()

    def _llm_fallback_reason(self, failed: bool | str) -> Optional[str]:
        return llm_fallback_reason(self.llm, failed)

    async def _page_topic_title(self, page_context) -> str:
        """The title of the topic the open page shows, or "" when there is none or it cannot be read."""
        slug = ((page_context or {}).get("roadmapSlug") or "").strip()
        if not slug:
            return ""
        found = await resolve_topic(slug)
        return (found.title or "") if found.status == "found" else ""

    async def _stream_text(self, text: str, delay: float) -> AsyncGenerator[dict, None]:
        async for ev in stream_words(text, delay):
            yield ev

    def _source_deps(self, query: str = "", page_context: Optional[dict] = None) -> SourceDeps:
        """The roadmap's hooks for the core RAG flow. Looked up at call time so tests can patch the engine."""
        has_page_ref = bool(
            page_context
            and any(str(page_context.get(k) or "").strip() for k in ("itemId", "roadmapSlug", "section"))
        )
        page_hint = build_grounding(page_context)

        async def _search(q: str, limit: int = 4):
            if has_page_ref and hasattr(rag_engine, "search_with_page_context"):
                return await rag_engine.search_with_page_context(q, page_context, limit=limit)
            return await rag_engine.search_live_knowledge(q, limit=limit)

        def _accept(q: str, matches: list):
            pinned_id = next(
                (
                    str(doc.id)
                    for doc, _ in matches
                    if getattr(doc, "is_current_page", False) and getattr(doc, "id", None)
                ),
                None,
            )
            return filter_on_topic(
                q,
                matches,
                rag_engine.corpus_vocabulary(),
                pinned_doc_id=pinned_id,
            )

        # Open-page deictic queries ("tóm tắt page này", "đây là bài về tháng 9 mà") point at page_context,
        # not an earlier conversation turn; rewriting them from history bleeds previous lessons into retrieval.
        use_plan = settings.rag_query_transform and not (
            has_page_ref
            and asks_about_current_page(query)
            and not is_compound(query)
            and not has_history_backref(query)
        )

        async def _plan(llm, q: str, session_id: str):
            return await _plan_queries(llm, q, session_id, page_hint=page_hint)

        return SourceDeps(
            search=_search,
            accept=_accept,
            plan=_plan if use_plan else None,
            rerank=_rerank if settings.rag_rerank else None,
            rerank_needed=_rerank_needed,
            format_context=lambda matches: rag_engine.format_knowledge_context(matches),
            href_of=lesson_href,  # a lesson found through a section links that section (#anchor)
            item_fields=_item_fields,
            trace_fields=_describe_document,
            # Suggests lessons that exist, never the one just searched for
            no_match_reply=_unless_empty(lambda owner: no_match_reply(owner, query)),
            retrieval_error_reply=RETRIEVAL_ERROR_REPLY,
            pipeline=generation_pipeline,
            adapter_mode=settings.rag_adapter_mode,
            fetch_provenances=lambda ids: lesson_provenance_store.get_for_lessons(ids),
            page_hint=page_hint,
        )

    async def ainvoke(self, input_dict: dict, config: dict | None = None) -> dict:
        events = []
        async for ev in self.astream_events(input_dict, config=config):
            events.append(ev)

        tool_messages = [e for e in events if e.get("type") == "tool_end"]
        final_text = "".join([e.get("delta", "") for e in events if e.get("type") == "token"])

        class MockAIMsg:
            def __init__(self, text, tools):
                self.content = text
                self.tool_calls = tools
                self.type = "ai"

        class MockToolMsg:
            def __init__(self, name, res):
                self.type = "tool"
                self.name = name
                self.content = res

        msgs: list[MockToolMsg | MockAIMsg] = []
        for tm in tool_messages:
            msgs.append(MockToolMsg(tm["name"], tm["result"]))
        msgs.append(MockAIMsg(final_text, []))

        return {"messages": msgs}

    def invoke(self, input_dict: dict, config: dict | None = None) -> dict:
        return asyncio.run(self.ainvoke(input_dict, config))

    async def astream_events(
        self, input_dict: dict, config: dict | None = None, version: str = "v2"
    ) -> AsyncGenerator[dict, None]:
        """Stream SSE events with tool start/end and paced progressive text tokens.

        Each call is one Langfuse trace (no-op when tracing is off).
        """
        message = input_dict.get("messages", [{}])[-1].get("content", "").strip()
        session_id = (config or {}).get("configurable", {}).get("thread_id", "default")
        reply: list[str] = []
        steps: dict[str, dict] = {}
        tools: list[str] = []
        metadata: dict = {}
        async for ev in traced_turn(
            with_steps(self._astream_events_impl(input_dict, config)),
            message=message,
            session_id=session_id,
            page_context=input_dict.get("context"),
        ):
            kind = ev.get("type")
            if kind == "token":
                reply.append(ev.get("delta", ""))
            elif kind == "step" and ev.get("status") != "running":
                steps[ev["id"]] = {**steps.get(ev["id"], {}), **ev}
            elif kind == "tool_start":
                tools.append(ev.get("name", "tool"))
            elif kind == "metadata":
                metadata = ev
            yield ev
        # Every branch (LLM, template, tool) becomes memory for the next turn's prompt.
        record_turn(session_id, message, "".join(reply))
        log_turn(session_id, steps, tools, metadata)

    async def handle_catalog(
        self, *, content: str, lower: str, raw_content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """The roadmap's structure, from the data and never the model: the topic list, then a topic's sections."""
        async for ev in self.handle_listing(content=content, lower=lower, delay=delay, outcome=outcome):
            yield ev
        if outcome["handled"]:
            return
        async for ev in self.handle_section_list(
            content=raw_content, page_context=page_context, session_ctx=session_ctx, delay=delay, outcome=outcome
        ):
            yield ev

    def _sync_page_focus(self, session_id: str, session_ctx, page_context: dict | None) -> str:
        # Keep Thread focus in sync with the open page so subsequent turns outside the page retain context
        page_slug = ((page_context or {}).get("roadmapSlug") or "").strip()
        page_item = ((page_context or {}).get("itemId") or "").strip()
        page_section = ((page_context or {}).get("section") or "").strip() or None
        page_title = ((page_context or {}).get("roadmapTitle") or "").strip()
        item_title = ((page_context or {}).get("itemTitle") or "").strip()
        if page_slug and page_item:
            if (
                session_ctx.active_lesson_id != page_item
                or session_ctx.active_topic_slug != page_slug
                or (page_section is not None and session_ctx.active_section != page_section)
            ):
                session_store.set_active_lesson(
                    session_id,
                    page_item,
                    lesson_title=item_title,
                    section=page_section,
                    topic_slug=page_slug,
                    topic_title=page_title,
                )
        elif page_slug and session_ctx.active_topic_slug != page_slug:
            session_store.set_active_topic(session_id, page_slug, title=page_title)
        return page_slug

    async def _run_pre_router_domain_handlers(
        self,
        *,
        content: str,
        raw_content: str,
        lower: str,
        page_context: dict | None,
        session_id: str,
        session_ctx,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        handlers = (
            self.handle_section_rename(
                content=raw_content, page_context=page_context, session_ctx=session_ctx, delay=delay, outcome=outcome
            ),
            self.handle_lesson_edit(
                content=raw_content, page_context=page_context, session_ctx=session_ctx, delay=delay, outcome=outcome
            ),
            self.handle_concept_promotion(
                content=content, page_context=page_context, session_ctx=session_ctx, delay=delay, outcome=outcome
            ),
            self.handle_lesson_content(
                content=content, page_context=page_context, session_ctx=session_ctx, delay=delay, outcome=outcome
            ),
            self.handle_status_change(
                content=content, page_context=page_context, session_ctx=session_ctx, delay=delay, outcome=outcome
            ),
            self.handle_memory_command(
                content=raw_content, page_context=page_context, session_ctx=session_ctx, delay=delay, outcome=outcome
            ),
            self.handle_quiz_command(
                content=raw_content,
                page_context=page_context,
                session_id=session_id,
                session_ctx=session_ctx,
                delay=delay,
                outcome=outcome,
            ),
        )
        for gen in handlers:
            async for ev in gen:
                yield ev
            if outcome["handled"]:
                return

        if self.bulk_import_applies(raw_content, lower, page_context):
            outcome["handled"] = True
            async for ev in self.handle_bulk_import(
                raw_content=raw_content, lower=lower, page_context=page_context, delay=delay
            ):
                yield ev

    def _record_route_flags(self, route_outcome, intent_res, decision, route_gate, method: str) -> None:
        if (trace := current_trace()) is None:
            return
        understood = decision.understanding
        trace.flags["act"] = understood.act.value
        trace.flags["target"] = understood.target.value
        trace.flags["intent"] = intent_res.intent.value
        if intent_res.sub_intent is not None:
            trace.flags["sub_intent"] = intent_res.sub_intent.value
        trace.flags["write"] = route_gate.mode
        if route_outcome.scope is not None:
            trace.flags["scope"] = route_outcome.scope.scope.value
        if not is_owner() and route_gate.mode != WRITE_NONE:
            trace.flags["visitor_write_attempt"] = True
        if method.startswith(("rate_limited", "llm_error")):
            trace.flags["router_llm_unavailable"] = True
        if route_outcome.plan is not None:
            trace.flags["write_plan"] = route_outcome.plan.outcome
            if route_outcome.verdict is None:
                trace.flags["system2_unavailable"] = True
            # System 1 read a change that System 2 or the data did not confirm: a case worth a golden sample
            if method == "heuristic" and route_outcome.plan.outcome in ("reroute", "blocked"):
                trace.flags["router_disagreement"] = True

    async def _run_entry_guards(
        self,
        *,
        raw_content: str,
        content: str,
        session_id: str,
        session_ctx,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        for guard_fn, flag_name, reply_text in (
            (lambda c: is_sensitive_request(c, instruction=instruction_part(c)), "sensitive", sensitive_reply()),
            (is_harmful_request, "harmful", harmful_reply()),
        ):
            if guard_fn(content):
                outcome["handled"] = True
                if (trace := current_trace()) is not None:
                    trace.flags["guard"] = flag_name
                async for ev in self._stream_text(reply_text, delay):
                    yield ev
                return

        async for ev in self.handle_active_quiz_turn(
            content=raw_content,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
            outcome=outcome,
        ):
            yield ev

    async def _run_syntax_guards(
        self,
        *,
        content: str,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        if (unnamed := unnamed_create_reply(content)) is not None:
            outcome["handled"] = True
            async for ev in self._stream_text(unnamed if is_owner() else OWNER_ONLY_MESSAGE, delay):
                yield ev
            return

        if (legacy := legacy_level_reply(content, self.router.known_place)) is not None:
            outcome["handled"] = True
            if (trace := current_trace()) is not None:
                trace.flags["guard"] = "legacy_level"
            async for ev in self._stream_text(legacy, delay):
                yield ev

    async def _run_domain_or_mixed_guards(
        self,
        *,
        content: str,
        raw_content: str,
        lower: str,
        page_context: dict | None,
        session_id: str,
        session_ctx,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        async for ev in self._run_pre_router_domain_handlers(
            content=content,
            raw_content=raw_content,
            lower=lower,
            page_context=page_context,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
            outcome=outcome,
        ):
            yield ev
        if outcome["handled"]:
            return

        if mixed_steps := self.router.mixed_intent_steps(content):
            outcome["handled"] = True
            if (trace := current_trace()) is not None:
                trace.flags["guard"] = "mixed_intents"
            async for ev in self._stream_text(mixed_intent_reply(mixed_steps), delay):
                yield ev

    async def _run_pre_route_stage(
        self,
        *,
        raw_content: str,
        content: str,
        lower: str,
        page_context: dict | None,
        session_id: str,
        session_ctx,
        delay: float,
        input_dict: dict,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        async for ev in self.handle_pending(
            content=content,
            lower=lower,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
            outcome=outcome,
            titles=input_dict.get("titles"),
            target=input_dict.get("target"),
        ):
            yield ev
        if outcome["handled"]:
            return

        async for ev in self._run_entry_guards(
            raw_content=raw_content,
            content=content,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
            outcome=outcome,
        ):
            yield ev
        if outcome["handled"]:
            return

        async for ev in self._run_syntax_guards(content=content, delay=delay, outcome=outcome):
            yield ev
        if outcome["handled"]:
            return

        async for ev in self._run_domain_or_mixed_guards(
            content=content,
            raw_content=raw_content,
            lower=lower,
            page_context=page_context,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
            outcome=outcome,
        ):
            yield ev

    async def _handle_route_gate_blocks(
        self,
        *,
        intent_res: IntentClassificationResult,
        route_gate,
        lower: str,
        page_context: dict | None,
        session_ctx,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        if intent_res.intent == IntentType.OUT_OF_SCOPE:
            outcome["handled"] = True
            async for ev in self._stream_text(out_of_scope_reply(is_owner()), delay):
                yield ev
            return

        if intent_res.intent == IntentType.UNCLEAR or route_gate.denied:
            outcome["handled"] = True
            blocked = route_gate.reason == BLOCKED_CHANGE
            if (trace := current_trace()) is not None and route_gate.denied:
                trace.flags["guard"] = "cud_blocked" if blocked else "cud_unconfirmed"
            if route_gate.reason == CONTENT_UNCLEAR:
                # The page the user is on names the topic before the thread's last one (trace 860725dc…)
                reply = content_unclear_reply(await self._page_topic_title(page_context) or session_ctx.active_topic_title or "")
            elif route_gate.reason == DESCRIPTION_UNSUPPORTED:
                reply = DESCRIPTION_UNSUPPORTED_REPLY
            else:
                reply = BLOCKED_CHANGE_REPLY if blocked else unclear_reply(is_owner())
            yield step_event("answer", "generation", "done", mode="blocked" if blocked else "unclear", fallback_reason=None)
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        if route_gate.mode != WRITE_NONE and not session_ctx.active_topic_slug and (
            TOPIC_REFERENCE.search(lower) or TOPIC_REFERENCE_FOLDED.search(fold(lower))
        ):
            outcome["handled"] = True
            yield step_event("answer", "generation", "done", mode="unclear", fallback_reason=None)
            async for ev in self._stream_text(NO_TOPIC_REPLY, delay):
                yield ev

    async def _try_handle_catalog_or_status(
        self,
        *,
        intent_res: IntentClassificationResult,
        content: str,
        raw_content: str,
        lower: str,
        page_context: dict | None,
        session_ctx,
        delay: float,
        answered: dict,
    ) -> AsyncGenerator[dict, None]:
        if intent_res.sub_intent == KnowledgeSubIntent.CATALOG:
            async for ev in self.handle_catalog(
                content=content,
                lower=lower,
                raw_content=raw_content,
                page_context=page_context,
                session_ctx=session_ctx,
                delay=delay,
                outcome=answered,
            ):
                yield ev
            if not answered["handled"] and (trace := current_trace()) is not None:
                trace.flags["catalog_fallback"] = True
        elif intent_res.sub_intent == KnowledgeSubIntent.LESSON_STATUS:
            if not is_owner():
                async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                    yield ev
                answered["owner_denied"] = True
                return
            async for ev in self.handle_lesson_status_query(
                content=content, page_context=page_context, session_ctx=session_ctx, delay=delay, outcome=answered
            ):
                yield ev

    async def _handle_knowledge_or_plan(
        self,
        *,
        intent_res: IntentClassificationResult,
        route_outcome,
        content: str,
        raw_content: str,
        lower: str,
        page_slug: str,
        page_context: dict | None,
        session_id: str,
        session_ctx,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        if intent_res.intent == IntentType.KNOWLEDGE_QUERY:
            answered = {"handled": False}
            async for ev in self._try_handle_catalog_or_status(
                intent_res=intent_res,
                content=content,
                raw_content=raw_content,
                lower=lower,
                page_context=page_context,
                session_ctx=session_ctx,
                delay=delay,
                answered=answered,
            ):
                yield ev
            if answered["handled"] or answered.get("owner_denied"):
                return
            async for ev in self.handle_current_section(
                content=raw_content,
                page_context=page_context,
                session_ctx=session_ctx,
                delay=delay,
                outcome=answered,
            ):
                yield ev
            if answered["handled"]:
                return

        deps = self._source_deps(content, page_context=page_context)
        is_domain_gap = (
            intent_res.intent == IntentType.KNOWLEDGE_QUERY
            and route_outcome.scope is not None
            and route_outcome.scope.scope == Scope.DOMAIN_GAP
        )
        focus_topic = (focus_written(content) or route_outcome.scope.focus) if is_domain_gap else None
        if is_domain_gap:
            # The roadmap's field, no lesson yet: if the search finds nothing, say so instead of "no match"
            deps = dataclasses.replace(
                deps, no_match_reply=_unless_empty(lambda owner: domain_gap_reply(focus_topic, owner))
            )
        async for ev in self._stream_sources_and_gap_promotion(
            content=content,
            page_slug=page_slug,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
            deps=deps,
            is_domain_gap=is_domain_gap,
            focus_topic=focus_topic,
        ):
            yield ev

    async def _list_active_owner_memories(self, active_topic: Optional[str], query: str) -> list[Any]:
        mem_step = start_step("load-owner-memory", "span", input={"scope": active_topic or "global"})
        try:
            params = inspect.signature(owner_memory_store.list_active).parameters
            kwargs: dict[str, Any] = {}
            if "query" in params:
                kwargs["query"] = query
            if "touch" in params:
                kwargs["touch"] = False
            items = await owner_memory_store.list_active(active_topic, **kwargs)
            end_step(mem_step, output={"count": len(items)})
            return items
        except BaseException as exc:
            end_step_on_error(mem_step, exc)
            raise

    async def _load_thread_context(self, session_id: str, session_ctx, page_context: dict | None) -> None:
        load_step = start_step("load-thread-context", "span", input={"has_page_context": bool(page_context)})
        try:
            await asyncio.gather(history_store.load(session_id), session_store.load(session_id))
            end_step(load_step, output={"topic_loaded": bool(getattr(session_ctx, "topic_loaded", False))})
        except BaseException as exc:
            end_step_on_error(load_step, exc)
            raise

    async def _stream_sources_and_gap_promotion(
        self,
        *,
        content: str,
        page_slug: str,
        session_id: str,
        session_ctx,
        delay: float,
        deps,
        is_domain_gap: bool,
        focus_topic: Optional[str],
    ) -> AsyncGenerator[dict, None]:
        active_topic = page_slug or session_ctx.active_topic_slug
        owner = is_owner()
        owner_memories = await self._list_active_owner_memories(active_topic, content) if owner else []
        saw_no_match = False
        async for ev in answer_from_sources(
            query=content,
            session_id=session_id,
            owner=owner,
            delay=delay,
            llm=self.llm,
            deps=deps,
            owner_memories=owner_memories,
            memory_scope=active_topic,
        ):
            if ev.get("type") == "step" and ev.get("id") == "answer" and ev.get("mode") == "no_match":
                saw_no_match = True
            yield ev
        if is_domain_gap and saw_no_match and owner and looks_like_title(focus_topic):
            async for ev in self._maybe_emit_domain_gap_promotion_preview(
                concept=focus_topic or "",
                page_slug=page_slug,
                session_ctx=session_ctx,
                delay=delay,
            ):
                yield ev

    async def _maybe_emit_domain_gap_promotion_preview(
        self,
        *,
        concept: str,
        page_slug: str,
        session_ctx,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        proposal, _ = await self.build_concept_promotion_proposal(
            concept=concept,
            summary="",
            preferred_topic_slug=page_slug or session_ctx.active_topic_slug,
            source="domain_gap",
            session_ctx=session_ctx,
            status="target",
        )
        if proposal is None:
            return
        session_ctx.clear_pending()
        async for ev in self.emit_concept_promotion_preview(
            proposal, session_ctx, delay, prefix_newline=True
        ):
            yield ev

    async def _handle_chitchat_turn(
        self,
        *,
        content: str,
        page_slug: str,
        session_id: str,
        session_ctx,
        understood,
        intent_res: IntentClassificationResult,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        # "làm được gì", "cách thêm bài vào topic": the command list, not an LLM answer that may refuse or invent syntax
        if understood.asks_usage:
            yield step_event("answer", "generation", "done", mode="help")
            async for ev in self._stream_text(await self._help_reply(), delay):
                yield ev
            return

        outcome = {"handled": False, "llm_failed": False}
        active_topic = page_slug or session_ctx.active_topic_slug
        owner_memories = await self._list_active_owner_memories(active_topic, content) if is_owner() else []
        async for ev in answer_with_llm(
            llm=self.llm,
            pipeline=generation_pipeline,
            mode="chitchat",
            query=content,
            session_id=session_id,
            outcome=outcome,
            owner_memories=owner_memories,
            memory_scope=active_topic,
        ):
            yield ev
        if outcome["handled"]:
            return
        llm_failed = outcome["llm_failed"]

        # A low-confidence guess (default fallback, no LLM) gets a short prompt, not the full greeting
        if intent_res.confidence < UNCLEAR_CONFIDENCE:
            yield step_event(
                "answer", "generation", "done", mode="unclear", fallback_reason=self._llm_fallback_reason(llm_failed)
            )
            async for ev in self._stream_text(unclear_reply(is_owner()), delay):
                yield ev
            return

        resp = await self._greeting_reply()
        yield step_event(
            "answer",
            "generation",
            "done",
            mode="template",
            fallback_reason=self._llm_fallback_reason(llm_failed),
        )
        async for ev in self._stream_text(resp, delay):
            yield ev

    async def _emit_input_problem_if_any(self, content: str, delay: float) -> AsyncGenerator[dict, None]:
        problem = input_problem(content)
        if not problem:
            return
        reply = empty_message_reply(is_owner()) if problem == "empty" else TOO_LONG_REPLY
        if (trace := current_trace()) is not None:
            trace.flags["guard"] = problem
        async for ev in self._stream_text(reply, delay):
            yield ev

    async def _decide_route_traced(
        self, content: str, page_context: dict | None, session_ctx, session_id: str
    ):
        router_step = start_step("intent-router", input={"message": content})
        recent = history_store.get_recent(session_id, HISTORY_TURNS)
        def _scope_for_turn(text: str):
            if page_context and "page_context" in inspect.signature(classify_for_routing).parameters:
                return classify_for_routing(text, rag_engine, rag_engine.query_vector, page_context=page_context)
            return classify_for_routing(text, rag_engine, rag_engine.query_vector)

        try:
            # System 1, the write gate, and for a write candidate System 2 + grounding (router/route_decision.py)
            route_outcome = await decide_route(
                self.router,
                content,
                recent,
                verifier_llm=self.router_llm,
                catalog=await rag_engine.catalog(),
                page_context=page_context,
                owner=is_owner(),
                scope_fn=_scope_for_turn,
            )
        except BaseException as exc:
            end_step_on_error(router_step, exc)
            raise
        intent_res, method, decision, route_gate = (
            route_outcome.intent_res,
            route_outcome.method,
            route_outcome.decision,
            route_outcome.gate,
        )
        understood = decision.understanding
        end_step(
            router_step,
            output=intent_res.model_dump(mode="json"),
            metadata={
                "method": method, **understood.summary(), "rules": decision.rules, "write": route_gate.mode,
                "write_plan": route_outcome.plan.reason if route_outcome.plan else None,
                "verdict": route_outcome.verdict.model_dump(mode="json") if route_outcome.verdict else None,
                "grounding": route_outcome.grounding.status if route_outcome.grounding else None,
                "phases": route_outcome.trace(),
                "recent_turns": [{"role": t.role, "content": t.content[:200]} for t in recent],
                "active_topic_slug": session_ctx.active_topic_slug,
                "active_lesson_id": session_ctx.active_lesson_id,
            },
        )
        return route_outcome

    async def _dispatch_routed_turn(
        self,
        *,
        intent_res: IntentClassificationResult,
        route_outcome,
        route_gate,
        understood,
        content: str,
        raw_content: str,
        lower: str,
        page_slug: str,
        page_context: dict | None,
        session_id: str,
        session_ctx,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        if route_gate.mode != WRITE_NONE:
            async for ev in self.handle_cud(
                content=content,
                lower=lower,
                page_context=page_context,
                session_id=session_id,
                session_ctx=session_ctx,
                delay=delay,
                gate=route_gate,
                verdict=route_outcome.verdict,
            ):
                yield ev
            return

        if intent_res.intent in (IntentType.KNOWLEDGE_QUERY, IntentType.PLAN_GOAL):
            async for ev in self._handle_knowledge_or_plan(
                intent_res=intent_res,
                route_outcome=route_outcome,
                content=content,
                raw_content=raw_content,
                lower=lower,
                page_slug=page_slug,
                page_context=page_context,
                session_id=session_id,
                session_ctx=session_ctx,
                delay=delay,
            ):
                yield ev
            return

        async for ev in self._handle_chitchat_turn(
            content=content,
            page_slug=page_slug,
            session_id=session_id,
            session_ctx=session_ctx,
            understood=understood,
            intent_res=intent_res,
            delay=delay,
        ):
            yield ev

    async def _astream_events_impl(
        self, input_dict: dict, config: dict | None = None
    ) -> AsyncGenerator[dict, None]:
        raw_content = input_dict.get("messages", [{}])[-1].get("content", "").strip()
        page_context = input_dict.get("context")
        # Typing effect only for streaming clients; fast=True (sync /chat) skips it entirely.
        delay = 0.0 if input_dict.get("fast") else self.typing_delay
        content = normalize_vietnamese(raw_content)
        session_id = (config or {}).get("configurable", {}).get("thread_id", "default")
        lower = content.lower()
        session_ctx = session_store.get_or_create(session_id)

        # ── Input guard: empty or oversized messages never reach routing ─────
        if input_problem(content):
            async for ev in self._emit_input_problem_if_any(content, delay):
                yield ev
            return

        # An Owner's thread kept in Turso (ADR-0012), its history and open Topic/Lesson focus, is read once,
        # before anything below reads either; the two reads run together so a cold start waits for one round trip
        await self._load_thread_context(session_id, session_ctx, page_context)
        page_slug = self._sync_page_focus(session_id, session_ctx, page_context)

        pre_outcome = {"handled": False}
        async for ev in self._run_pre_route_stage(
            raw_content=raw_content,
            content=content,
            lower=lower,
            page_context=page_context,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
            input_dict=input_dict,
            outcome=pre_outcome,
        ):
            yield ev
        if pre_outcome["handled"]:
            return

        # ── 3. Classify Intent via IntentRouter ───────────────────────────────
        yield step_event("route", "routing", "running")
        route_outcome = await self._decide_route_traced(content, page_context, session_ctx, session_id)
        intent_res, method, decision, route_gate = (
            route_outcome.intent_res,
            route_outcome.method,
            route_outcome.decision,
            route_outcome.gate,
        )
        understood = decision.understanding
        yield step_event(
            "route",
            "routing",
            "done",
            intent=intent_res.intent.value,
            sub_intent=intent_res.sub_intent_value,
            confidence=round(intent_res.confidence, 2),
            method=method,
            act=understood.act.value,
            target=understood.target.value,
            # The heuristic reading even when the LLM decided: a blocked_change row explains a denied write
            rule=decision.row,
            write=route_gate.mode,
        )
        self._record_route_flags(route_outcome, intent_res, decision, route_gate, method)

        gate_outcome = {"handled": False}
        async for ev in self._handle_route_gate_blocks(
            intent_res=intent_res,
            route_gate=route_gate,
            lower=lower,
            page_context=page_context,
            session_ctx=session_ctx,
            delay=delay,
            outcome=gate_outcome,
        ):
            yield ev
        if gate_outcome["handled"]:
            return

        async for ev in self._dispatch_routed_turn(
            intent_res=intent_res,
            route_outcome=route_outcome,
            route_gate=route_gate,
            understood=understood,
            content=content,
            raw_content=raw_content,
            lower=lower,
            page_slug=page_slug,
            page_context=page_context,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
        ):
            yield ev


def _item_fields(doc) -> dict:
    """What the retrieve step shows per document (the client's contract)."""
    return {"title": doc.title, "type": doc.doc_type, "topic": doc.topic_slug}


def rerank_text(doc) -> str:
    """What the reranker reads for a candidate: its name, place in the roadmap and description."""
    where = f"[{doc.doc_type}] {doc.title}" + (f" ({doc.section})" if getattr(doc, "section", None) else "")
    return f"{where}. {doc.description or ''} {doc.content_text or ''}".strip()


async def _rerank(llm, query: str, matches: list) -> list:
    return await rerank(llm, query, matches, rerank_text)


def _rerank_gap() -> float:
    if settings.rag_rerank_gap.strip().lower() != "auto":
        return float(settings.rag_rerank_gap)
    from rag_service.domains.roadmap.router.scope import load_thresholds

    return float(((load_thresholds() or {}).get("rerank") or {}).get("rerank_below_gap", 0.0))


def _rerank_needed(query: str, matches: list) -> bool:
    """Rerank only when the two best documents are close (tuned on the tune split: about a quarter of questions)."""
    gap = _rerank_gap()
    if gap <= 0 or len(matches) < 2:
        return len(matches) >= 2
    sims = rag_engine._vector_store._similarities(query) or {}
    top = sorted((sims.get(doc.id, 0.0) for doc, _ in matches), reverse=True)
    return len(top) < 2 or top[0] - top[1] < gap


def _describe_document(doc) -> dict:
    """Roadmap fields of a retrieved document for the trace and the retrieve step."""
    return {
        "type": doc.doc_type,
        "title": doc.title,
        "topic": doc.topic_slug,
        "section": getattr(doc, "section", None),
        "has_description": bool(doc.description),
    }


def _resolve_gemini_api_key() -> str:
    """Resolve Gemini API key from settings, env vars, or project .env files."""
    api_key = (
        settings.gemini_api_key
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    if api_key and not api_key.startswith("your_"):
        return api_key

    candidates = [
        Path(".env"),
        Path(".env.local"),
        Path("../.env"),
        Path("../.env.local"),
        Path(__file__).resolve().parents[4] / ".env",
        Path(__file__).resolve().parents[4] / ".env.local",
    ]
    for p in candidates:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY=") or line.startswith("GOOGLE_API_KEY="):
                            val = line.split("=", 1)[1].strip(" \"'")
                            if val and not val.startswith("your_"):
                                return val
            except Exception as exc:
                log.debug("Failed reading env file %s: %s", p, exc)
    return ""


def _build_gemini(model: str = ""):
    api_key = _resolve_gemini_api_key()
    if not api_key:
        return None
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=model or settings.llm_model,
        api_key=api_key,
        temperature=PROFILE.temperature,
        max_retries=1,
        timeout=25.0,
        streaming=True,
    )


def _build_groq(model: str = "", reasoning_effort: str = ""):
    keys = parse_keys(
        settings.groq_api_key or os.environ.get("GROQ_API_KEY", ""),
        settings.groq_api_keys or os.environ.get("GROQ_API_KEYS", ""),
    )
    if not keys:
        print("[Agent] LLM_PROVIDER=groq but GROQ_API_KEY is not set.")
        return None
    from langchain_groq import ChatGroq

    models = [
        ChatGroq(
            model=model or settings.llm_model,
            api_key=key,
            temperature=PROFILE.temperature,
            # Groq's free tier answers 429 when the per-minute limit is hit; retry with backoff.
            # With more keys, one retry: a key out of daily tokens should hand over quickly.
            max_retries=2 if len(keys) == 1 else 1,
            timeout=25.0,
            streaming=True,
            # Only reasoning models take it (gpt-oss): a structured classification needs little reasoning
            **({"reasoning_effort": reasoning_effort} if reasoning_effort and "gpt-oss" in (model or settings.llm_model) else {}),
        )
        for key in keys
    ]
    return models[0] if len(models) == 1 else KeyRotatingLLM(models)


_PROVIDERS = {"google_genai": _build_gemini, "groq": _build_groq}


def build_agent():
    """Create and return the NextGenRoadmapAgent.

    LLM_PROVIDER picks the chat model (google_genai | groq); LLM_MODEL names it.
    Without a usable key the agent runs offline with deterministic two-stage precision.
    """
    provider = settings.llm_provider.strip().lower()
    builder = _PROVIDERS.get(provider)
    llm_model = None
    if builder is None:
        print(f"[Agent] Unknown LLM_PROVIDER '{provider}' (use {', '.join(_PROVIDERS)}). Using offline mode.")
    else:
        try:
            llm_model = builder()
            if llm_model is not None:
                print(f"🤖 Agent initialized: provider={provider}, model={settings.llm_model}, Live RAG & State on.")
        except Exception as exc:
            print(f"[Agent] Warning: Failed to init {provider} model ({type(exc).__name__}: {exc}). Using offline mode.")

    router_llm = None
    router_model = settings.llm_model_router.strip() or settings.llm_model
    effort = settings.llm_router_reasoning_effort.strip()
    if builder is not None and llm_model is not None and (settings.llm_model_router.strip() or effort):
        try:
            build = (lambda m: builder(m, reasoning_effort=effort)) if builder is _build_groq else builder
            router_llm = with_fallback_provider(build(router_model), provider)
            print(f"🤖 Router / write verification model: {router_model} (reasoning_effort={effort or 'default'}).")
        except Exception as exc:
            print(f"[Agent] Router model unavailable ({type(exc).__name__}: {exc}); using LLM_MODEL.")
    return NextGenRoadmapAgent(
        llm_model=with_fallback_provider(llm_model, provider), tools=ALL_TOOLS, router_llm=router_llm
    )


def with_fallback_provider(llm_model, provider: str):
    """`llm_model` followed by LLM_FALLBACK_PROVIDER's model, used when every primary key is rate limited."""
    fallback_provider = settings.llm_fallback_provider.strip().lower()
    builder = _PROVIDERS.get(fallback_provider)
    if not fallback_provider or fallback_provider == provider or builder is None:
        return llm_model
    try:
        fallback = builder(settings.llm_fallback_model)
    except Exception as exc:
        print(f"[Agent] Fallback {fallback_provider} unavailable ({type(exc).__name__}: {exc}).")
        return llm_model
    if fallback is None:
        return llm_model
    if llm_model is None:
        return fallback
    primary = llm_model.models if isinstance(llm_model, KeyRotatingLLM) else [llm_model]
    print(f"🤖 Fallback on rate limit: provider={fallback_provider}, model={settings.llm_fallback_model}.")
    return KeyRotatingLLM([*primary, fallback])


# Backward compatibility alias
FallbackAgent = NextGenRoadmapAgent
