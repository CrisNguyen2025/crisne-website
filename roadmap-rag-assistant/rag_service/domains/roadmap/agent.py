"""Next-Gen Roadmap Agent — Enterprise Two-Stage Agentic Architecture.

Architecture:
1. Fast Intent Router: classifies into CUD, Knowledge Query, Plan/Goal, or Chitchat.
2. Structured Entity Extractor: Pydantic schemas enforce verb-free titles and accurate acronyms.
3. Conversational State Machine: resolves pronouns ('vào đó', 'ở trên') across multiple turns.
4. Real Hybrid RAG Engine: queries live website database (Roadmaps, Layers, Items, Content).
5. Safe Action Executor: dispatches CUD operations to database adapters with state tracking.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import AsyncGenerator, Optional

from rag_service.auth import is_owner
from rag_service.config import settings
from rag_service.llm_keys import KeyRotatingLLM, parse_keys
from rag_service.execution.executor import ActionExecutor
from rag_service.core.generation.delivery import record_turn
from rag_service.core.guards import input_problem, is_sensitive_request
from rag_service.core.orchestration.llm_answer import answer_with_llm
from rag_service.core.orchestration.sources import SourceDeps, answer_from_sources, llm_fallback_reason, stream_words
from rag_service.domains.roadmap.agent_actions import RoadmapAgentActions
from rag_service.domains.roadmap.commands import RoadmapCommands
from rag_service.domains.roadmap.pipeline import generation_pipeline
from rag_service.domains.roadmap.profile import PROFILE
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
from rag_service.core.retrieval.transform import HISTORY_TURNS, plan_queries
from rag_service.domains.roadmap.retrieval.relevance import filter_on_topic
from rag_service.domains.roadmap.retrieval.engine import knowledge_href, rag_engine
from rag_service.domains.roadmap.router import (
    IntentClassificationResult,
    IntentRouter,
    IntentType,
    StructuredEntityExtractor,
    normalize_vietnamese,
)
from rag_service.domains.roadmap.router.policy import WRITE_NONE
from rag_service.domains.roadmap.router.write_gate import BLOCKED_CHANGE, gate_route
from rag_service.domains.roadmap.router.grounding import (
    EMPTY_MESSAGE_REPLY,
    mixed_intent_reply,
    RETRIEVAL_ERROR_REPLY,
    SENSITIVE_REPLY,
    TOO_LONG_REPLY,
    UNCLEAR_REPLY,
    BLOCKED_CHANGE_REPLY,
    no_match_reply,
    out_of_scope_reply,
)
from rag_service.state import session_store
from rag_service.tools import ALL_TOOLS


# Placeholders the anaphora resolver leaves when no topic/layer is known from context
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


async def _plan_queries(llm, query: str, session_id: str):
    """Query plan for a turn: the recent conversation is passed so references like "bài đó" can be resolved."""
    return await plan_queries(query, history_store.get_recent(session_id, HISTORY_TURNS), llm)


class NextGenRoadmapAgent(RoadmapAgentActions, RoadmapCommands):
    """Enterprise-grade Agentic Roadmap Assistant with Live RAG and State Machine."""

    def __init__(self, llm_model: Optional[object] = None, tools: Optional[list] = None) -> None:
        self.llm = llm_model
        self.typing_delay = float(os.getenv("RAG_TYPING_DELAY_MS", "5")) / 1000
        self.tools = {t.name: t for t in (tools or ALL_TOOLS)}
        self.router = IntentRouter(llm_model=llm_model, vocabulary=rag_engine.title_vocabulary)
        self.extractor = StructuredEntityExtractor(llm_model=llm_model)
        self.executor = ActionExecutor()

    def _llm_fallback_reason(self, failed: bool | str) -> Optional[str]:
        return llm_fallback_reason(self.llm, failed)

    async def _stream_text(self, text: str, delay: float) -> AsyncGenerator[dict, None]:
        async for ev in stream_words(text, delay):
            yield ev

    def _source_deps(self) -> SourceDeps:
        """The roadmap's hooks for the core RAG flow. Looked up at call time so tests can patch the engine."""
        return SourceDeps(
            search=lambda query, limit=4: rag_engine.search_live_knowledge(query, limit=limit),
            accept=lambda query, matches: filter_on_topic(query, matches, rag_engine.corpus_vocabulary()),
            plan=_plan_queries if settings.rag_query_transform else None,
            rerank=_rerank if settings.rag_rerank else None,
            format_context=lambda matches: rag_engine.format_knowledge_context(matches),
            href_of=knowledge_href,
            item_fields=_item_fields,
            trace_fields=_describe_document,
            no_match_reply=no_match_reply,
            retrieval_error_reply=RETRIEVAL_ERROR_REPLY,
            pipeline=generation_pipeline,
            adapter_mode=settings.rag_adapter_mode,
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

        msgs = []
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
        problem = input_problem(content)
        if problem:
            reply = EMPTY_MESSAGE_REPLY if problem == "empty" else TOO_LONG_REPLY
            if (trace := current_trace()) is not None:
                trace.flags["guard"] = problem
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        # ── 0. Pending roadmap change: confirmation or layer choice (roadmap domain) ──
        outcome = {"handled": False}
        async for ev in self.handle_pending(
            content=content, lower=lower, session_id=session_id, session_ctx=session_ctx, delay=delay, outcome=outcome,
        ):
            yield ev
        if outcome["handled"]:
            return

        # ── 0c. Sensitive guard: secrets, system prompt, prompt injection ─────
        if is_sensitive_request(content):
            if (trace := current_trace()) is not None:
                trace.flags["guard"] = "sensitive"
            async for ev in self._stream_text(SENSITIVE_REPLY, delay):
                yield ev
            return

        # ── 1–2. Plan/goal and topic listing (roadmap domain: commands.py) ──
        outcome = {"handled": False}
        async for ev in self.handle_plan_and_listing(content=content, lower=lower, delay=delay, outcome=outcome):
            yield ev
        if outcome["handled"]:
            return

        # ── 2b. Bulk import of a pasted list (roadmap domain: rag_service/domains/roadmap/commands.py) ──
        if self.bulk_import_applies(raw_content, lower, page_context):
            async for ev in self.handle_bulk_import(raw_content=raw_content, lower=lower, page_context=page_context, delay=delay):
                yield ev
            return

        # ── 2c. Several requests in one message: ask for one at a time ────────
        if mixed_steps := self.router.mixed_intent_steps(content):
            if (trace := current_trace()) is not None:
                trace.flags["guard"] = "mixed_intents"
            async for ev in self._stream_text(mixed_intent_reply(mixed_steps), delay):
                yield ev
            return

        # ── 3. Classify Intent via IntentRouter ───────────────────────────────
        yield step_event("route", "routing", "running")
        router_step = start_step("intent-router", input={"message": content})
        intent_res: IntentClassificationResult
        recent = history_store.get_recent(session_id, HISTORY_TURNS)
        try:
            intent_res, method = await self.router.aroute(content, recent)
        except BaseException as exc:
            end_step_on_error(router_step, exc)
            raise
        # The heuristic decision with its reasons (policy row, axes, cues) and the write gate, kept with the route
        # so a misroute shows which rule fired and whether data could have changed
        decision = self.router.decide(content)
        understood = decision.understanding
        route_gate = gate_route(
            intent_res, method, self.router.has_change_request(content, follow_up=bool(recent)), decision.write
        )
        end_step(
            router_step,
            output=intent_res.model_dump(mode="json"),
            metadata={"method": method, **understood.summary(), "rules": decision.rules, "write": route_gate.mode},
        )
        yield step_event(
            "route",
            "routing",
            "done",
            intent=intent_res.intent.value,
            confidence=round(intent_res.confidence, 2),
            method=method,
            act=understood.act.value,
            target=understood.target.value,
            # The heuristic reading even when the LLM decided: a blocked_change row explains a denied write
            rule=decision.row,
            write=route_gate.mode,
        )
        if (trace := current_trace()) is not None:
            trace.flags["act"] = understood.act.value
            trace.flags["target"] = understood.target.value
            trace.flags["intent"] = intent_res.intent.value
            trace.flags["write"] = route_gate.mode

        # ── 3b. Scope guardrail: refuse requests unrelated to roadmaps ────────
        if intent_res.intent == IntentType.OUT_OF_SCOPE:
            async for ev in self._stream_text(out_of_scope_reply(is_owner()), delay):
                yield ev
            return

        # ── 3c. Write gate (write_gate.py): a denied change, or an unclear message, gets an ask-back ──
        if intent_res.intent == IntentType.UNCLEAR or route_gate.denied:
            blocked = route_gate.reason == BLOCKED_CHANGE
            if (trace := current_trace()) is not None and route_gate.denied:
                trace.flags["guard"] = "cud_blocked" if blocked else "cud_unconfirmed"
            yield step_event("answer", "generation", "done", mode="blocked" if blocked else "unclear", fallback_reason=None)
            async for ev in self._stream_text(BLOCKED_CHANGE_REPLY if blocked else UNCLEAR_REPLY, delay):
                yield ev
            return

        # ── 4. ROADMAP CUD OPERATIONS (roadmap domain: rag_service/domains/roadmap/commands.py) ──
        if route_gate.mode != WRITE_NONE:
            async for ev in self.handle_cud(
                content=content, lower=lower, page_context=page_context,
                session_id=session_id, session_ctx=session_ctx, delay=delay, gate=route_gate,
            ):
                yield ev
            return

        # ── 5. KNOWLEDGE QUERY: live retrieval, then an answer from the sources (core: core/orchestration/sources.py) ──
        if intent_res.intent == IntentType.KNOWLEDGE_QUERY:
            async for ev in answer_from_sources(
                query=content, session_id=session_id, owner=is_owner(), delay=delay,
                llm=self.llm, deps=self._source_deps(),
            ):
                yield ev
            return

        # ── 6. CHITCHAT / GENERAL ASSISTANT ───────────────────────────────────
        # "làm được gì", "cách thêm bài vào layer": the command list, not an LLM answer that may refuse or invent syntax
        if understood.asks_usage:
            yield step_event("answer", "generation", "done", mode="help")
            async for ev in self._stream_text(await self._help_reply(), delay):
                yield ev
            return

        outcome = {"handled": False, "llm_failed": False}
        async for ev in answer_with_llm(
            llm=self.llm, pipeline=generation_pipeline, mode="chitchat", query=content, session_id=session_id, outcome=outcome,
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
            async for ev in self._stream_text(UNCLEAR_REPLY, delay):
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


def _item_fields(doc) -> dict:
    """What the retrieve step shows per document (the client's contract)."""
    return {"title": doc.title, "type": doc.doc_type, "topic": doc.topic_slug}


def rerank_text(doc) -> str:
    """What the reranker reads for a candidate: its name, place in the roadmap and description."""
    where = f"[{doc.doc_type}] {doc.title}" + (f" ({doc.layer_title})" if doc.layer_title else "")
    return f"{where}. {doc.description or ''} {doc.content_text or ''}".strip()


async def _rerank(llm, query: str, matches: list) -> list:
    return await rerank(llm, query, matches, rerank_text)


def _describe_document(doc) -> dict:
    """Roadmap fields of a retrieved document for the trace and the retrieve step."""
    return {
        "type": doc.doc_type,
        "title": doc.title,
        "topic": doc.topic_slug,
        "layer": doc.layer_title,
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
            except Exception:
                pass
    return ""


def _build_gemini():
    api_key = _resolve_gemini_api_key()
    if not api_key:
        return None
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=settings.llm_model,
        api_key=api_key,
        temperature=PROFILE.temperature,
        max_retries=1,
        timeout=25.0,
        streaming=True,
    )


def _build_groq():
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
            model=settings.llm_model,
            api_key=key,
            temperature=PROFILE.temperature,
            # Groq's free tier answers 429 when the per-minute limit is hit; retry with backoff.
            # With more keys, one retry: a key out of daily tokens should hand over quickly.
            max_retries=2 if len(keys) == 1 else 1,
            timeout=25.0,
            streaming=True,
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

    return NextGenRoadmapAgent(llm_model=llm_model, tools=ALL_TOOLS)


# Backward compatibility alias
FallbackAgent = NextGenRoadmapAgent
