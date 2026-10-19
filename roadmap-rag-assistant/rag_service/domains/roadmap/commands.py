"""Roadmap commands: create, update and delete through the agent (owner only).

Mixed into NextGenRoadmapAgent. The agent decides that a message is a roadmap change; this module
carries it out: extraction, target checks, confirmation and the executor.
"""

from __future__ import annotations

from typing import AsyncGenerator

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.agent_actions import ANAPHORA_TARGETS
from rag_service.execution.dry_run import DryRunValidator
from rag_service.router.grounding import (
    BATCH_LAYER_DELETE_REPLY,
    BULK_DELETE,
    BULK_DELETE_REPLY,
    build_grounding,
)
from rag_service.router.schemas import ActionType, EntityLevel, StructuredRoadmapAction
from rag_service.state import AnaphoraResolver, session_store
from rag_service.tools.layer_resolver import resolve_layer, topic_named_in_message


class RoadmapCommands:
    async def handle_cud(
        self, *, content: str, lower: str, page_context, session_id: str, session_ctx, delay: float
    ) -> AsyncGenerator[dict, None]:
        """Roadmap create/update/delete: extract the action, ask back when a target is unclear, then confirm or run it."""
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
