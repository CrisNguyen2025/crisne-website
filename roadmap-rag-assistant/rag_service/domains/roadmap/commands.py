"""Roadmap commands: create and delete topics and lessons through the agent (owner only), ADR-0009.

Mixed into NextGenRoadmapAgent. The agent decides that a message is a roadmap change; this module
carries it out: extraction, target checks, confirmation and the executor. A lesson belongs to a topic;
when the topic is not known the user is asked for it, never guessed.
"""

from __future__ import annotations

import re
from typing import AsyncGenerator, Optional

from rag_service.domains.roadmap.retrieval.relevance import fold

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.agent_actions import ANAPHORA_TARGETS
from rag_service.domains.roadmap.router.grounding import (
    ACTION_NOT_ASKED_REPLY,
    BLOCKED_CHANGE_REPLY,
    BULK_DELETE_REPLY,
    QUESTION_TITLE_REPLY,
    TARGET_MISSING_REPLY,
    UPDATE_NOT_SUPPORTED_REPLY,
    batch_entity_delete_reply,
    build_grounding,
    example_blocks,
    unresolved_entity_reply,
)
from rag_service.domains.roadmap.router.policy import LIST_TOPICS, WRITE_ALLOW, WRITE_CONFIRM
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, StructuredRoadmapAction
from rag_service.domains.roadmap.router.understanding import is_plain_listing, understand
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.domains.roadmap.router.write_gate import (
    ACTION_NOT_ASKED,
    BLOCKED_CHANGE,
    BULK_DELETE_REQUEST,
    QUESTION_AS_TITLE,
    TARGET_MISSING,
    WriteGate,
    gate_action,
)
from rag_service.execution.changes import ChangeSet
from rag_service.execution.dry_run import DryRunValidator
from rag_service.state import AnaphoraResolver, session_store
from rag_service.tools.item_tools import import_items_from_text, parse_item_list, rename_section
from rag_service.tools.topic_resolver import resolve_lesson, resolve_topic, topic_named_in_message
from rag_service.write_grant import write_granted


CONFIRM_WORDS = ("ok", "oke", "xác nhận", "đồng ý", "yes", "confirm", "tiến hành", "chắc chắn")
CANCEL_WORDS = ("hủy", "huỷ", "cancel", "không", "no", "bỏ qua", "thôi")

# A confirmation with no preview waiting: answered here, so the LLM never replies as if a change had run
NOTHING_PENDING_REPLY = (
    "Không có thao tác nào đang chờ xác nhận nên mình chưa thay đổi gì. "
    "Nếu bạn muốn thay đổi, hãy gửi lại lệnh, ví dụ:\n\n" + example_blocks("thêm bài … vào topic …", "xóa bài …")
)


_ADD_VERB = re.compile(r"^\s*(?:hay\s+|vui\s+long\s+)?(?:them|tao|nhap|bo\s+sung|add|create|import)\b")


def names_section(text: str, name: Optional[str]) -> bool:
    """True when `name` comes right after "mục" / "section" in the message ("… mục Tools")."""
    if not name:
        return False
    flat, wanted = fold(normalize_vietnamese(text).lower()), fold(normalize_vietnamese(name).lower()).strip()
    return re.search(rf"\b(?:muc|section)\s+{re.escape(wanted)}\b", flat) is not None


class RoadmapCommands:
    def bulk_import_applies(self, raw_content: str, lower: str, page_context) -> bool:
        """A pasted list of two or more lessons asked to be added: the same evidence as any other change.

        The first line must ask for it: an add verb with a roadmap object ("thêm các bài sau:"), or the verb
        alone ("thêm:"). A list by itself is not a request, and neither is "xóa:" over one.
        """
        titles = parse_item_list(raw_content)
        if len(titles) < 2:
            return False
        first = normalize_vietnamese(raw_content.strip().splitlines()[0])
        u = understand(first)
        # Only an add: the import creates lessons, so "xóa:" over a list must never reach it
        if not u.has_change_verb or _ADD_VERB.search(fold(first.lower())) is None:
            return False
        # A bare verb line ("thêm:") asks for it too; with no topic open, handle_bulk_import asks which topic
        # (2026-11-05, live: it went to the router and was answered as a missing topic)
        return u.has_object or len(first.split()) <= 2

    async def handle_pending(
        self, *, content: str, lower: str, session_id: str, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Finish a roadmap change that was waiting for confirmation (a previewed action)."""
        # A previewed section rename (sections.py): same words, its own pending field
        if rename := session_ctx.fresh_pending("pending_section_rename"):
            session_ctx.pending_section_rename = None
            if lower in CONFIRM_WORDS:
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                else:
                    args = {"topic": rename["topic"], "from_name": rename["from"], "to_name": rename["to"]}
                    yield {"type": "tool_start", "name": "rename_section", "args": {**args, "confirmed": True}}
                    try:
                        with write_granted("confirmed section rename"):
                            res_msg = await rename_section.coroutine(**args)
                        ok = res_msg.startswith("✅")
                    except Exception as exc:
                        ok, res_msg = False, f"❌ Lỗi khi đổi tên mục: {exc}"
                    yield {"type": "tool_end", "name": "rename_section", "result": res_msg, "is_error": not ok}
                    async for ev in self._stream_text(res_msg, delay):
                        yield ev
                outcome["handled"] = True
                return
            if lower in CANCEL_WORDS:
                async for ev in self._stream_text("Đã hủy bỏ thao tác theo yêu cầu của bạn.", delay):
                    yield ev
                outcome["handled"] = True
                return
            # Anything else drops the preview, like a pending create or delete below
            return
        # fresh_pending drops a preview older than PENDING_TTL_SECONDS: a late "ok" does not run it
        if session_ctx.fresh_pending("pending_confirmation"):
            if lower in CONFIRM_WORDS:
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
                ok, res_msg = await self._execute_change(
                    pending_act, session_id, session_ctx, changes, "confirmed preview"
                )
                yield {"type": "tool_end", "name": tool_name, "result": res_msg, "is_error": not ok}
                if changes:
                    yield changes.event()
                async for ev in self._stream_text(res_msg, delay):
                    yield ev
                outcome["handled"] = True
                return
            elif lower in CANCEL_WORDS:
                session_ctx.pending_confirmation = None
                cancel_msg = "Đã hủy bỏ thao tác theo yêu cầu của bạn."
                async for ev in self._stream_text(cancel_msg, delay):
                    yield ev
                outcome["handled"] = True
                return
            # Anything else: drop the pending action so a later "ok" cannot run a stale delete.
            session_ctx.pending_confirmation = None
        elif lower in CONFIRM_WORDS:
            # 2026-11-04, live: an "ok" after the preview was dropped went to chitchat, which answered
            # "Đã xóa bài học Reranking" from the history while nothing was deleted.
            async for ev in self._stream_text(NOTHING_PENDING_REPLY, delay):
                yield ev
            outcome["handled"] = True

    async def handle_listing(
        self, *, content: str, lower: str, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """The topic list."""
        # Only a plain listing request: "danh sách topic có bài Docker không, thêm bài" is not one (router decides)
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
        """Import the pasted lessons into the open topic (owner only), or ask for the topic first."""
        titles = parse_item_list(raw_content)
        topic_in_view = (page_context or {}).get("roadmapSlug")
        if not topic_in_view:
            ask = (
                f"Tôi thấy {len(titles)} dòng bài nhưng chưa biết thêm vào topic nào. "
                "Hãy mở topic đích trên trang rồi gửi lại danh sách, hoặc nói rõ tên topic."
            )
            async for ev in self._stream_text(ask, delay):
                yield ev
            return
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        tool_args = {"topic": topic_in_view, "section": "", "text": raw_content}
        yield {"type": "tool_start", "name": "import_items_from_text", "args": tool_args}
        changes = ChangeSet("create", "item", topic_in_view)
        with write_granted("bulk import asked on its first line"):
            res = await import_items_from_text.coroutine(**tool_args, changes=changes)
        yield {"type": "tool_end", "name": "import_items_from_text", "result": res}
        if changes:
            yield changes.event()
        async for ev in self._stream_text(res, delay):
            yield ev

    async def _execute_change(
        self, action: StructuredRoadmapAction, session_id: str, session_ctx, changes: ChangeSet, reason: str
    ) -> tuple[bool, str]:
        """Run the change under a write grant."""
        with write_granted(reason):
            return await self.executor.aexecute(action, session_id=session_id, changes=changes)

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
        verdict=None,
    ) -> AsyncGenerator[dict, None]:
        """Roadmap create/delete: extract the action, ask back when a target is unclear, then confirm or run it.

        `gate` is the route-level write decision (write_gate.gate_route); gate_action refines it for the extracted change.
        """
        # Visitors may read roadmaps but never change them (writes use ADMIN_API_KEY)
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        # System 2 already read the change (router/verifier.py): reuse it, no second extraction call.
        verified = getattr(verdict, "change", None) if verdict is not None and verdict.is_roadmap_change else None
        if verified is not None and verified.entities:
            action: StructuredRoadmapAction = self.extractor.from_verified(verified, text=content)
        else:
            action = await self.extractor.aextract(content, page_context=build_grounding(page_context))
        resolved_action, note = AnaphoraResolver.resolve_action(action, session_id=session_id)

        # One write decision for this change (write_gate.py): denied changes stop here with the reason as reply
        gate = gate_action(gate, resolved_action, content, lower)
        if gate.denied:
            reply = {
                QUESTION_AS_TITLE: QUESTION_TITLE_REPLY,
                BULK_DELETE_REQUEST: BULK_DELETE_REPLY,
                BLOCKED_CHANGE: BLOCKED_CHANGE_REPLY,
                ACTION_NOT_ASKED: ACTION_NOT_ASKED_REPLY,
                TARGET_MISSING: TARGET_MISSING_REPLY,
            }[gate.reason]
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        # The executor runs create and delete only: a change it cannot run is answered, never previewed
        if resolved_action.action == ActionType.UPDATE:
            async for ev in self._stream_text(UPDATE_NOT_SUPPORTED_REPLY, delay):
                yield ev
            return

        # A lesson to delete is named, but the API takes its id: resolve it before the preview names it
        if resolved_action.action == ActionType.DELETE and resolved_action.entity_level == EntityLevel.ITEM:
            if resolved_action.is_batch or len(resolved_action.entities) != 1:
                async for ev in self._stream_text(batch_entity_delete_reply("bài học"), delay):
                    yield ev
                return
            name = resolved_action.entities[0].title
            found = await resolve_lesson(name, topic_slug=(page_context or {}).get("roadmapSlug"))
            if found.status != "found":
                async for ev in self._stream_text(unresolved_entity_reply("bài học", name, found.candidates), delay):
                    yield ev
                return
            resolved_action.target_parent_identifier = found.lesson_id
            resolved_action.entities[0].title = found.title
            note = None  # the topic the anaphora resolver filled in is not where the delete goes

        # A topic delete names the topic: resolve it so the preview names the right one
        if resolved_action.action == ActionType.DELETE and resolved_action.entity_level == EntityLevel.TOPIC:
            ref = resolved_action.target_parent_identifier or (
                resolved_action.entities[0].title if resolved_action.entities else ""
            )
            found_topic = await resolve_topic(ref)
            if found_topic.status == "found" and found_topic.slug:
                resolved_action.target_parent_identifier = found_topic.slug

        # A delete to confirm is previewed once its target is resolved (the preview names it)
        if resolved_action.action == ActionType.DELETE and gate.mode == WRITE_CONFIRM:
            async for ev in self._ask_confirmation(resolved_action, note, session_id, session_ctx, delay):
                yield ev
            return

        # A lesson needs a topic: the one named in the message, the open page, or the session's; else ask.
        is_item_create = resolved_action.entity_level == EntityLevel.ITEM and resolved_action.action == ActionType.CREATE
        if is_item_create:
            topic_ref = resolved_action.target_parent_identifier
            if not topic_ref or topic_ref in ANAPHORA_TARGETS:
                topic_ref = (
                    await topic_named_in_message(content)
                    or (page_context or {}).get("roadmapSlug")
                    or session_ctx.active_topic_slug
                )
            # The extracted topic is often its title ("QA Sandbox") and the API takes the slug: resolve it.
            # A name that matches no topic, or several, is asked back; an unavailable list leaves it to the check below.
            found_topic = await resolve_topic(topic_ref) if topic_ref else None
            # "thêm bài X mục Tools": the extractor may take the section for the topic. A name that is no topic
            # and follows "mục" in the message is the section; the topic then comes from the message, page or session.
            if found_topic is not None and found_topic.status == "not_found" and names_section(content, topic_ref):
                for ent in resolved_action.entities:
                    ent.section = ent.section or topic_ref
                topic_ref = (
                    await topic_named_in_message(content)
                    or (page_context or {}).get("roadmapSlug")
                    or session_ctx.active_topic_slug
                )
                found_topic = await resolve_topic(topic_ref) if topic_ref else None
                if found_topic is None:
                    async for ev in self._ask_topic_choice(resolved_action, None, delay):
                        yield ev
                    return
            if found_topic is not None and found_topic.status == "found" and found_topic.slug:
                topic_ref = found_topic.slug
            elif found_topic is not None and found_topic.status in ("not_found", "ambiguous"):
                async for ev in self._ask_topic_choice(resolved_action, topic_ref, delay):
                    yield ev
                return
            if not topic_ref or not await self._topic_known(topic_ref):
                async for ev in self._ask_topic_choice(resolved_action, topic_ref, delay):
                    yield ev
                return
            resolved_action.target_parent_identifier = topic_ref

        # Asked politely or on a condition ("có thể thêm ... không", "chưa thì thêm vào"): show it, run on "ok"
        if gate.mode == WRITE_CONFIRM:
            async for ev in self._ask_confirmation(resolved_action, note, session_id, session_ctx, delay):
                yield ev
            return

        if resolved_action.is_batch and resolved_action.entity_level == EntityLevel.ITEM:
            tool_name = f"{resolved_action.action.value}_items_batch"
        else:
            tool_name = f"{resolved_action.action.value}_{resolved_action.entity_level.value}"

        tool_args = {
            "entity_level": resolved_action.entity_level.value,
            "action": resolved_action.action.value,
            "parent": resolved_action.target_parent_identifier,
            "entities": [e.model_dump() for e in resolved_action.entities],
        }
        yield {"type": "tool_start", "name": tool_name, "args": tool_args}

        changes = ChangeSet.of(resolved_action)
        ok, result_msg = await self._execute_change(
            resolved_action, session_id, session_ctx, changes, "write gate allow"
        )
        yield {"type": "tool_end", "name": tool_name, "result": result_msg, "is_error": not ok}
        if changes:
            yield changes.event()

        full_reply = result_msg
        if note:
            full_reply = f"> 💡 _{note}_\n\n" + full_reply

        async for ev in self._stream_text(full_reply, delay):
            yield ev
        return
