"""Roadmap commands: create and delete topics and lessons through the agent (owner only), ADR-0009.

Mixed into NextGenRoadmapAgent. The agent decides that a message is a roadmap change; this module
carries it out: extraction, target checks, confirmation and the executor. A lesson belongs to a topic;
when the topic is not known the user is asked for it, never guessed.
"""

from __future__ import annotations

import asyncio
import re
from typing import AsyncGenerator, Optional

from rag_service.adapters.errors import DuplicateEntityError, normalize_title
from rag_service.domains.roadmap.retrieval.engine import rag_engine
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
    POINTING_WORDS,
    WriteGate,
    gate_action,
)
from rag_service.domains.roadmap.sections import GENERAL_SECTION
from rag_service.execution.changes import ChangeSet, snapshot_before_delete
from rag_service.execution.dry_run import DryRunValidator
from rag_service.state import AnaphoraResolver, session_store
from rag_service.tools import get_adapter
from rag_service.tools.item_tools import import_items_from_text, parse_item_list, rename_section, update_item_content
from rag_service.tools.topic_resolver import (
    describe_unresolved_topic,
    resolve_lesson,
    resolve_topic,
    topic_named_in_message,
)
from rag_service.write_grant import write_granted


CONFIRM_WORDS = ("ok", "oke", "xác nhận", "đồng ý", "yes", "confirm", "tiến hành", "chắc chắn")
CANCEL_WORDS = ("hủy", "huỷ", "cancel", "không", "no", "bỏ qua", "thôi")

# A confirmation with no preview waiting: answered here, so the LLM never replies as if a change had run
# Titles the Owner edited on a Preview that cannot be applied (see _with_edited_titles)
EDITED_TITLES_REJECTED_REPLY = (
    "Mình chưa áp dụng được tên bạn vừa sửa (tên trống, không hợp lệ, hoặc số lượng không khớp với thao tác đang chờ). "
    "Thao tác vẫn đang chờ: sửa lại tên rồi bấm xác nhận, hoặc bấm hủy."
)

EDITED_TARGET_REJECTED_REPLY = (
    "Mình chưa áp dụng được Topic đích bạn vừa sửa (tên trống hoặc không hợp lệ). "
    "Thao tác vẫn đang chờ: sửa lại Topic đích rồi bấm xác nhận, hoặc bấm hủy."
)

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

    def _with_edited_titles(
        self, action: StructuredRoadmapAction, titles: list[str]
    ) -> Optional[StructuredRoadmapAction]:
        """The pending create with the Owner's edited titles; None when they cannot be applied.

        Only titles change: action, level and parent stay as previewed, so an edit cannot turn a create into a delete.
        """
        if action.action != ActionType.CREATE or len(titles) != len(action.entities):
            return None
        edited = action.model_copy(deep=True)
        for ent, raw in zip(edited.entities, titles):
            title = self.extractor.clean_title(raw)
            if not title or title.lower() in POINTING_WORDS:
                return None
            ent.title = title
        return edited

    async def _with_edited_target(
        self, action: StructuredRoadmapAction, target: dict
    ) -> tuple[Optional[StructuredRoadmapAction], Optional[str]]:
        """Apply edited topic/section target onto a pending create item action."""
        if action.action != ActionType.CREATE or action.entity_level != EntityLevel.ITEM:
            return None, EDITED_TITLES_REJECTED_REPLY
        edited = action.model_copy(deep=True)
        if "topic" in target:
            raw_topic = (target.get("topic") or "").strip()
            if not raw_topic or raw_topic.lower() in POINTING_WORDS:
                return None, EDITED_TARGET_REJECTED_REPLY
            found_topic = await resolve_topic(raw_topic)
            if found_topic.status == "unavailable":
                return (
                    None,
                    "⚠️ Hiện chưa kiểm tra được Topic đích. Thao tác vẫn đang chờ: thử lại hoặc bấm hủy.",
                )
            if found_topic.status != "found" or not found_topic.slug:
                return (
                    None,
                    describe_unresolved_topic(raw_topic, found_topic)
                    + " Thao tác vẫn đang chờ: sửa lại Topic đích rồi bấm xác nhận, hoặc bấm hủy.",
                )
            edited.target_parent_identifier = found_topic.slug
        if "section" in target:
            raw_sec = re.sub(r"\s+", " ", (target.get("section") or "")).strip().strip("\"'`“”‘’")
            next_sec = None if (not raw_sec or raw_sec.lower() == "chung") else raw_sec
            for ent in edited.entities:
                ent.section = next_sec
        return edited, None

    async def _reprompt_pending_preview(
        self,
        session_id: str,
        reply: str,
        delay: float,
        *,
        editable_titles: Optional[list[str]] = None,
        editable_target: Optional[dict] = None,
    ) -> AsyncGenerator[dict, None]:
        """Keep the preview interactive in the widget after rejecting invalid edited fields."""
        full_reply = reply
        if "Xác nhận thực hiện" not in full_reply:
            full_reply += '\n\n👉 Sửa lại rồi bấm **[✅ Xác nhận thực hiện]**, hoặc bấm **[❌ Hủy bỏ]** để hủy.'
        preview_event: dict = {
            "type": "action_preview",
            "action_id": session_id,
            "preview": full_reply,
        }
        if editable_titles:
            preview_event["editable_titles"] = editable_titles
        if editable_target:
            preview_event["editable_target"] = editable_target
        yield preview_event
        async for ev in self._stream_text(full_reply, delay):
            yield ev

    async def handle_pending(
        self, *, content: str, lower: str, session_id: str, session_ctx, delay: float, outcome: dict,
        titles: Optional[list[str]] = None,
        target: Optional[dict] = None,
    ) -> AsyncGenerator[dict, None]:
        """Finish a roadmap change that was waiting for confirmation (a previewed action)."""
        # A previewed Owner Memory create/archive (memory_commands.py, ADR-0015): "ok" applies it
        if mem_change := session_ctx.fresh_pending("pending_memory_change"):
            session_ctx.pending_memory_change = None
            if lower in CONFIRM_WORDS:
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                else:
                    from rag_service.core.memory import KIND_LABELS, owner_memory_store

                    op = mem_change.get("op")
                    tool_name = "save_owner_memory" if op == "create" else "archive_owner_memory"
                    yield {"type": "tool_start", "name": tool_name, "args": {"op": op, "confirmed": True}}
                    try:
                        if op == "create":
                            saved = await owner_memory_store.create(
                                kind=mem_change["kind"],
                                content=mem_change["content"],
                                scope=mem_change.get("scope_topic_slug"),
                                source="explicit",
                                status="active",
                            )
                            kind_label = KIND_LABELS.get(saved.kind, saved.kind)
                            scope = f" *(topic: `{saved.scope}`)*" if saved.scope else ""
                            res_msg = f"✅ Đã lưu vào Bộ nhớ Owner (**{kind_label}**{scope}): {saved.content}"
                            ok = True
                        else:
                            archived = await owner_memory_store.archive(mem_change["memory_id"])
                            if archived:
                                res_msg = f"🗑️ Đã gỡ khỏi Bộ nhớ Owner: {mem_change['content']}"
                                ok = True
                            else:
                                res_msg = "⚠️ Không tìm thấy mục bộ nhớ này (có thể đã được gỡ trước đó)."
                                ok = False
                    except Exception as exc:
                        ok, res_msg = False, f"❌ Lỗi khi cập nhật Bộ nhớ Owner: {exc}"
                    yield {"type": "tool_end", "name": tool_name, "result": res_msg, "is_error": not ok}
                    async for ev in self._stream_text(res_msg, delay):
                        yield ev
                outcome["handled"] = True
                return
            if lower in CANCEL_WORDS:
                async for ev in self._stream_text("Đã hủy bỏ thao tác bộ nhớ theo yêu cầu của bạn.", delay):
                    yield ev
                outcome["handled"] = True
                return
            # Anything else drops the preview
            return
        # A previewed lesson body (lesson_content.py): "ok" adds it to the end of the lesson
        if draft := session_ctx.fresh_pending("pending_content_draft"):
            session_ctx.pending_content_draft = None
            if lower in CONFIRM_WORDS:
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                else:
                    args = {
                        "topic": draft["topic"],
                        "item_id": draft["item_id"],
                        "html": draft["html"],
                        "write_mode": draft.get("write_mode", "append"),
                        "target_h2": draft.get("target_h2"),
                    }
                    yield {"type": "tool_start", "name": "update_item_content",
                           "args": {"topic": draft["topic"], "item_id": draft["item_id"], "confirmed": True}}
                    try:
                        with write_granted("confirmed lesson content draft"):
                            res_msg = await update_item_content.coroutine(**args)
                        ok = res_msg.startswith("✅")
                        if ok:
                            session_store.set_active_lesson(
                                session_id,
                                draft["item_id"],
                                draft.get("title") or "",
                                topic_slug=draft.get("topic"),
                                topic_title=draft.get("topic_title"),
                            )
                    except Exception as exc:
                        ok, res_msg = False, f"❌ Lỗi khi ghi nội dung bài: {exc}"
                    yield {"type": "tool_end", "name": "update_item_content", "result": res_msg, "is_error": not ok}
                    async for ev in self._stream_text(res_msg, delay):
                        yield ev
                outcome["handled"] = True
                return
            if lower in CANCEL_WORDS:
                async for ev in self._stream_text("Đã bỏ bản nháp, bài học không thay đổi.", delay):
                    yield ev
                outcome["handled"] = True
                return
            # Anything else drops the draft
            return
        # A previewed section rename (sections.py): same words, its own pending field
        if rename := session_ctx.fresh_pending("pending_section_rename"):
            session_ctx.pending_section_rename = None
            if lower in CONFIRM_WORDS:
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                else:
                    if titles is not None:
                        if len(titles) != 1:
                            session_ctx.pending_section_rename = rename
                            async for ev in self._reprompt_pending_preview(
                                session_id,
                                EDITED_TITLES_REJECTED_REPLY,
                                delay,
                                editable_titles=[rename.get("merge") or rename["to"]],
                            ):
                                yield ev
                            outcome["handled"] = True
                            return
                        cleaned_name = re.sub(r"\s+", " ", (titles[0] or "")).strip().strip("\"'`“”‘’")
                        if not cleaned_name or cleaned_name.lower() in POINTING_WORDS:
                            session_ctx.pending_section_rename = rename
                            async for ev in self._reprompt_pending_preview(
                                session_id,
                                EDITED_TITLES_REJECTED_REPLY,
                                delay,
                                editable_titles=[rename.get("merge") or rename["to"]],
                            ):
                                yield ev
                            outcome["handled"] = True
                            return
                        rename["to"] = cleaned_name
                    args = {"topic": rename["topic"], "from_name": rename["from"], "to_name": rename["to"]}
                    yield {"type": "tool_start", "name": "rename_section", "args": {**args, "confirmed": True}}
                    try:
                        with write_granted("confirmed section rename"):
                            res_msg = await rename_section.coroutine(**args)
                        ok = res_msg.startswith("✅")
                        if ok and rename.get("topic"):
                            session_store.set_active_topic(session_id, rename["topic"], rename.get("title") or "")
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
        # A previewed lesson title/section edit (lesson_edit.py): "ok" applies it via adapter.update_item
        if edit := session_ctx.fresh_pending("pending_lesson_edit"):
            session_ctx.pending_lesson_edit = None
            if lower in CONFIRM_WORDS:
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                else:
                    if titles is not None:
                        if len(titles) != 1:
                            session_ctx.pending_lesson_edit = edit
                            async for ev in self._reprompt_pending_preview(
                                session_id,
                                EDITED_TITLES_REJECTED_REPLY,
                                delay,
                                editable_titles=[edit["new_title"]],
                                editable_target={"section": edit.get("new_section") or ""},
                            ):
                                yield ev
                            outcome["handled"] = True
                            return
                        cleaned_title = self.extractor.clean_title(titles[0])
                        if not cleaned_title or cleaned_title.lower() in POINTING_WORDS:
                            session_ctx.pending_lesson_edit = edit
                            async for ev in self._reprompt_pending_preview(
                                session_id,
                                EDITED_TITLES_REJECTED_REPLY,
                                delay,
                                editable_titles=[edit["new_title"]],
                                editable_target={"section": edit.get("new_section") or ""},
                            ):
                                yield ev
                            outcome["handled"] = True
                            return
                        edit["new_title"] = cleaned_title
                    if target is not None and "section" in target:
                        raw_sec = re.sub(r"\s+", " ", (target.get("section") or "")).strip().strip("\"'`“”‘’")
                        edit["new_section"] = None if (not raw_sec or raw_sec.lower() == "chung") else raw_sec

                    old_title = edit["old_title"]
                    old_section = edit.get("old_section")
                    new_title = edit["new_title"]
                    new_section = edit.get("new_section")

                    update_kwargs: dict = {}
                    if new_title != old_title:
                        update_kwargs["title"] = new_title
                    if (new_section or None) != (old_section or None) or (
                        new_section is not None and old_section is not None and new_section != old_section
                    ):
                        update_kwargs["section"] = new_section

                    if not update_kwargs:
                        async for ev in self._stream_text(
                            f"Bài **{old_title}** đã có đúng tên và mục này rồi nên mình chưa đổi gì.", delay
                        ):
                            yield ev
                        outcome["handled"] = True
                        return

                    item_id = edit["item_id"]
                    yield {
                        "type": "tool_start",
                        "name": "update_item",
                        "args": {"item_id": item_id, **update_kwargs, "confirmed": True},
                    }
                    try:
                        with write_granted("confirmed lesson edit"):
                            res = await get_adapter().update_item(item_id, **update_kwargs)
                        asyncio.create_task(rag_engine.sync_live_database())
                        final_title = (res.get("title") if isinstance(res, dict) else None) or new_title
                        final_sec = (
                            res.get("section") if isinstance(res, dict) and "section" in res else new_section
                        ) or GENERAL_SECTION
                        if "title" in update_kwargs and "section" in update_kwargs:
                            res_msg = f"✅ Đã cập nhật bài **{old_title}** → **{final_title}** (mục `{final_sec}`)."
                        elif "title" in update_kwargs:
                            res_msg = f"✅ Đã đổi tên bài **{old_title}** → **{final_title}**."
                        else:
                            res_msg = f"✅ Đã chuyển bài **{final_title}** sang mục `{final_sec}`."
                        ok = True
                        session_store.set_active_lesson(
                            session_id,
                            item_id,
                            final_title,
                            section=new_section if "section" in update_kwargs else None,
                            topic_slug=edit.get("topic"),
                            topic_title=edit.get("topic_title"),
                        )
                    except DuplicateEntityError as dup:
                        ok, res_msg = False, f"ℹ️ Topic đã có bài **{dup.title}**, không đổi tên."
                    except Exception as exc:
                        ok, res_msg = False, f"❌ Lỗi khi cập nhật bài học: {exc}"
                    yield {"type": "tool_end", "name": "update_item", "result": res_msg, "is_error": not ok}
                    async for ev in self._stream_text(res_msg, delay):
                        yield ev
                outcome["handled"] = True
                return
            if lower in CANCEL_WORDS:
                async for ev in self._stream_text("Đã hủy bỏ thao tác theo yêu cầu của bạn.", delay):
                    yield ev
                outcome["handled"] = True
                return
            # Anything else drops the preview
            return
        # A previewed lesson status change (lesson_status.py): "ok" applies it via adapter.update_item
        if status_change := session_ctx.fresh_pending("pending_status_change"):
            session_ctx.pending_status_change = None
            if lower in CONFIRM_WORDS:
                if not is_owner():
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                else:
                    item_id = status_change["item_id"]
                    item_title = status_change["item_title"]
                    new_status = status_change["new_status"]
                    yield {
                        "type": "tool_start",
                        "name": "update_item",
                        "args": {"item_id": item_id, "status": new_status, "confirmed": True},
                    }
                    try:
                        from rag_service.domains.roadmap.lesson_status import LESSON_STATUS_LABEL

                        with write_granted("confirmed lesson status change"):
                            res = await get_adapter().update_item(item_id, status=new_status)
                        label = LESSON_STATUS_LABEL.get(new_status, new_status)
                        title = res.get("title", item_title) if isinstance(res, dict) else item_title
                        res_msg = f"✅ Đã đổi trạng thái bài '{title}' sang **{label}**."
                        ok = True
                        session_store.set_active_lesson(
                            session_id,
                            item_id,
                            title,
                            topic_slug=status_change.get("topic_slug"),
                        )
                    except Exception as exc:
                        ok, res_msg = False, f"❌ Lỗi khi đổi trạng thái bài: {exc}"
                    yield {"type": "tool_end", "name": "update_item", "result": res_msg, "is_error": not ok}
                    async for ev in self._stream_text(res_msg, delay):
                        yield ev
                outcome["handled"] = True
                return
            if lower in CANCEL_WORDS:
                async for ev in self._stream_text("Đã hủy bỏ thao tác đổi trạng thái theo yêu cầu của bạn.", delay):
                    yield ev
                outcome["handled"] = True
                return
            # Anything else drops the preview, like other pending actions
            return
        # fresh_pending drops a preview older than PENDING_TTL_SECONDS: a late "ok" does not run it
        if session_ctx.fresh_pending("pending_confirmation"):
            if lower in CONFIRM_WORDS:
                pending_act = session_ctx.pending_confirmation
                if not is_owner():
                    session_ctx.pending_confirmation = None
                    async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                        yield ev
                    outcome["handled"] = True
                    return
                if titles is not None:
                    edited = self._with_edited_titles(pending_act, titles)
                    if edited is None:
                        # The preview stays pending: re-emit the preview so the Owner can fix the inputs and confirm again
                        retry_titles = (
                            [ent.title for ent in pending_act.entities]
                            if pending_act.action == ActionType.CREATE
                            else None
                        )
                        retry_target = (
                            {
                                "topic": pending_act.target_parent_identifier or "",
                                "section": (pending_act.entities[0].section if pending_act.entities else None) or "",
                            }
                            if pending_act.action == ActionType.CREATE and pending_act.entity_level == EntityLevel.ITEM
                            else None
                        )
                        async for ev in self._reprompt_pending_preview(
                            session_id,
                            EDITED_TITLES_REJECTED_REPLY,
                            delay,
                            editable_titles=retry_titles,
                            editable_target=retry_target,
                        ):
                            yield ev
                        outcome["handled"] = True
                        return
                    pending_act = edited
                if target is not None:
                    edited_act, err_msg = await self._with_edited_target(pending_act, target)
                    if err_msg is not None or edited_act is None:
                        retry_titles = (
                            [ent.title for ent in pending_act.entities]
                            if pending_act.action == ActionType.CREATE
                            else None
                        )
                        retry_target = (
                            {
                                "topic": pending_act.target_parent_identifier or "",
                                "section": (pending_act.entities[0].section if pending_act.entities else None) or "",
                            }
                            if pending_act.action == ActionType.CREATE and pending_act.entity_level == EntityLevel.ITEM
                            else None
                        )
                        async for ev in self._reprompt_pending_preview(
                            session_id,
                            err_msg or EDITED_TARGET_REJECTED_REPLY,
                            delay,
                            editable_titles=retry_titles,
                            editable_target=retry_target,
                        ):
                            yield ev
                        outcome["handled"] = True
                        return
                    pending_act = edited_act
                session_ctx.pending_confirmation = None
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
        self, action: StructuredRoadmapAction, note, session_id: str, session_ctx, delay: float,
        snapshot: Optional[dict] = None,
    ) -> AsyncGenerator[dict, None]:
        """Preview card for an action that runs only after "ok"; handle_pending executes it."""
        session_ctx.pending_confirmation = action
        preview_text = DryRunValidator.format_preview_card(action, note=note, snapshot=snapshot)
        preview_text += "\n\n👉 Bấm nút **[✅ Xác nhận thực hiện]** bên dưới hoặc gõ \"ok\" để tiến hành. Bấm **[❌ Hủy bỏ]** để hủy."
        preview_event = {
            "type": "action_preview",
            "action_id": session_id,
            "preview": preview_text,
        }
        if action.action == ActionType.CREATE:
            # The Owner may correct the names and target the model read before confirming
            preview_event["editable_titles"] = [ent.title for ent in action.entities]
            if action.entity_level == EntityLevel.ITEM:
                preview_event["editable_target"] = {
                    "topic": action.target_parent_identifier or "",
                    "section": (action.entities[0].section if action.entities else None) or "",
                }
        yield preview_event
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
        resolved_action, note = AnaphoraResolver.resolve_action(
            action, session_id=session_id, page_context=page_context
        )

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
        item_snapshot = None
        if resolved_action.action == ActionType.DELETE and resolved_action.entity_level == EntityLevel.ITEM:
            if resolved_action.is_batch or len(resolved_action.entities) != 1:
                async for ev in self._stream_text(batch_entity_delete_reply("bài học"), delay):
                    yield ev
                return
            name = resolved_action.entities[0].title
            page_slug = (page_context or {}).get("roadmapSlug")
            found = await resolve_lesson(name, topic_slug=page_slug)
            if found.status != "found":
                async for ev in self._stream_text(unresolved_entity_reply("bài học", name, found.candidates), delay):
                    yield ev
                return
            resolved_action.target_parent_identifier = found.lesson_id
            resolved_action.entities[0].title = found.title
            note = None  # the topic the anaphora resolver filled in is not where the delete goes
            item_snapshot = await snapshot_before_delete(get_adapter(), "item", found.lesson_id, topic_slug=page_slug)
            if item_snapshot:
                resolved_action.entities[0].section = item_snapshot.get("section")

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
            async for ev in self._ask_confirmation(
                resolved_action, note, session_id, session_ctx, delay, snapshot=item_snapshot
            ):
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
                if note == "Chưa có topic nào được chọn. Vui lòng chỉ định rõ tên topic.":
                    note = None
                elif note and note.startswith("Tự động gắn vào topic:") and found_topic.title:
                    note = f"Tự động gắn vào topic: **{found_topic.title}**"
            elif found_topic is not None and found_topic.status in ("not_found", "ambiguous"):
                async for ev in self._ask_topic_choice(resolved_action, topic_ref, delay):
                    yield ev
                return
            if not topic_ref or not await self._topic_known(topic_ref):
                async for ev in self._ask_topic_choice(resolved_action, topic_ref, delay):
                    yield ev
                return
            resolved_action.target_parent_identifier = topic_ref

        # Every create and every polite/conditional change shows a preview card with editable inputs first
        if gate.mode == WRITE_CONFIRM or resolved_action.action == ActionType.CREATE:
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
