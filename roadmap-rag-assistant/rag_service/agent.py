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

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.config import settings
from rag_service.execution.dry_run import DryRunValidator
from rag_service.execution.executor import ActionExecutor
from rag_service.generation import GenerationFailed, GenerationRequest, generation_pipeline, record_turn
from rag_service.generation.domain_profile import PROFILE
from rag_service.observability import (
    current_trace,
    end_step,
    start_step,
    traced_turn,
)
from rag_service.steps import step_event, with_steps
from rag_service.rag.rag_engine import rag_engine
from rag_service.router import (
    ActionType,
    EntityLevel,
    IntentClassificationResult,
    IntentRouter,
    IntentType,
    SingleEntity,
    StructuredEntityExtractor,
    StructuredRoadmapAction,
    normalize_vietnamese,
)
from rag_service.router.grounding import (
    BATCH_LAYER_DELETE_REPLY,
    BULK_DELETE,
    BULK_DELETE_REPLY,
    EMPTY_MESSAGE_REPLY,
    MAX_MESSAGE_CHARS,
    MIXED_INTENT_REPLY,
    RETRIEVAL_ERROR_REPLY,
    SENSITIVE_REPLY,
    TOO_LONG_REPLY,
    UNCLEAR_REPLY,
    build_grounding,
    is_sensitive_request,
    no_match_reply,
    out_of_scope_reply,
)
from rag_service.tools.item_tools import import_items_from_text, parse_item_list
from rag_service.state import AnaphoraResolver, session_store
from rag_service.tools import ALL_TOOLS, get_adapter
from rag_service.tools.layer_resolver import LayerResolution, resolve_layer
from rag_service.tools.rag_tools import (
    generate_roadmap_from_template,
    preview_roadmap_plan,
    search_roadmap_templates,
)


# Placeholders the anaphora resolver leaves when no topic/layer is known from context
# Below this the intent router only guessed (its default fallback is 0.5)
UNCLEAR_CONFIDENCE = 0.7
ANAPHORA_TARGETS = ("CONTEXT_ACTIVE", "đó", "nó", "this", "it")
LAYER_VERBS = {ActionType.CREATE: "tạo", ActionType.DELETE: "xóa", ActionType.UPDATE: "sửa"}


class NextGenRoadmapAgent:
    """Enterprise-grade Agentic Roadmap Assistant with Live RAG and State Machine."""

    def __init__(self, llm_model: Optional[object] = None, tools: Optional[list] = None) -> None:
        self.llm = llm_model
        self.typing_delay = float(os.getenv("RAG_TYPING_DELAY_MS", "5")) / 1000
        self.tools = {t.name: t for t in (tools or ALL_TOOLS)}
        self.router = IntentRouter(llm_model=llm_model)
        self.extractor = StructuredEntityExtractor(llm_model=llm_model)
        self.executor = ActionExecutor()

    async def _ask_layer_choice(
        self, session_ctx, action: StructuredRoadmapAction, topic_slug: str, delay: float
    ) -> AsyncGenerator[dict, None]:
        """Park an item create and ask the user to create a default or named layer for it."""
        session_ctx.pending_layer_choice = action
        session_ctx.pending_layer_topic = topic_slug
        titles = ", ".join(f"**{e.title}**" for e in action.entities)
        ask = (
            f"Chưa xác định được layer để thêm {titles} trong topic `{topic_slug}`.\n\n"
            "**Chọn layer cho bài học:**\n"
            "1. Tạo layer mặc định **General** — gõ `tạo layer mặc định`\n"
            "2. Tạo layer mới theo tên bạn nhập — gõ `tạo layer <tên>`"
        )
        async for ev in self._stream_text(ask, delay):
            yield ev

    def _llm_fallback_reason(self, failed: bool | str) -> Optional[str]:
        """Why an answer did not come from the LLM: none configured, the call failed, or rate limited.

        A string is a reason from the generation pipeline ("llm_error", "grounding") and is kept as is.
        """
        if isinstance(failed, str):
            return failed
        if self.llm is None:
            return None
        return "llm_error" if failed else "rate_limited"

    async def _topic_known(self, slug: str) -> bool:
        """True when the topic exists; a failed lookup counts as known, so the executor can still try."""
        try:
            return await get_adapter().get_topic(slug) is not None
        except Exception as exc:
            print(f"[agent] Topic check for '{slug}' skipped: {exc}")
            return True

    async def _ask_topic_choice(
        self, action: StructuredRoadmapAction, identifier: Optional[str], delay: float
    ) -> AsyncGenerator[dict, None]:
        """Ask which topic a layer action belongs to, listing the existing topics. Nothing is written."""
        try:
            topics = await get_adapter().list_topics()
        except Exception as exc:
            print(f"[agent] Topic list skipped: {exc}")
            topics = []
        listing = "\n".join(f"- `{t.get('slug')}` — {t.get('title')}" for t in topics[:15]) or "_(chưa có topic nào)_"
        if identifier and identifier not in ANAPHORA_TARGETS:
            head = f"Không tìm thấy topic `{identifier}`."
        else:
            head = "Chưa xác định được topic cho thao tác này."
        verb = LAYER_VERBS.get(action.action, "")
        titles = ", ".join(e.title for e in action.entities) or "<tên layer>"
        ask = (
            f"{head}\n\n**Các topic hiện có:**\n{listing}\n\n"
            f"Hãy gửi lại kèm tên topic, ví dụ: `{verb} layer {titles} trong topic <slug>`."
        )
        async for ev in self._stream_text(ask, delay):
            yield ev

    async def _greeting_reply(self) -> str:
        """Greeting whose examples name a topic and layer that exist, so they work when copied.

        With no data (or the API down) the examples keep <placeholders> instead of made-up names.
        """
        topic_slug, layer_title = "<slug topic>", "<tên layer>"
        try:
            adapter = get_adapter()
            topics = await adapter.list_topics()
            if topics:
                topic_slug = topics[0].get("slug") or topic_slug
                layers = (await adapter.get_topic(topic_slug) or {}).get("layers") or []
                if layers:
                    layer_title = layers[0].get("title") or layer_title
        except Exception as exc:
            print(f"[agent] Greeting examples use placeholders: {exc}")
        return (
            "Xin chào! Tôi là **Abot** — trợ lý quản lý hệ thống tài liệu & lộ trình học tập.\n\n"
            "Bạn có thể yêu cầu tôi:\n"
            "- 🗺️ **Tạo topic**: `tạo topic <tên topic>`\n"
            f"- 📑 **Tạo layer**: `tạo layer <tên layer> trong topic {topic_slug}`\n"
            f"- 📖 **Thêm bài học**: `thêm bài học <tên bài> vào layer {layer_title}`\n"
            "- 🧠 **Tra cứu tri thức**: `Website có bài nào về Docker hoặc Database không?`\n"
            "- 📋 **Lập kế hoạch**: `/plan Lộ trình Next.js Fullstack`\n\n"
            "_Tên đã có sẵn sẽ không bị tạo trùng._"
        )

    async def _ask_target_choice(
        self,
        session_ctx,
        action: StructuredRoadmapAction,
        identifier: str,
        res: LayerResolution,
        topic_slug: Optional[str],
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        """Park a create whose target layer is unknown or ambiguous and ask the user to pick one."""
        topic_slug = res.topic_slug or topic_slug
        options = res.candidates
        if res.status == "not_found" and topic_slug:
            options = [c for c in options if c["topic_slug"] == topic_slug] or options
        options = options[:10]

        if res.status == "topic" and not options:
            # The topic exists but has no layer yet: offer to create one.
            action.target_parent_identifier = None
            async for ev in self._ask_layer_choice(session_ctx, action, topic_slug, delay):
                yield ev
            return

        session_ctx.pending_layer_choice = action
        session_ctx.pending_layer_topic = topic_slug
        session_ctx.pending_layer_options = options

        titles = ", ".join(f"**{e.title}**" for e in action.entities)
        if res.status == "ambiguous":
            head = f"`{identifier}` khớp nhiều layer. Bạn muốn thêm {titles} vào layer nào?"
        elif res.status == "topic":
            head = f"`{identifier}` là topic **{topic_slug}**. Bạn muốn thêm {titles} vào layer nào của topic này?"
        else:
            head = f"Không tìm thấy topic hay layer nào tên `{identifier}`. Bạn muốn thêm {titles} vào đâu?"

        lines = [
            f"{i}. **{o['title'] or o['shortTag']}**" + (f" — topic `{o['topic_slug']}`" if o["topic_slug"] != topic_slug else "")
            for i, o in enumerate(options, 1)
        ]
        tail = ["", "Gõ **số thứ tự** hoặc **tên layer** để chọn."]
        if topic_slug:
            tail.append(f"Hoặc gõ `tạo layer <tên>` để tạo layer mới trong topic `{topic_slug}`.")
        tail.append("Gõ `hủy` để bỏ qua.")
        ask = "\n".join([head, "", *lines, *tail])
        async for ev in self._stream_text(ask, delay):
            yield ev

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
        reply: list[str] = []
        async for ev in traced_turn(
            with_steps(self._astream_events_impl(input_dict, config)),
            message=message,
            session_id=session_id,
            page_context=input_dict.get("context"),
        ):
            if ev.get("type") == "token":
                reply.append(ev.get("delta", ""))
            yield ev
        # Every branch (LLM, template, tool) becomes memory for the next turn's prompt.
        record_turn(session_id, message, "".join(reply))

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
        if not content or len(content) > MAX_MESSAGE_CHARS:
            reply = EMPTY_MESSAGE_REPLY if not content else TOO_LONG_REPLY
            if (trace := current_trace()) is not None:
                trace.flags["guard"] = "empty" if not content else "too_long"
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        # ── 0. Pending Action Confirmation ────────────────────────────────────
        if session_ctx.pending_confirmation:
            if lower in ["ok", "oke", "xác nhận", "đồng ý", "yes", "confirm", "tiến hành", "chắc chắn"]:
                pending_act = session_ctx.pending_confirmation
                session_ctx.pending_confirmation = None
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                    return
                tool_name = f"{pending_act.action.value}_{pending_act.entity_level.value}"
                yield {"type": "tool_start", "name": tool_name, "args": {"confirmed": True}}
                ok, res_msg = await self.executor.aexecute(pending_act, session_id=session_id)
                yield {"type": "tool_end", "name": tool_name, "result": res_msg, "is_error": not ok}
                async for ev in self._stream_text(res_msg, delay):
                    yield ev
                return
            elif lower in ["hủy", "huỷ", "cancel", "không", "no", "bỏ qua", "thôi"]:
                session_ctx.pending_confirmation = None
                cancel_msg = "Đã hủy bỏ thao tác theo yêu cầu của bạn."
                async for ev in self._stream_text(cancel_msg, delay):
                    yield ev
                return
            # Anything else: drop the pending action so a later "ok" cannot run a stale delete.
            session_ctx.pending_confirmation = None

        # ── 0b. Pending layer choice for an item without a target layer ──────
        if session_ctx.pending_layer_choice:
            pending_item = session_ctx.pending_layer_choice
            topic_slug = session_ctx.pending_layer_topic
            options = session_ctx.pending_layer_options
            session_ctx.pending_layer_choice = None
            session_ctx.pending_layer_topic = None
            session_ctx.pending_layer_options = []
            m = re.match(r"^tạo layer\s+(.+)$", content, re.IGNORECASE)
            if lower in ["hủy", "huỷ", "cancel", "thôi", "bỏ qua"]:
                async for ev in self._stream_text("Đã hủy thêm bài học.", delay):
                    yield ev
                return

            # Pick one of the offered layers by number or by name.
            picked = None
            if options and lower.isdigit() and 1 <= int(lower) <= len(options):
                picked = options[int(lower) - 1]
            elif options and not m:
                named = [o for o in options if lower in (o["title"].lower(), o["shortTag"].lower(), o["id"].lower())]
                picked = named[0] if len(named) == 1 else None
            if picked:
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                    return
                pending_item.target_parent_identifier = picked["id"]
                session_store.set_active_layer(session_id, layer_id=picked["id"], title=picked["title"])
                tool_name = f"{pending_item.action.value}_{pending_item.entity_level.value}"
                yield {"type": "tool_start", "name": tool_name, "args": {"parent": picked["id"]}}
                ok, item_msg = await self.executor.aexecute(pending_item, session_id=session_id)
                yield {"type": "tool_end", "name": tool_name, "result": item_msg, "is_error": not ok}
                async for ev in self._stream_text(item_msg, delay):
                    yield ev
                return
            if m and not is_owner():
                async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                    yield ev
                return
            if m:
                name = m.group(1).strip()
                is_default = name.lower() in ["mặc định", "default"]
                layer_title = "General" if is_default else name
                layer_action = StructuredRoadmapAction(
                    action=ActionType.CREATE,
                    entity_level=EntityLevel.LAYER,
                    target_parent_identifier=topic_slug,
                    entities=[SingleEntity(title=layer_title, short_tag="01-GEN" if is_default else None)],
                )
                yield {"type": "tool_start", "name": "create_layer", "args": {"topic": topic_slug, "title": layer_title}}
                ok, layer_msg = await self.executor.aexecute(layer_action, session_id=session_id)
                yield {"type": "tool_end", "name": "create_layer", "result": layer_msg, "is_error": not ok}
                if not ok:
                    async for ev in self._stream_text(layer_msg, delay):
                        yield ev
                    return
                pending_item.target_parent_identifier = session_store.get_or_create(session_id).active_layer_id
                yield {"type": "tool_start", "name": "create_item", "args": {"parent": pending_item.target_parent_identifier}}
                ok, item_msg = await self.executor.aexecute(pending_item, session_id=session_id)
                yield {"type": "tool_end", "name": "create_item", "result": item_msg, "is_error": not ok}
                async for ev in self._stream_text(f"{layer_msg}\n\n{item_msg}", delay):
                    yield ev
                return
            # Anything else: drop the pending choice and handle as a fresh message.

        # ── 0c. Sensitive guard: secrets, system prompt, prompt injection ─────
        if is_sensitive_request(content):
            if (trace := current_trace()) is not None:
                trace.flags["guard"] = "sensitive"
            async for ev in self._stream_text(SENSITIVE_REPLY, delay):
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
            if not is_owner():
                async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                    yield ev
                return
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
            if not is_owner():
                async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                    yield ev
                return
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

        # ── 2c. Several requests in one message: ask for one at a time ────────
        if self.router.has_mixed_intents(content):
            if (trace := current_trace()) is not None:
                trace.flags["guard"] = "mixed_intents"
            async for ev in self._stream_text(MIXED_INTENT_REPLY, delay):
                yield ev
            return

        # ── 3. Classify Intent via IntentRouter ───────────────────────────────
        yield step_event("route", "routing", "running")
        router_step = start_step("intent-router", input={"message": content})
        intent_res: IntentClassificationResult
        intent_res, method = await self.router.aroute(content)
        end_step(router_step, output=intent_res.model_dump(mode="json"), metadata={"method": method})
        yield step_event(
            "route",
            "routing",
            "done",
            intent=intent_res.intent.value,
            confidence=round(intent_res.confidence, 2),
            method=method,
        )
        if (trace := current_trace()) is not None:
            trace.flags["intent"] = intent_res.intent.value

        # ── 3b. Scope guardrail: refuse requests unrelated to roadmaps ────────
        if intent_res.intent == IntentType.OUT_OF_SCOPE:
            async for ev in self._stream_text(out_of_scope_reply(is_owner()), delay):
                yield ev
            return

        # ── 4. ROADMAP CUD OPERATIONS ─────────────────────────────────────────
        if intent_res.intent == IntentType.ROADMAP_CUD or intent_res.needs_cud_extraction:
            # Visitors may read roadmaps but never change them (writes use ADMIN_API_KEY)
            if not is_owner():
                async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                    yield ev
                return
            # Page context is added only for the LLM extractor; heuristics keep the raw text.
            action: StructuredRoadmapAction = await self.extractor.aextract(
                content, page_context=build_grounding(page_context)
            )
            resolved_action, note = AnaphoraResolver.resolve_action(action, session_id=session_id)

            if resolved_action.action == ActionType.DELETE and BULK_DELETE.search(lower):
                async for ev in self._stream_text(BULK_DELETE_REPLY, delay):
                    yield ev
                return

            # Layer actions need a known topic: ask back with the topic list instead of guessing.
            if resolved_action.entity_level == EntityLevel.LAYER:
                topic_ref = resolved_action.target_parent_identifier
                if topic_ref in ANAPHORA_TARGETS or not topic_ref or not await self._topic_known(topic_ref):
                    async for ev in self._ask_topic_choice(resolved_action, topic_ref, delay):
                        yield ev
                    return

                # Resolve the layer inside that topic before showing the preview; the id goes into target.
                if resolved_action.action == ActionType.DELETE:
                    if resolved_action.is_batch:
                        async for ev in self._stream_text(BATCH_LAYER_DELETE_REPLY, delay):
                            yield ev
                        return
                    layer_name = resolved_action.entities[0].title if resolved_action.entities else ""
                    layer_res = await resolve_layer(layer_name, topic_slug=topic_ref)
                    if layer_res.status != "found" or layer_res.topic_slug != topic_ref:
                        in_topic = [c for c in layer_res.candidates if c["topic_slug"] == topic_ref][:10]
                        listing = "\n".join(f"- `{c['shortTag'] or c['id']}` — {c['title']}" for c in in_topic)
                        ask = f"Không tìm thấy layer `{layer_name}` trong topic `{topic_ref}`."
                        if listing:
                            ask += f"\n\n**Các layer trong topic này:**\n{listing}\n\nHãy gửi lại kèm tên hoặc shortTag chính xác."
                        async for ev in self._stream_text(ask, delay):
                            yield ev
                        return
                    resolved_action.target_parent_identifier = layer_res.layer_id

            # Dry-run confirmation for DELETE operations unless 'ngay'/'immediately' is specified;
            # deleting several entities is always confirmed.
            if resolved_action.action == ActionType.DELETE and (
                resolved_action.is_batch or not any(w in lower for w in ["ngay", "immediately", "luôn"])
            ):
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

            is_item_create = (
                resolved_action.entity_level == EntityLevel.ITEM
                and resolved_action.action == ActionType.CREATE
            )
            topic_slug = (page_context or {}).get("roadmapSlug") or session_ctx.active_topic_slug

            # Item create without a layer: offer to create a default or named layer.
            if is_item_create and not resolved_action.target_parent_identifier and topic_slug:
                async for ev in self._ask_layer_choice(session_ctx, resolved_action, topic_slug, delay):
                    yield ev
                return

            # Check the target exists before writing; ask back instead of guessing.
            target = resolved_action.target_parent_identifier
            if resolved_action.action == ActionType.CREATE and target:
                if resolved_action.entity_level in (EntityLevel.ITEM, EntityLevel.GROUP):
                    layer_res = await resolve_layer(target, topic_slug=topic_slug)
                    if layer_res.status == "found":
                        resolved_action.target_parent_identifier = layer_res.layer_id
                        session_store.set_active_layer(
                            session_id, layer_id=layer_res.layer_id, title=layer_res.layer_title or ""
                        )
                    elif layer_res.status != "unavailable":
                        async for ev in self._ask_target_choice(
                            session_ctx, resolved_action, target, layer_res, topic_slug, delay
                        ):
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

            remembered_layer = session_ctx.active_layer_id
            ok, result_msg = await self.executor.aexecute(resolved_action, session_id=session_id)
            yield {"type": "tool_end", "name": tool_name, "result": result_msg, "is_error": not ok}

            # The remembered layer may have been deleted since: forget it and ask again.
            if (
                not ok
                and is_item_create
                and topic_slug
                and remembered_layer
                and resolved_action.target_parent_identifier == remembered_layer
            ):
                session_ctx.active_layer_id = None
                session_ctx.active_layer_title = None
                resolved_action.target_parent_identifier = None
                async for ev in self._ask_layer_choice(session_ctx, resolved_action, topic_slug, delay):
                    yield ev
                return

            full_reply = result_msg
            if note:
                full_reply = f"> 💡 _{note}_\n\n" + full_reply

            async for ev in self._stream_text(full_reply, delay):
                yield ev
            return

        # ── 5. KNOWLEDGE QUERY (REAL LIVE RAG SEARCH) ─────────────────────────
        if intent_res.intent == IntentType.KNOWLEDGE_QUERY:
            yield {"type": "tool_start", "name": "search_live_knowledge", "args": {"query": content}}
            yield step_event("retrieve", "retrieval", "running")
            retrieval_step = start_step(
                "retrieve-live-knowledge",
                "retriever",
                input={"query": content, "limit": 4},
                metadata={"adapter_mode": settings.rag_adapter_mode, "scoring": "rrf(vector+keyword)"},
            )
            try:
                matches = await rag_engine.search_live_knowledge(content, limit=4)
            except Exception as exc:
                # Index/adapter failure is not "no match": say so instead of the no-result reply.
                print(f"[Agent] Retrieval error ({type(exc).__name__}: {exc}).")
                end_step(retrieval_step, level="ERROR", status_message=f"{type(exc).__name__}: {exc}")
                if (trace := current_trace()) is not None:
                    trace.flags["retrieval_error"] = True
                yield {"type": "tool_end", "name": "search_live_knowledge", "result": "Lỗi tra cứu", "is_error": True}
                yield step_event("retrieve", "retrieval", "error")
                async for ev in self._stream_text(RETRIEVAL_ERROR_REPLY, delay):
                    yield ev
                return
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
            yield {"type": "tool_end", "name": "search_live_knowledge", "result": f"Tìm thấy {len(matches)} tài liệu", "is_error": False}
            owner = is_owner()
            yield step_event(
                "retrieve",
                "retrieval",
                "done",
                count=len(matches),
                detail=f"{len(matches)} tài liệu",
                items=[
                    {
                        "title": doc.title,
                        "type": doc.doc_type,
                        "topic": doc.topic_slug,
                        "href": f"/?topic={doc.topic_slug}",
                        **({"score": round(score, 4)} if owner else {}),
                    }
                    for doc, score in matches
                ],
            )

            if matches:
                rag_context = rag_engine.format_knowledge_context(matches)

                # Synthesize with LLM if available
                llm_failed = False
                if generation_pipeline.available(self.llm):
                    try:
                        req = GenerationRequest(
                            mode="rag", query=content, thread_id=session_id, sources=matches
                        )
                        async for ev in generation_pipeline.astream(self.llm, req):
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
                    fallback_reason=self._llm_fallback_reason(llm_failed),
                )
                async for ev in self._stream_text(rag_context, delay):
                    yield ev
                return
            else:
                resp = no_match_reply(owner)
                yield step_event("answer", "generation", "done", mode="no_match")
                async for ev in self._stream_text(resp, delay):
                    yield ev
                return

        # ── 6. CHITCHAT / GENERAL ASSISTANT ───────────────────────────────────
        llm_failed = False
        if generation_pipeline.available(self.llm):
            try:
                req = GenerationRequest(mode="chitchat", query=content, thread_id=session_id)
                async for ev in generation_pipeline.astream(self.llm, req):
                    yield ev
                return
            except GenerationFailed as exc:
                llm_failed = exc.reason

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
    api_key = settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        print("[Agent] LLM_PROVIDER=groq but GROQ_API_KEY is not set.")
        return None
    from langchain_groq import ChatGroq

    return ChatGroq(
        model=settings.llm_model,
        api_key=api_key,
        temperature=PROFILE.temperature,
        # Groq's free tier answers 429 when the per-minute limit is hit; retry with backoff.
        max_retries=2,
        timeout=25.0,
        streaming=True,
    )


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
