"""Roadmap commands: create, update and delete through the agent (owner only).

Mixed into NextGenRoadmapAgent. The agent decides that a message is a roadmap change; this module
carries it out: extraction, target checks, confirmation and the executor.
"""

from __future__ import annotations

import re
from typing import AsyncGenerator

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.agent_actions import ANAPHORA_TARGETS
from rag_service.execution.changes import ChangeSet
from rag_service.execution.dry_run import DryRunValidator
from rag_service.domains.roadmap.router.grounding import (
    BATCH_LAYER_DELETE_REPLY,
    BULK_DELETE_REPLY,
    QUESTION_TITLE_REPLY,
    build_grounding,
)
from rag_service.domains.roadmap.router.policy import LIST_TOPICS, WRITE_ALLOW, WRITE_CONFIRM
from rag_service.domains.roadmap.router.understanding import is_plain_listing
from rag_service.domains.roadmap.router.write_gate import (
    BULK_DELETE_REQUEST,
    QUESTION_AS_TITLE,
    WriteGate,
    gate_action,
)
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
from rag_service.state import AnaphoraResolver, session_store
from rag_service.tools.item_tools import import_items_from_text, parse_item_list
from rag_service.tools.rag_tools import generate_roadmap_from_template, preview_roadmap_plan
from rag_service.tools.layer_resolver import resolve_layer, topic_named_in_message


class RoadmapCommands:
    def bulk_import_applies(self, raw_content: str, lower: str, page_context) -> bool:
        """A pasted list of two or more items: imported when a layer is open, otherwise the user is asked which."""
        titles = parse_item_list(raw_content)
        layer_in_view = (page_context or {}).get("layerId")
        if layer_in_view and len(titles) >= 2:
            return True
        return not layer_in_view and len(titles) >= 2 and re.search(r"\bthêm\b|\badd\b", lower) is not None

    async def handle_pending(
        self, *, content: str, lower: str, session_id: str, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Finish a roadmap change that was waiting: confirm/cancel a previewed action, or pick a layer."""
        # ── 0. Pending Action Confirmation ────────────────────────────────────
        if session_ctx.pending_confirmation:
            if lower in ["ok", "oke", "xác nhận", "đồng ý", "yes", "confirm", "tiến hành", "chắc chắn"]:
                pending_act = session_ctx.pending_confirmation
                session_ctx.pending_confirmation = None
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                    outcome["handled"] = True
                    return
                tool_name = f"{pending_act.action.value}_{pending_act.entity_level.value}"
                yield {"type": "tool_start", "name": tool_name, "args": {"confirmed": True}}
                changes = ChangeSet.of(pending_act)
                ok, res_msg = await self.executor.aexecute(pending_act, session_id=session_id, changes=changes)
                yield {"type": "tool_end", "name": tool_name, "result": res_msg, "is_error": not ok}
                if changes:
                    yield changes.event()
                async for ev in self._stream_text(res_msg, delay):
                    yield ev
                outcome["handled"] = True
                return
            elif lower in ["hủy", "huỷ", "cancel", "không", "no", "bỏ qua", "thôi"]:
                session_ctx.pending_confirmation = None
                cancel_msg = "Đã hủy bỏ thao tác theo yêu cầu của bạn."
                async for ev in self._stream_text(cancel_msg, delay):
                    yield ev
                outcome["handled"] = True
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
                outcome["handled"] = True
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
                    outcome["handled"] = True
                    return
                pending_item.target_parent_identifier = picked["id"]
                session_store.set_active_layer(session_id, layer_id=picked["id"], title=picked["title"])
                tool_name = f"{pending_item.action.value}_{pending_item.entity_level.value}"
                yield {"type": "tool_start", "name": tool_name, "args": {"parent": picked["id"]}}
                changes = ChangeSet.of(pending_item)
                ok, item_msg = await self.executor.aexecute(pending_item, session_id=session_id, changes=changes)
                yield {"type": "tool_end", "name": tool_name, "result": item_msg, "is_error": not ok}
                if changes:
                    yield changes.event()
                async for ev in self._stream_text(item_msg, delay):
                    yield ev
                outcome["handled"] = True
                return
            if m and not is_owner():
                async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                    yield ev
                outcome["handled"] = True
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
                changes = ChangeSet.of(layer_action)
                ok, layer_msg = await self.executor.aexecute(layer_action, session_id=session_id, changes=changes)
                yield {"type": "tool_end", "name": "create_layer", "result": layer_msg, "is_error": not ok}
                if changes:
                    yield changes.event()
                if not ok:
                    async for ev in self._stream_text(layer_msg, delay):
                        yield ev
                    outcome["handled"] = True
                    return
                pending_item.target_parent_identifier = session_store.get_or_create(session_id).active_layer_id
                yield {"type": "tool_start", "name": "create_item", "args": {"parent": pending_item.target_parent_identifier}}
                changes = ChangeSet.of(pending_item)
                ok, item_msg = await self.executor.aexecute(pending_item, session_id=session_id, changes=changes)
                yield {"type": "tool_end", "name": "create_item", "result": item_msg, "is_error": not ok}
                if changes:
                    yield changes.event()
                async for ev in self._stream_text(f"{layer_msg}\n\n{item_msg}", delay):
                    yield ev
                outcome["handled"] = True
                return
            # Anything else: drop the pending choice and handle as a fresh message.

    async def handle_plan_and_listing(
        self, *, content: str, lower: str, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Roadmap plan preview (/plan), template generation (/goal) and the topic list."""
        # ── 1. Plan / Goal Mode ───────────────────────────────────────────────
        if "/plan" in lower or "lập kế hoạch" in lower or "xem trước" in lower:
            yield {"type": "tool_start", "name": "preview_roadmap_plan", "args": {"query_or_template_id": content}}
            res = await preview_roadmap_plan.ainvoke({"query_or_template_id": content})
            yield {"type": "tool_end", "name": "preview_roadmap_plan", "result": res}
            async for ev in self._stream_text(res, delay):
                yield ev
            outcome["handled"] = True
            return

        if "/goal" in lower or "sinh nhanh" in lower or ("template" in lower and ("tạo" in lower or "lộ trình" in lower)):
            if not is_owner():
                async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                    yield ev
                outcome["handled"] = True
                return
            m = re.search(r"template\s+([\w-]+)", lower)
            tid = m.group(1) if m else "ai-engineering"
            yield {"type": "tool_start", "name": "generate_roadmap_from_template", "args": {"template_id": tid}}
            changes = ChangeSet("create", "topic")
            res = await generate_roadmap_from_template.coroutine(template_id=tid, changes=changes)
            yield {"type": "tool_end", "name": "generate_roadmap_from_template", "result": res}
            if changes:
                yield changes.event()
            async for ev in self._stream_text(res, delay):
                yield ev
            outcome["handled"] = True
            return

        # ── 2. List Topics / Navigation ───────────────────────────────────────
        # Only a plain listing request: "danh sách topic có bài Docker không, tạo layer" is not one (router decides)
        if LIST_TOPICS.search(lower) and is_plain_listing(content):
            yield {"type": "tool_start", "name": "list_topics", "args": {}}
            res = await self.tools["list_topics"].ainvoke({})
            yield {"type": "tool_end", "name": "list_topics", "result": res}
            async for ev in self._stream_text(res, delay):
                yield ev
            outcome["handled"] = True
            return

    async def handle_bulk_import(
        self, *, raw_content: str, lower: str, page_context, delay: float
    ) -> AsyncGenerator[dict, None]:
        """Import the pasted items into the open layer (owner only), or ask for the layer first."""
        titles = parse_item_list(raw_content)
        layer_in_view = (page_context or {}).get("layerId")
        if not layer_in_view:
            ask = (
                f"Tôi thấy {len(titles)} dòng item nhưng chưa biết thêm vào layer nào. "
                "Hãy mở layer đích trên trang rồi gửi lại danh sách, hoặc nói rõ tên layer."
            )
            async for ev in self._stream_text(ask, delay):
                yield ev
            return
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        tool_args = {"layer_id": layer_in_view, "level": "core", "text": raw_content}
        yield {"type": "tool_start", "name": "import_items_from_text", "args": tool_args}
        changes = ChangeSet("create", "item", layer_in_view)
        res = await import_items_from_text.coroutine(**tool_args, changes=changes)
        yield {"type": "tool_end", "name": "import_items_from_text", "result": res}
        if changes:
            yield changes.event()
        async for ev in self._stream_text(res + "\n\n_Các item được thêm vào level `core`. Nói rõ level nếu muốn khác._", delay):
            yield ev

    async def _ask_confirmation(
        self, action: StructuredRoadmapAction, note, session_id: str, session_ctx, delay: float
    ) -> AsyncGenerator[dict, None]:
        """Preview card for an action that runs only after "ok"; handle_pending executes it."""
        session_ctx.pending_confirmation = action
        preview_text = DryRunValidator.format_preview_card(action, note=note)
        preview_text += "\n\n👉 Bấm nút **[✅ Xác nhận thực hiện]** bên dưới hoặc gõ \"ok\" để tiến hành. Bấm **[❌ Hủy bỏ]** để hủy."
        yield {
            "type": "action_preview",
            "action_id": session_id,
            "preview": preview_text,
        }
        async for ev in self._stream_text(preview_text, delay):
            yield ev

    async def handle_cud(
        self, *, content: str, lower: str, page_context, session_id: str, session_ctx, delay: float,
        gate: WriteGate = WriteGate(WRITE_ALLOW),
    ) -> AsyncGenerator[dict, None]:
        """Roadmap create/update/delete: extract the action, ask back when a target is unclear, then confirm or run it.

        `gate` is the route-level write decision (write_gate.gate_route); gate_action refines it for the extracted change.
        """
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

        # One write decision for this change (write_gate.py): denied changes stop here with the reason as reply
        gate = gate_action(gate, resolved_action, content, lower)
        if gate.denied:
            reply = {QUESTION_AS_TITLE: QUESTION_TITLE_REPLY, BULK_DELETE_REQUEST: BULK_DELETE_REPLY}[gate.reason]
            async for ev in self._stream_text(reply, delay):
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

        # A delete to confirm is previewed once its layer is resolved (the preview names it)
        if resolved_action.action == ActionType.DELETE and gate.mode == WRITE_CONFIRM:
            async for ev in self._ask_confirmation(resolved_action, note, session_id, session_ctx, delay):
                yield ev
            return

        is_item_create = (
            resolved_action.entity_level == EntityLevel.ITEM
            and resolved_action.action == ActionType.CREATE
        )
        # A topic named in the message ("… của topic Machine Learning") beats the open page and the session
        topic_slug = (
            await topic_named_in_message(content)
            or (page_context or {}).get("roadmapSlug")
            or session_ctx.active_topic_slug
        )

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
        # Asked politely or on a condition ("có thể thêm ... không", "chưa thì thêm vào"): show it, run on "ok"
        if gate.mode == WRITE_CONFIRM:
            async for ev in self._ask_confirmation(resolved_action, note, session_id, session_ctx, delay):
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
        changes = ChangeSet.of(resolved_action)
        ok, result_msg = await self.executor.aexecute(resolved_action, session_id=session_id, changes=changes)
        yield {"type": "tool_end", "name": tool_name, "result": result_msg, "is_error": not ok}
        if changes:
            yield changes.event()

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
