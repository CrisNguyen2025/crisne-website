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
import re
from pathlib import Path
from typing import AsyncGenerator, Optional

from rag_service.config import settings
from rag_service.execution.dry_run import DryRunValidator
from rag_service.execution.executor import ActionExecutor
from rag_service.observability import (
    current_trace,
    end_step,
    start_step,
    traced_turn,
    usage_from_langchain,
)
from rag_service.rag.rag_engine import rag_engine
from rag_service.router import (
    ActionType,
    EntityLevel,
    IntentClassificationResult,
    IntentRouter,
    IntentType,
    StructuredEntityExtractor,
    StructuredRoadmapAction,
    normalize_vietnamese,
)
from rag_service.router.grounding import OUT_OF_SCOPE_REPLY, build_grounding
from rag_service.tools.item_tools import import_items_from_text, parse_item_list
from rag_service.state import AnaphoraResolver, session_store
from rag_service.tools import ALL_TOOLS
from rag_service.tools.rag_tools import (
    generate_roadmap_from_template,
    preview_roadmap_plan,
    search_roadmap_templates,
)


class NextGenRoadmapAgent:
    """Enterprise-grade Agentic Roadmap Assistant with Live RAG and State Machine."""

    def __init__(self, llm_model: Optional[object] = None, tools: Optional[list] = None) -> None:
        self.llm = llm_model
        self.typing_delay = float(os.getenv("RAG_TYPING_DELAY_MS", "5")) / 1000
        self.tools = {t.name: t for t in (tools or ALL_TOOLS)}
        self.router = IntentRouter(llm_model=llm_model)
        self.extractor = StructuredEntityExtractor(llm_model=llm_model)
        self.executor = ActionExecutor()

    async def _stream_text(self, text: str, delay: float) -> AsyncGenerator[dict, None]:
        """Stream words over SSE. `delay` (seconds per word) adds an optional typing effect; 0 disables it."""
        words = text.split(" ")
        for i, word in enumerate(words):
            delta = word + (" " if i < len(words) - 1 else "")
            yield {"type": "token", "delta": delta}
            if delay:
                await asyncio.sleep(delay)

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
        async for ev in traced_turn(
            self._astream_events_impl(input_dict, config),
            message=message,
            session_id=session_id,
            page_context=input_dict.get("context"),
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

        # ── 0. Pending Action Confirmation ────────────────────────────────────
        if session_ctx.pending_confirmation:
            if lower in ["ok", "oke", "xác nhận", "đồng ý", "yes", "confirm", "tiến hành", "chắc chắn"]:
                pending_act = session_ctx.pending_confirmation
                session_ctx.pending_confirmation = None
                tool_name = f"{pending_act.action.value}_{pending_act.entity_level.value}"
                yield {"type": "tool_start", "name": tool_name, "args": {"confirmed": True}}
                ok, res_msg = await self.executor.aexecute(pending_act, session_id=session_id)
                yield {"type": "tool_end", "name": tool_name, "result": res_msg}
                async for ev in self._stream_text(res_msg, delay):
                    yield ev
                return
            elif lower in ["hủy", "huỷ", "cancel", "không", "no", "bỏ qua", "thôi"]:
                session_ctx.pending_confirmation = None
                cancel_msg = "Đã hủy bỏ thao tác theo yêu cầu của bạn."
                async for ev in self._stream_text(cancel_msg, delay):
                    yield ev
                return

        # ── 1. Plan / Goal Mode ───────────────────────────────────────────────
        if "/plan" in lower or "lập kế hoạch" in lower or "xem trước" in lower:
            yield {"type": "tool_start", "name": "preview_roadmap_plan", "args": {"query_or_template_id": content}}
            res = await preview_roadmap_plan.ainvoke({"query_or_template_id": content})
            yield {"type": "tool_end", "name": "preview_roadmap_plan", "result": res}
            async for ev in self._stream_text(res, delay):
                yield ev
            return

        if "/goal" in lower or "sinh nhanh" in lower or ("template" in lower and ("tạo" in lower or "lộ trình" in lower)):
            m = re.search(r"template\s+([\w-]+)", lower)
            tid = m.group(1) if m else "ai-engineering"
            yield {"type": "tool_start", "name": "generate_roadmap_from_template", "args": {"template_id": tid}}
            res = await generate_roadmap_from_template.ainvoke({"template_id": tid})
            yield {"type": "tool_end", "name": "generate_roadmap_from_template", "result": res}
            async for ev in self._stream_text(res, delay):
                yield ev
            return

        # ── 2. List Topics / Navigation ───────────────────────────────────────
        if any(k in lower for k in ["liệt kê topic", "danh sách topic", "list topics", "các topic hiện có"]):
            yield {"type": "tool_start", "name": "list_topics", "args": {}}
            res = await self.tools["list_topics"].ainvoke({})
            yield {"type": "tool_end", "name": "list_topics", "result": res}
            async for ev in self._stream_text(res, delay):
                yield ev
            return

        # ── 2b. Bulk import: a pasted list while a layer is open ──────────────
        bulk_titles = parse_item_list(raw_content)
        layer_in_view = (page_context or {}).get("layerId")
        if layer_in_view and len(bulk_titles) >= 2:
            tool_args = {"layer_id": layer_in_view, "level": "core", "text": raw_content}
            yield {"type": "tool_start", "name": "import_items_from_text", "args": tool_args}
            res = await import_items_from_text.coroutine(**tool_args)
            yield {"type": "tool_end", "name": "import_items_from_text", "result": res}
            async for ev in self._stream_text(res + "\n\n_Các item được thêm vào level `core`. Nói rõ level nếu muốn khác._", delay):
                yield ev
            return
        if not layer_in_view and len(bulk_titles) >= 2 and re.search(r"\bthêm\b|\badd\b", lower):
            ask = (
                f"Tôi thấy {len(bulk_titles)} dòng item nhưng chưa biết thêm vào layer nào. "
                "Hãy mở layer đích trên trang rồi gửi lại danh sách, hoặc nói rõ tên layer."
            )
            async for ev in self._stream_text(ask, delay):
                yield ev
            return

        # ── 3. Classify Intent via IntentRouter ───────────────────────────────
        router_step = start_step("intent-router", input={"message": content})
        intent_res: IntentClassificationResult = await self.router.aclassify(content)
        # classify_heuristics is a cheap pure check; it tells us whether the LLM was needed.
        method = "heuristic" if self.router.classify_heuristics(content) is not None else (
            "llm" if self.llm is not None else "default"
        )
        end_step(router_step, output=intent_res.model_dump(mode="json"), metadata={"method": method})
        if (trace := current_trace()) is not None:
            trace.flags["intent"] = intent_res.intent.value

        # ── 3b. Scope guardrail: refuse requests unrelated to roadmaps ────────
        if intent_res.intent == IntentType.OUT_OF_SCOPE:
            async for ev in self._stream_text(OUT_OF_SCOPE_REPLY, delay):
                yield ev
            return

        # ── 4. ROADMAP CUD OPERATIONS ─────────────────────────────────────────
        if intent_res.intent == IntentType.ROADMAP_CUD or intent_res.needs_cud_extraction:
            # Page context is added only for the LLM extractor; heuristics keep the raw text.
            action: StructuredRoadmapAction = await self.extractor.aextract(
                content, page_context=build_grounding(page_context)
            )
            resolved_action, note = AnaphoraResolver.resolve_action(action, session_id=session_id)

            # Dry-run confirmation for DELETE operations unless 'ngay'/'immediately' is specified
            if resolved_action.action == ActionType.DELETE and not any(w in lower for w in ["ngay", "immediately", "luôn"]):
                session_ctx.pending_confirmation = resolved_action
                preview_text = DryRunValidator.format_preview_card(resolved_action, note=note)
                preview_text += "\n\n👉 Bấm nút **[✅ Xác nhận thực hiện]** bên dưới hoặc gõ \"ok\" để tiến hành. Bấm **[❌ Hủy bỏ]** để hủy."
                yield {
                    "type": "action_preview",
                    "action_id": session_id,
                    "preview": preview_text,
                }
                async for ev in self._stream_text(preview_text, delay):
                    yield ev
                return

            if resolved_action.is_batch and resolved_action.entity_level != EntityLevel.GROUP:
                tool_name = f"{resolved_action.action.value}_{resolved_action.entity_level.value}s_batch"
            else:
                tool_name = f"{resolved_action.action.value}_{resolved_action.entity_level.value}"

            tool_args = {
                "entity_level": resolved_action.entity_level.value,
                "action": resolved_action.action.value,
                "parent": resolved_action.target_parent_identifier,
                "entities": [e.model_dump() for e in resolved_action.entities],
            }
            yield {"type": "tool_start", "name": tool_name, "args": tool_args}

            ok, result_msg = await self.executor.aexecute(resolved_action, session_id=session_id)
            yield {"type": "tool_end", "name": tool_name, "result": result_msg}

            full_reply = result_msg
            if note:
                full_reply = f"> 💡 _{note}_\n\n" + full_reply

            async for ev in self._stream_text(full_reply, delay):
                yield ev
            return

        # ── 5. KNOWLEDGE QUERY (REAL LIVE RAG SEARCH) ─────────────────────────
        if intent_res.intent == IntentType.KNOWLEDGE_QUERY:
            yield {"type": "tool_start", "name": "search_live_knowledge", "args": {"query": content}}
            retrieval_step = start_step(
                "retrieve-live-knowledge",
                "retriever",
                input={"query": content, "limit": 4},
                metadata={"adapter_mode": settings.rag_adapter_mode, "scoring": "rrf(vector+keyword)"},
            )
            matches = await rag_engine.search_live_knowledge(content, limit=4)
            end_step(
                retrieval_step,
                output=[
                    {
                        "rank": i + 1,
                        "score": round(score, 4),
                        "type": doc.doc_type,
                        "title": doc.title,
                        "topic": doc.topic_slug,
                        "layer": doc.layer_title,
                        "has_description": bool(doc.description),
                    }
                    for i, (doc, score) in enumerate(matches)
                ],
            )
            if (trace := current_trace()) is not None:
                trace.flags["retrieved"] = len(matches)
            yield {"type": "tool_end", "name": "search_live_knowledge", "result": f"Tìm thấy {len(matches)} tài liệu"}

            if matches:
                rag_context = rag_engine.format_knowledge_context(matches)

                # Synthesize with LLM if available
                if self.llm is not None:
                    gen = None
                    try:
                        synth_prompt = (
                            f"Bạn là Roadmap Assistant. Trả lời câu hỏi của người dùng dựa trên thông tin thực tế từ hệ thống dưới đây:\n\n"
                            f"{rag_context}\n\n"
                            f"Câu hỏi của người dùng: \"{content}\"\n\n"
                            f"Hãy trả lời súc tích, tự nhiên, kèm đường link [Tên bài](/roadmaps/slug) nếu có."
                        )
                        gen = start_step(
                            "synthesize-answer",
                            "generation",
                            model=settings.llm_model,
                            input=synth_prompt,
                        )
                        merged = None
                        async for chunk in self.llm.astream(synth_prompt):
                            merged = chunk if merged is None else merged + chunk
                            if hasattr(chunk, "content") and chunk.content:
                                yield {"type": "token", "delta": chunk.content}
                        end_step(
                            gen,
                            output=getattr(merged, "content", ""),
                            usage_details=usage_from_langchain(merged),
                        )
                        return
                    except Exception as exc:
                        print(f"[Agent] LLM synthesis warning ({type(exc).__name__}: {exc}). Falling back to formatted context.")
                        end_step(
                            gen,
                            level="ERROR",
                            status_message=f"{type(exc).__name__}: {exc}",
                            metadata={"fallback": "formatted_context"},
                        )
                        if (trace := current_trace()) is not None:
                            trace.flags["llm_fallback"] = True

                # Fallback directly to formatted markdown context
                async for ev in self._stream_text(rag_context, delay):
                    yield ev
                return
            else:
                resp = (
                    f"Tôi đã tìm kiếm trong toàn bộ cơ sở dữ liệu Roadmap nhưng chưa thấy bài học hoặc tài liệu nào phù hợp với từ khóa **\"{content}\"**.\n\n"
                    f"Bạn có thể yêu cầu tôi tạo mới bằng lệnh: `tạo topic ...` hoặc `thêm bài học ... vào layer ...`!"
                )
                async for ev in self._stream_text(resp, delay):
                    yield ev
                return

        # ── 6. CHITCHAT / GENERAL ASSISTANT ───────────────────────────────────
        if self.llm is not None:
            gen = None
            try:
                chat_prompt = (
                    "Bạn là Roadmap AI Assistant — trợ lý thông minh quản lý hệ thống lộ trình học tập.\n"
                    "Người dùng vừa gửi tin nhắn: " + repr(content) + "\n"
                    "Chỉ trả lời về lộ trình học tập, topic, layer, nhóm và bài học. "
                    "Nếu câu hỏi nằm ngoài phạm vi này, lịch sự từ chối và gợi ý các việc bạn có thể làm.\n"
                    "Hãy trả lời ngắn gọn, lịch sự, thân thiện và gợi ý các tính năng tạo Topic/Layer/Item nếu phù hợp."
                )
                gen = start_step("chitchat-answer", "generation", model=settings.llm_model, input=chat_prompt)
                merged = None
                async for chunk in self.llm.astream(chat_prompt):
                    merged = chunk if merged is None else merged + chunk
                    if hasattr(chunk, "content") and chunk.content:
                        yield {"type": "token", "delta": chunk.content}
                end_step(gen, output=getattr(merged, "content", ""), usage_details=usage_from_langchain(merged))
                return
            except Exception as exc:
                end_step(gen, level="ERROR", status_message=f"{type(exc).__name__}: {exc}")
                if (trace := current_trace()) is not None:
                    trace.flags["llm_fallback"] = True

        resp = (
            f"Xin chào! Tôi là **Roadmap AI Assistant** — Trợ lý quản lý hệ thống tài liệu & lộ trình học tập.\n\n"
            f"Bạn có thể yêu cầu tôi:\n"
            f"- 🗺️ **Tạo Topic mới**: `tạo ABC topic`, `tạo topic AI Engineering`\n"
            f"- 📑 **Tạo Layer**: `create aaa layer on fe`, `tạo 2 layer mock 1 và 2 trong be topic`\n"
            f"- 📖 **Thêm bài học (Item)**: `thêm 3 item bài 1, 2 và 3 vào layer ...`\n"
            f"- 🧠 **Tra cứu tri thức**: `Tìm kiếm kiến thức về Vector Database trong lộ trình AI`\n"
            f"- 📋 **Lập kế hoạch**: `/plan tạo lộ trình Next.js Fullstack`"
        )
        async for ev in self._stream_text(resp, delay):
            yield ev


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
        Path(__file__).resolve().parent.parent.parent / ".env",
        Path(__file__).resolve().parent.parent.parent / ".env.local",
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


def build_agent():
    """Create and return the NextGenRoadmapAgent.

    Equipped with Gemini if key is provided, or executes offline with deterministic
    two-stage precision.
    """
    api_key = _resolve_gemini_api_key()
    llm_model = None

    if api_key:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI

            llm_model = ChatGoogleGenerativeAI(
                model=settings.llm_model,
                api_key=api_key,
                temperature=0.1,
                max_retries=1,
                timeout=25.0,
                streaming=True,
            )
            print("🤖 NextGen Gemini Agent successfully initialized with Live RAG & State!")
        except Exception as exc:
            print(f"[Agent] Warning: Failed to init Gemini model ({exc}). Using offline mode.")

    return NextGenRoadmapAgent(llm_model=llm_model, tools=ALL_TOOLS)


# Backward compatibility alias
FallbackAgent = NextGenRoadmapAgent
