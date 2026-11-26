"""Roadmap commands: create and delete topics and lessons through the agent (owner only), ADR-0009.

Mixed into NextGenRoadmapAgent. The agent decides that a message is a roadmap change; this module
carries it out: extraction, target checks, confirmation and the executor. A lesson belongs to a topic;
when the topic is not known the user is asked for it, never guessed.
"""

from __future__ import annotations

import re
from typing import Any, AsyncGenerator, Optional

from rag_service.adapters.errors import DuplicateEntityError
from rag_service.domains.roadmap.host import AgentHostMixin
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
    format_concept_promotion_preview,
    unresolved_entity_reply,
)
from rag_service.domains.roadmap.router.policy import LIST_TOPICS, WRITE_ALLOW, WRITE_CONFIRM
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
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
from rag_service.execution.executor import schedule_local_rag_sync
from rag_service.state import AnaphoraResolver, session_store
from rag_service.state.session_store import build_action_preview_event
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


class RoadmapCommands(AgentHostMixin):
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
        for ent, raw in zip(edited.entities, titles, strict=True):
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
        kind: str = "cud",
        editable_titles: Optional[list[str]] = None,
        editable_target: Optional[dict] = None,
    ) -> AsyncGenerator[dict, None]:
        """Keep the preview interactive in the widget after rejecting invalid edited fields."""
        full_reply = reply
        if "Xác nhận thực hiện" not in full_reply:
            full_reply += '\n\n👉 Sửa lại rồi bấm **[✅ Xác nhận thực hiện]**, hoặc bấm **[❌ Hủy bỏ]** để hủy.'
        yield build_action_preview_event(
            action_id=session_id,
            kind=kind,
            preview=full_reply,
            editable_titles=editable_titles,
            editable_target=editable_target,
        )
        async for ev in self._stream_text(full_reply, delay):
            yield ev

    async def _execute_memory_change(self, mem_change: dict) -> tuple[bool, str, Optional[ChangeSet]]:
        from rag_service.core.memory import KIND_LABELS, owner_memory_store

        op = mem_change.get("op")
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
                changes = ChangeSet("create", "memory", saved.scope)
                changes.created(saved.content, {"id": saved.id}, code=kind_label, level="memory")
                return True, f"✅ Đã lưu vào Bộ nhớ Owner (**{kind_label}**{scope}): {saved.content}", changes
            archived = await owner_memory_store.archive(mem_change["memory_id"])
            if not archived:
                return False, "⚠️ Không tìm thấy mục bộ nhớ này (có thể đã được gỡ trước đó).", None
            changes = ChangeSet("delete", "memory", mem_change.get("scope_topic_slug"))
            changes.deleted(
                mem_change["content"],
                {"id": mem_change["memory_id"], "title": mem_change["content"]},
            )
            return True, f"🗑️ Đã gỡ khỏi Bộ nhớ Owner: {mem_change['content']}", changes
        except Exception as exc:
            return False, f"❌ Lỗi khi cập nhật Bộ nhớ Owner: {exc}", None

    async def _handle_pending_memory(
        self, mem_change: dict, lower: str, delay: float
    ) -> AsyncGenerator[dict, None]:
        proceed, guard_msg = self._pending_confirm_guard(
            lower, "Đã hủy bỏ thao tác bộ nhớ theo yêu cầu của bạn."
        )
        if not proceed:
            if guard_msg is not None:
                async for ev in self._stream_text(guard_msg, delay):
                    yield ev
            return

        op = mem_change.get("op")
        tool_name = "save_owner_memory" if op == "create" else "archive_owner_memory"
        yield {"type": "tool_start", "name": tool_name, "args": {"op": op, "confirmed": True}}
        ok, res_msg, changes = await self._execute_memory_change(mem_change)
        yield {"type": "tool_end", "name": tool_name, "result": res_msg, "is_error": not ok}
        if changes:
            yield changes.event()
        async for ev in self._stream_text(res_msg, delay):
            yield ev

    async def _execute_content_draft(
        self, draft: dict, session_id: str
    ) -> tuple[bool, str, Optional[ChangeSet]]:
        args = {
            "topic": draft["topic"],
            "item_id": draft["item_id"],
            "html": draft["html"],
            "write_mode": draft.get("write_mode", "append"),
            "target_h2": draft.get("target_h2"),
        }
        try:
            with write_granted("confirmed lesson content draft"):
                res_msg = await update_item_content.coroutine(**args)
            ok = res_msg.startswith("✅")
            if not ok:
                return False, res_msg, None
            session_store.set_active_lesson(
                session_id,
                draft["item_id"],
                draft.get("title") or "",
                topic_slug=draft.get("topic"),
                topic_title=draft.get("topic_title"),
            )
            changes = ChangeSet("update", "content", draft.get("topic"))
            changes.updated(
                draft.get("title") or str(draft["item_id"]),
                {"id": draft["item_id"]},
                code=draft.get("target_h2") or draft.get("write_mode") or "content",
                level="content",
            )
            return True, res_msg, changes
        except Exception as exc:
            return False, f"❌ Lỗi khi ghi nội dung bài: {exc}", None

    async def _handle_pending_content_draft(
        self, draft: dict, lower: str, session_id: str, delay: float
    ) -> AsyncGenerator[dict, None]:
        proceed, guard_msg = self._pending_confirm_guard(lower, "Đã bỏ bản nháp, bài học không thay đổi.")
        if not proceed:
            if guard_msg is not None:
                async for ev in self._stream_text(guard_msg, delay):
                    yield ev
            return
        yield {
            "type": "tool_start",
            "name": "update_item_content",
            "args": {"topic": draft["topic"], "item_id": draft["item_id"], "confirmed": True},
        }
        ok, res_msg, changes = await self._execute_content_draft(draft, session_id)
        yield {"type": "tool_end", "name": "update_item_content", "result": res_msg, "is_error": not ok}
        if changes:
            yield changes.event()
        async for ev in self._stream_text(res_msg, delay):
            yield ev

    def _validate_pending_section_title(
        self, rename: dict, titles: Optional[list[str]], session_ctx
    ) -> bool:
        if titles is None:
            return True
        cleaned_name = (
            re.sub(r"\s+", " ", (titles[0] or "")).strip().strip("\"'`“”‘’")
            if len(titles) == 1
            else ""
        )
        if len(titles) != 1 or not cleaned_name or cleaned_name.lower() in POINTING_WORDS:
            session_ctx.pending_section_rename = rename
            return False
        rename["to"] = cleaned_name
        return True

    async def _execute_pending_section_rename(
        self, rename: dict, args: dict, session_id: str
    ) -> tuple[bool, str, Optional[ChangeSet]]:
        try:
            with write_granted("confirmed section rename"):
                res_msg = await rename_section.coroutine(**args)
            ok = res_msg.startswith("✅")
            if not ok:
                return False, res_msg, None
            if rename.get("topic"):
                session_store.set_active_topic(session_id, rename["topic"], rename.get("title") or "")
            changes = ChangeSet("update", "section", rename.get("topic"))
            changes.updated(
                f"{rename['from']} → {rename['to']}",
                {"id": rename.get("topic")},
                code=f"{rename['count']} bài" if rename.get("count") else None,
                level="section",
            )
            return True, res_msg, changes
        except Exception as exc:
            return False, f"❌ Lỗi khi đổi tên mục: {exc}", None

    async def _handle_pending_section_rename(
        self,
        rename: dict,
        lower: str,
        session_id: str,
        session_ctx,
        delay: float,
        titles: Optional[list[str]],
    ) -> AsyncGenerator[dict, None]:
        proceed, guard_msg = self._pending_confirm_guard(lower, "Đã hủy bỏ thao tác theo yêu cầu của bạn.")
        if not proceed:
            if guard_msg is not None:
                async for ev in self._stream_text(guard_msg, delay):
                    yield ev
            return
        if not self._validate_pending_section_title(rename, titles, session_ctx):
            async for ev in self._reprompt_pending_preview(
                session_id,
                EDITED_TITLES_REJECTED_REPLY,
                delay,
                kind="section_rename",
                editable_titles=[rename.get("merge") or rename["to"]],
            ):
                yield ev
            return

        args = {"topic": rename["topic"], "from_name": rename["from"], "to_name": rename["to"]}
        yield {"type": "tool_start", "name": "rename_section", "args": {**args, "confirmed": True}}
        ok, res_msg, changes = await self._execute_pending_section_rename(rename, args, session_id)
        yield {"type": "tool_end", "name": "rename_section", "result": res_msg, "is_error": not ok}
        if changes:
            yield changes.event()
        async for ev in self._stream_text(res_msg, delay):
            yield ev

    async def _apply_pending_lesson_edit_inputs(
        self,
        edit: dict,
        session_id: str,
        session_ctx,
        delay: float,
        titles: Optional[list[str]],
        target: Optional[dict],
    ) -> tuple[bool, Optional[dict]]:
        if titles is not None:
            cleaned_title = self.extractor.clean_title(titles[0]) if len(titles) == 1 else ""
            if len(titles) != 1 or not cleaned_title or cleaned_title.lower() in POINTING_WORDS:
                session_ctx.pending_lesson_edit = edit
                return False, {
                    "editable_titles": [edit["new_title"]],
                    "editable_target": {"section": edit.get("new_section") or ""},
                }
            edit["new_title"] = cleaned_title
        if target is not None and "section" in target:
            raw_sec = re.sub(r"\s+", " ", (target.get("section") or "")).strip().strip("\"'`“”‘’")
            edit["new_section"] = None if (not raw_sec or raw_sec.lower() == "chung") else raw_sec
        return True, None

    @staticmethod
    def _build_lesson_edit_kwargs(
        old_title: str, new_title: str, old_section: Optional[str], new_section: Optional[str]
    ) -> dict:
        update_kwargs: dict = {}
        if new_title != old_title:
            update_kwargs["title"] = new_title
        if (new_section or None) != (old_section or None) or (
            new_section is not None and old_section is not None and new_section != old_section
        ):
            update_kwargs["section"] = new_section
        return update_kwargs

    @staticmethod
    def _format_lesson_edit_success(
        res: object, update_kwargs: dict, old_title: str, new_title: str, new_section: Optional[str]
    ) -> tuple[str, str]:
        final_title = (res.get("title") if isinstance(res, dict) else None) or new_title
        final_sec = (
            res.get("section") if isinstance(res, dict) and "section" in res else new_section
        ) or GENERAL_SECTION
        if "title" in update_kwargs and "section" in update_kwargs:
            return final_title, f"✅ Đã cập nhật bài **{old_title}** → **{final_title}** (mục `{final_sec}`)."
        if "title" in update_kwargs:
            return final_title, f"✅ Đã đổi tên bài **{old_title}** → **{final_title}**."
        return final_title, f"✅ Đã chuyển bài **{final_title}** sang mục `{final_sec}`."

    async def _execute_pending_lesson_edit(
        self, edit: dict, item_id: Any, update_kwargs: dict, session_id: str
    ) -> tuple[bool, str]:
        old_title = edit["old_title"]
        new_title, new_section = edit["new_title"], edit.get("new_section")
        try:
            with write_granted("confirmed lesson edit"):
                res = await get_adapter().update_item(item_id, **update_kwargs)
            schedule_local_rag_sync()
            final_title, res_msg = self._format_lesson_edit_success(
                res, update_kwargs, old_title, new_title, new_section
            )
            session_store.set_active_lesson(
                session_id,
                item_id,
                final_title,
                section=new_section if "section" in update_kwargs else None,
                topic_slug=edit.get("topic_slug") or edit.get("topic"),
                topic_title=edit.get("topic_title"),
            )
            return True, res_msg
        except DuplicateEntityError as dup:
            return False, f"ℹ️ Topic đã có bài **{dup.title}**, không đổi tên."
        except Exception as exc:
            return False, f"❌ Lỗi khi cập nhật bài học: {exc}"

    @staticmethod
    def _pending_confirm_guard(lower: str, cancel_msg: str) -> tuple[bool, Optional[str]]:
        if lower not in CONFIRM_WORDS:
            return False, (cancel_msg if lower in CANCEL_WORDS else None)
        if not is_owner():
            return False, OWNER_ONLY_MESSAGE
        return True, None

    async def _handle_pending_lesson_edit(
        self,
        edit: dict,
        lower: str,
        session_id: str,
        session_ctx,
        delay: float,
        titles: Optional[list[str]],
        target: Optional[dict],
    ) -> AsyncGenerator[dict, None]:
        proceed, guard_msg = self._pending_confirm_guard(lower, "Đã hủy bỏ thao tác theo yêu cầu của bạn.")
        if not proceed:
            if guard_msg is not None:
                async for ev in self._stream_text(guard_msg, delay):
                    yield ev
            return
        valid, reprompt_kwargs = await self._apply_pending_lesson_edit_inputs(
            edit, session_id, session_ctx, delay, titles, target
        )
        if not valid and reprompt_kwargs is not None:
            async for ev in self._reprompt_pending_preview(
                session_id, EDITED_TITLES_REJECTED_REPLY, delay, kind="lesson_edit", **reprompt_kwargs
            ):
                yield ev
            return

        old_title, old_section = edit["old_title"], edit.get("old_section")
        new_title, new_section = edit["new_title"], edit.get("new_section")
        update_kwargs = self._build_lesson_edit_kwargs(old_title, new_title, old_section, new_section)
        if not update_kwargs:
            async for ev in self._stream_text(
                f"Bài **{old_title}** đã có đúng tên và mục này rồi nên mình chưa đổi gì.", delay
            ):
                yield ev
            return

        item_id = edit["item_id"]
        yield {"type": "tool_start", "name": "update_item", "args": {"item_id": item_id, **update_kwargs, "confirmed": True}}
        ok, res_msg = await self._execute_pending_lesson_edit(edit, item_id, update_kwargs, session_id)
        yield {"type": "tool_end", "name": "update_item", "result": res_msg, "is_error": not ok}
        if ok:
            changes = ChangeSet("update", "item", edit.get("topic_slug") or edit.get("topic"))
            changes.updated(
                new_title,
                {"id": item_id},
                code=(new_section or GENERAL_SECTION) if "section" in update_kwargs else None,
                level="item",
            )
            yield changes.event()
        async for ev in self._stream_text(res_msg, delay):
            yield ev

    async def _emit_follow_up_promotion_preview(
        self, proposal: dict, session_id: str, session_ctx, delay: float
    ) -> AsyncGenerator[dict, None]:
        session_ctx.pending_concept_promotion = proposal
        preview_text = format_concept_promotion_preview(proposal)
        editable_titles = [proposal["title"]] if proposal.get("mode") == "create" else None
        editable_target = (
            {"topic": proposal.get("topic") or "", "section": proposal.get("section") or ""}
            if proposal.get("mode") == "create"
            else None
        )
        yield build_action_preview_event(
            action_id=session_id,
            kind="concept_promotion",
            preview=preview_text,
            editable_titles=editable_titles,
            editable_target=editable_target,
        )
        async for chunk in self._stream_text(f"\n\n{preview_text}", delay):
            yield chunk

    async def _run_status_change_adapter(
        self, status_change: dict, session_id: str
    ) -> tuple[bool, str]:
        item_id, item_title = status_change["item_id"], status_change["item_title"]
        new_status = status_change["new_status"]
        mark_reviewed = bool(status_change.get("mark_reviewed"))
        try:
            from rag_service.domains.roadmap.lesson_status import LESSON_STATUS_LABEL

            with write_granted("confirmed lesson review" if mark_reviewed else "confirmed lesson status change"):
                res = (
                    await get_adapter().update_item(item_id, markReviewed=True)
                    if mark_reviewed
                    else await get_adapter().update_item(item_id, status=new_status)
                )
            label = LESSON_STATUS_LABEL.get(new_status, new_status)
            title = res.get("title", item_title) if isinstance(res, dict) else item_title
            res_msg = (
                f"✅ Đã đánh dấu đã ôn hôm nay cho bài '{title}'."
                if mark_reviewed
                else f"✅ Đã đổi trạng thái bài '{title}' sang **{label}**."
            )
            session_store.set_active_lesson(session_id, item_id, title, topic_slug=status_change.get("topic_slug"))
            return True, res_msg
        except Exception as exc:
            return False, f"❌ Lỗi khi cập nhật trạng thái bài: {exc}"

    async def _handle_pending_status_change(
        self, status_change: dict, lower: str, session_id: str, session_ctx, delay: float
    ) -> AsyncGenerator[dict, None]:
        ok_guard, early_msg = self._pending_confirm_guard(
            lower, "Đã hủy bỏ thao tác đổi trạng thái theo yêu cầu của bạn."
        )
        if not ok_guard:
            session_ctx.pending_concept_promotion = None
            if early_msg:
                async for ev in self._stream_text(early_msg, delay):
                    yield ev
            return
        item_id = status_change["item_id"]
        mark_reviewed = bool(status_change.get("mark_reviewed"))
        tool_name = "mark_lesson_reviewed" if mark_reviewed else "update_item"
        tool_args = (
            {"item_id": item_id, "markReviewed": True, "confirmed": True}
            if mark_reviewed
            else {"item_id": item_id, "status": status_change["new_status"], "confirmed": True}
        )
        yield {"type": "tool_start", "name": tool_name, "args": tool_args}
        ok, res_msg = await self._run_status_change_adapter(status_change, session_id)
        yield {"type": "tool_end", "name": tool_name, "result": res_msg, "is_error": not ok}
        if ok:
            changes = ChangeSet("update", "item", status_change.get("topic_slug"))
            changes.updated(
                status_change["item_title"],
                {"id": item_id},
                code="reviewed" if mark_reviewed else status_change.get("new_status"),
                level="item",
            )
            yield changes.event()
        async for ev in self._stream_text(res_msg, delay):
            yield ev
        if ok and (follow_up := session_ctx.fresh_pending("pending_concept_promotion")) is not None:
            async for ev in self._emit_follow_up_promotion_preview(follow_up, session_id, session_ctx, delay):
                yield ev

    async def _apply_concept_promotion_overrides(
        self, proposal: dict, titles: Optional[list[str]], target: Optional[dict]
    ) -> tuple[dict, Optional[str]]:
        updated = dict(proposal)
        if titles is not None:
            if len(titles) != 1:
                return updated, EDITED_TITLES_REJECTED_REPLY
            clean = self.extractor.clean_title(titles[0])
            if not clean or clean.lower() in POINTING_WORDS:
                return updated, EDITED_TITLES_REJECTED_REPLY
            updated["title"] = clean
        if target is not None:
            if "topic" in target:
                raw_topic = (target.get("topic") or "").strip()
                if not raw_topic or raw_topic.lower() in POINTING_WORDS:
                    return updated, EDITED_TARGET_REJECTED_REPLY
                found = await resolve_topic(raw_topic)
                if found.status == "unavailable":
                    return updated, "⚠️ Hiện chưa kiểm tra được Topic đích. Thao tác vẫn đang chờ: thử lại hoặc bấm hủy."
                if found.status != "found" or not found.slug:
                    return updated, (
                        describe_unresolved_topic(raw_topic, found)
                        + " Thao tác vẫn đang chờ: sửa lại Topic đích rồi bấm xác nhận, hoặc bấm hủy."
                    )
                updated["topic"] = found.slug
                updated["topic_title"] = found.title or found.slug
            if "section" in target:
                raw_sec = re.sub(r"\s+", " ", (target.get("section") or "")).strip().strip("\"'`“”‘’")
                updated["section"] = "" if (not raw_sec or raw_sec.lower() == "chung") else raw_sec
        return updated, None

    async def _link_promoted_lesson_relations(self, created_id: str, related_lessons: list[dict]) -> list[str]:
        linked: list[str] = []
        adapter = get_adapter()
        for rel in related_lessons[:3]:
            rel_id = str(rel.get("lesson_id") or "").strip()
            if not rel_id or rel_id == created_id:
                continue
            try:
                with write_granted("confirmed concept promotion relation"):
                    await adapter.create_relation(created_id, rel_id)
                linked.append(str(rel.get("title") or rel_id))
            except Exception as exc:
                print(f"[concept_promotion] Relation skipped ({created_id} <-> {rel_id}): {exc}")
        return linked

    async def _execute_concept_promotion_append(
        self, proposal: dict, session_id: str, delay: float
    ) -> AsyncGenerator[dict, None]:
        args = {
            "topic": proposal["topic"],
            "item_id": proposal["item_id"],
            "html": proposal["html"],
            "write_mode": proposal.get("write_mode", "append"),
            "target_h2": proposal.get("target_h2"),
        }
        yield {
            "type": "tool_start",
            "name": "update_item_content",
            "args": {"topic": proposal["topic"], "item_id": proposal["item_id"], "confirmed": True},
        }
        try:
            with write_granted("confirmed concept promotion append"):
                res_msg = await update_item_content.coroutine(**args)
            ok = res_msg.startswith("✅")
            if ok:
                session_store.set_active_lesson(
                    session_id,
                    proposal["item_id"],
                    proposal.get("target_lesson_title") or proposal["title"],
                    topic_slug=proposal.get("topic"),
                    topic_title=proposal.get("topic_title"),
                )
        except Exception as exc:
            ok, res_msg = False, f"❌ Lỗi khi bổ sung kiến thức: {exc}"
        yield {"type": "tool_end", "name": "update_item_content", "result": res_msg, "is_error": not ok}
        if ok:
            changes = ChangeSet("update", "content", proposal.get("topic"))
            changes.updated(
                proposal.get("target_lesson_title") or proposal["title"],
                {"id": proposal["item_id"]},
                code=proposal.get("target_h2") or "append",
                level="content",
            )
            yield changes.event()
        async for ev in self._stream_text(res_msg, delay):
            yield ev

    async def _execute_concept_promotion_create(
        self, proposal: dict, session_id: str, delay: float
    ) -> AsyncGenerator[dict, None]:
        action = StructuredRoadmapAction(
            action=ActionType.CREATE,
            entity_level=EntityLevel.ITEM,
            is_batch=False,
            target_parent_identifier=proposal.get("topic"),
            raw_intent_summary=f"Promote concept '{proposal['title']}'",
            entities=[
                SingleEntity(
                    title=proposal["title"],
                    section=proposal.get("section") or None,
                    description=proposal.get("description") or "",
                )
            ],
        )
        yield {
            "type": "tool_start",
            "name": "promote_concept_to_lesson",
            "args": {
                "topic": proposal.get("topic"),
                "title": proposal["title"],
                "status": proposal.get("status", "target"),
                "confirmed": True,
            },
        }
        changes = ChangeSet.of(action)
        with write_granted("confirmed concept promotion create"):
            ok, res_msg = await self.executor.aexecute(
                action,
                session_id=session_id,
                changes=changes,
                initial_content=proposal.get("html") or "",
                default_status=proposal.get("status") or "target",
            )
        if ok and changes.entries and proposal.get("related_lessons"):
            created_id = str(changes.entries[0].get("id") or "").strip()
            if created_id:
                linked = await self._link_promoted_lesson_relations(created_id, proposal["related_lessons"])
                if linked:
                    res_msg += f"\n🔗 Đã liên kết với bài liên quan: {', '.join(linked)}"
        yield {"type": "tool_end", "name": "promote_concept_to_lesson", "result": res_msg, "is_error": not ok}
        if changes:
            yield changes.event()
        async for ev in self._stream_text(res_msg, delay):
            yield ev

    async def _handle_pending_concept_promotion(
        self,
        proposal: dict,
        lower: str,
        session_id: str,
        session_ctx,
        delay: float,
        titles: Optional[list[str]],
        target: Optional[dict],
    ) -> AsyncGenerator[dict, None]:
        ok_guard, early_msg = self._pending_confirm_guard(
            lower, "Đã bỏ qua đề xuất lưu khái niệm, Roadmap không thay đổi."
        )
        if not ok_guard:
            if early_msg:
                async for ev in self._stream_text(early_msg, delay):
                    yield ev
            return
        if proposal.get("mode") == "create" and (titles is not None or target is not None):
            proposal, err = await self._apply_concept_promotion_overrides(proposal, titles, target)
            if err is not None:
                session_ctx.pending_concept_promotion = proposal
                async for ev in self._reprompt_pending_preview(
                    session_id,
                    err,
                    delay,
                    kind="concept_promotion",
                    editable_titles=[proposal["title"]],
                    editable_target={"topic": proposal.get("topic") or "", "section": proposal.get("section") or ""},
                ):
                    yield ev
                return
        stream = (
            self._execute_concept_promotion_append(proposal, session_id, delay)
            if proposal.get("mode") == "append" and proposal.get("item_id")
            else self._execute_concept_promotion_create(proposal, session_id, delay)
        )
        async for ev in stream:
            yield ev

    def _preview_retry_args(self, pending_act: StructuredRoadmapAction) -> tuple[Optional[list[str]], Optional[dict]]:
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
        return retry_titles, retry_target

    async def _apply_confirmation_overrides(
        self,
        pending_act: StructuredRoadmapAction,
        titles: Optional[list[str]],
        target: Optional[dict],
    ) -> tuple[Optional[StructuredRoadmapAction], Optional[str]]:
        if titles is not None:
            edited = self._with_edited_titles(pending_act, titles)
            if edited is None:
                return None, EDITED_TITLES_REJECTED_REPLY
            pending_act = edited
        if target is not None:
            edited_act, err_msg = await self._with_edited_target(pending_act, target)
            if err_msg is not None or edited_act is None:
                return None, err_msg or EDITED_TARGET_REJECTED_REPLY
            pending_act = edited_act
        return pending_act, None

    async def _handle_pending_confirmation_confirm(
        self,
        pending_act: StructuredRoadmapAction,
        session_id: str,
        session_ctx,
        delay: float,
        titles: Optional[list[str]],
        target: Optional[dict],
    ) -> AsyncGenerator[dict, None]:
        if not is_owner():
            session_ctx.pending_confirmation = None
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        updated_act, override_err = await self._apply_confirmation_overrides(pending_act, titles, target)
        if override_err is not None or updated_act is None:
            retry_titles, retry_target = self._preview_retry_args(pending_act)
            async for ev in self._reprompt_pending_preview(
                session_id,
                override_err or EDITED_TARGET_REJECTED_REPLY,
                delay,
                kind="cud",
                editable_titles=retry_titles,
                editable_target=retry_target,
            ):
                yield ev
            return
        pending_act = updated_act
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

    def _dispatch_simple_pending(
        self,
        slot: str,
        payload: Any,
        *,
        lower: str,
        session_id: str,
        session_ctx: Any,
        delay: float,
        titles: Optional[list[str]],
        target: Optional[dict],
    ) -> AsyncGenerator[dict, None]:
        handlers = {
            "pending_memory_change": lambda: self._handle_pending_memory(payload, lower, delay),
            "pending_content_draft": lambda: self._handle_pending_content_draft(payload, lower, session_id, delay),
            "pending_section_rename": lambda: self._handle_pending_section_rename(
                payload, lower, session_id, session_ctx, delay, titles
            ),
            "pending_lesson_edit": lambda: self._handle_pending_lesson_edit(
                payload, lower, session_id, session_ctx, delay, titles, target
            ),
            "pending_status_change": lambda: self._handle_pending_status_change(
                payload, lower, session_id, session_ctx, delay
            ),
            "pending_concept_promotion": lambda: self._handle_pending_concept_promotion(
                payload, lower, session_id, session_ctx, delay, titles, target
            ),
        }
        return handlers[slot]()

    async def _resolve_pending_confirmation_turn(
        self,
        lower: str,
        session_id: str,
        session_ctx,
        delay: float,
        titles: Optional[list[str]],
        target: Optional[dict],
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        if lower in CONFIRM_WORDS:
            async for ev in self._handle_pending_confirmation_confirm(
                session_ctx.pending_confirmation, session_id, session_ctx, delay, titles, target
            ):
                yield ev
            outcome["handled"] = True
            return
        if lower in CANCEL_WORDS:
            session_ctx.pending_confirmation = None
            async for ev in self._stream_text("Đã hủy bỏ thao tác theo yêu cầu của bạn.", delay):
                yield ev
            outcome["handled"] = True
            return
        # Anything else: drop the pending action so a later "ok" cannot run a stale delete.
        session_ctx.pending_confirmation = None

    async def handle_pending(
        self, *, content: str, lower: str, session_id: str, session_ctx, delay: float, outcome: dict,
        titles: Optional[list[str]] = None,
        target: Optional[dict] = None,
    ) -> AsyncGenerator[dict, None]:
        """Finish a roadmap change that was waiting for confirmation (a previewed action)."""
        # active_pending drops previews older than PENDING_TTL_SECONDS so a late "ok" does not run them
        active = session_ctx.active_pending()
        if active is not None:
            slot, _, payload = active
            if slot == "pending_confirmation":
                async for ev in self._resolve_pending_confirmation_turn(
                    lower, session_id, session_ctx, delay, titles, target, outcome
                ):
                    yield ev
                return
            setattr(session_ctx, slot, None)
            async for ev in self._dispatch_simple_pending(
                slot,
                payload,
                lower=lower,
                session_id=session_id,
                session_ctx=session_ctx,
                delay=delay,
                titles=titles,
                target=target,
            ):
                yield ev
            outcome["handled"] = lower in CONFIRM_WORDS or lower in CANCEL_WORDS
            return
        if lower in CONFIRM_WORDS:
            # 2026-11-04, live: an "ok" after the preview was dropped went to chitchat, which answered
            # "Đã xóa bài học Reranking" from the history while nothing was deleted.
            async for ev in self._stream_text(NOTHING_PENDING_REPLY, delay):
                yield ev
            outcome["handled"] = True

    async def confirm_pending_action(
        self,
        *,
        session_id: str,
        session_ctx: Any,
        titles: Optional[list[str]] = None,
        target: Optional[dict] = None,
    ) -> tuple[bool, str, Optional[str], Optional[dict]]:
        """Execute whichever confirmable pending preview is active on `session_ctx`."""
        active = session_ctx.active_pending()
        if active is None:
            return (
                False,
                "Không có thao tác nào đang chờ xác nhận (hoặc thao tác đã hết hạn sau 10 phút).",
                None,
                None,
            )
        _, kind, _ = active
        tokens: list[str] = []
        changes_list: list[dict] = []
        tool_errors: list[bool] = []
        saw_preview = False
        outcome: dict[str, Any] = {"handled": False}
        async for ev in self.handle_pending(
            content="ok",
            lower="ok",
            session_id=session_id,
            session_ctx=session_ctx,
            delay=0.0,
            outcome=outcome,
            titles=titles,
            target=target,
        ):
            ev_type = ev.get("type")
            if ev_type == "token":
                tokens.append(str(ev.get("delta") or ""))
            elif ev_type == "tool_end":
                tool_errors.append(bool(ev.get("is_error")))
            elif ev_type == "change_review":
                changes_list.append({k: v for k, v in ev.items() if k != "type"})
            elif ev_type == "action_preview":
                saw_preview = True

        msg = "".join(tokens).strip()
        ok = (bool(tool_errors) or not saw_preview) and not any(tool_errors)
        return ok, msg, kind, (changes_list[0] if changes_list else None)

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
        editable_titles = [ent.title for ent in action.entities] if action.action == ActionType.CREATE else None
        editable_target = (
            {
                "topic": action.target_parent_identifier or "",
                "section": (action.entities[0].section if action.entities else None) or "",
            }
            if action.action == ActionType.CREATE and action.entity_level == EntityLevel.ITEM
            else None
        )
        yield build_action_preview_event(
            action_id=session_id,
            kind="cud",
            preview=preview_text,
            editable_titles=editable_titles,
            editable_target=editable_target,
        )
        async for ev in self._stream_text(preview_text, delay):
            yield ev

    async def _resolve_delete_item_for_cud(
        self, resolved_action: StructuredRoadmapAction, page_context
    ) -> tuple[bool, Optional[str], Optional[dict]]:
        if resolved_action.is_batch or len(resolved_action.entities) != 1:
            return False, batch_entity_delete_reply("bài học"), None
        name = resolved_action.entities[0].title
        page_slug = (page_context or {}).get("roadmapSlug")
        found = await resolve_lesson(name, topic_slug=page_slug)
        if found.status != "found" or not found.lesson_id:
            return False, unresolved_entity_reply("bài học", name, found.candidates), None
        resolved_action.target_parent_identifier = found.lesson_id
        resolved_action.entities[0].title = found.title or name
        item_snapshot = await snapshot_before_delete(get_adapter(), "item", found.lesson_id, topic_slug=page_slug)
        if item_snapshot:
            resolved_action.entities[0].section = item_snapshot.get("section")
        return True, None, item_snapshot

    async def _resolve_create_item_parent_topic(
        self,
        resolved_action: StructuredRoadmapAction,
        content: str,
        note: Optional[str],
        page_context,
        session_ctx,
    ) -> tuple[bool, Optional[str], Optional[str]]:
        topic_ref = resolved_action.target_parent_identifier
        if not topic_ref or topic_ref in ANAPHORA_TARGETS:
            topic_ref = (
                await topic_named_in_message(content)
                or (page_context or {}).get("roadmapSlug")
                or session_ctx.active_topic_slug
            )
        found_topic = await resolve_topic(topic_ref) if topic_ref else None
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
                return False, None, note
        if found_topic is not None and found_topic.status == "found" and found_topic.slug:
            topic_ref = found_topic.slug
            if note == "Chưa có topic nào được chọn. Vui lòng chỉ định rõ tên topic.":
                note = None
            elif note and note.startswith("Tự động gắn vào topic:") and found_topic.title:
                note = f"Tự động gắn vào topic: **{found_topic.title}**"
        elif found_topic is not None and found_topic.status in ("not_found", "ambiguous"):
            return False, topic_ref, note
        if not topic_ref or not await self._topic_known(topic_ref):
            return False, topic_ref, note
        resolved_action.target_parent_identifier = topic_ref
        return True, None, note

    async def _extract_and_gate_cud(
        self,
        *,
        content: str,
        lower: str,
        page_context,
        session_id: str,
        gate: Optional[WriteGate],
        verdict,
    ) -> tuple[StructuredRoadmapAction, Any, WriteGate, Optional[str]]:
        gate = gate or WriteGate(WRITE_ALLOW)
        verified = getattr(verdict, "change", None) if verdict is not None and verdict.is_roadmap_change else None
        action = (
            self.extractor.from_verified(verified, text=content)
            if verified is not None and verified.entities
            else await self.extractor.aextract(content, page_context=build_grounding(page_context))
        )
        resolved_action, note = AnaphoraResolver.resolve_action(
            action, session_id=session_id, page_context=page_context
        )
        gate = gate_action(gate, resolved_action, content, lower)
        if gate.denied:
            reply = {
                QUESTION_AS_TITLE: QUESTION_TITLE_REPLY,
                BULK_DELETE_REQUEST: BULK_DELETE_REPLY,
                BLOCKED_CHANGE: BLOCKED_CHANGE_REPLY,
                ACTION_NOT_ASKED: ACTION_NOT_ASKED_REPLY,
                TARGET_MISSING: TARGET_MISSING_REPLY,
            }.get(gate.reason or "", BLOCKED_CHANGE_REPLY)
            return resolved_action, note, gate, reply
        if resolved_action.action == ActionType.UPDATE:
            return resolved_action, note, gate, UPDATE_NOT_SUPPORTED_REPLY
        return resolved_action, note, gate, None

    async def _prepare_cud_delete(
        self, resolved_action: StructuredRoadmapAction, note, page_context
    ) -> tuple[Optional[str], Any, Optional[dict]]:
        item_snapshot = None
        if resolved_action.entity_level == EntityLevel.ITEM:
            ok_item, err_reply, item_snapshot = await self._resolve_delete_item_for_cud(resolved_action, page_context)
            if not ok_item:
                return err_reply or "", None, None
            return None, None, item_snapshot
        if resolved_action.entity_level == EntityLevel.TOPIC:
            ref = resolved_action.target_parent_identifier or (
                resolved_action.entities[0].title if resolved_action.entities else ""
            )
            deleted_topic = await resolve_topic(ref)
            if deleted_topic.status == "found" and deleted_topic.slug:
                resolved_action.target_parent_identifier = deleted_topic.slug
        return None, note, item_snapshot

    async def _execute_and_stream_cud(
        self,
        resolved_action: StructuredRoadmapAction,
        note,
        session_id: str,
        session_ctx,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
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

        full_reply = f"> 💡 _{note}_\n\n{result_msg}" if note else result_msg
        async for ev in self._stream_text(full_reply, delay):
            yield ev

    async def _run_prepared_cud(
        self,
        *,
        resolved_action: StructuredRoadmapAction,
        note,
        gate: WriteGate,
        item_snapshot: Optional[dict],
        content: str,
        page_context,
        session_id: str,
        session_ctx,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        if resolved_action.action == ActionType.DELETE and gate.mode == WRITE_CONFIRM:
            async for ev in self._ask_confirmation(
                resolved_action, note, session_id, session_ctx, delay, snapshot=item_snapshot
            ):
                yield ev
            return

        if resolved_action.entity_level == EntityLevel.ITEM and resolved_action.action == ActionType.CREATE:
            ok_topic, bad_ref, note = await self._resolve_create_item_parent_topic(
                resolved_action, content, note, page_context, session_ctx
            )
            if not ok_topic:
                async for ev in self._ask_topic_choice(resolved_action, bad_ref, delay):
                    yield ev
                return

        if gate.mode == WRITE_CONFIRM or resolved_action.action == ActionType.CREATE:
            async for ev in self._ask_confirmation(resolved_action, note, session_id, session_ctx, delay):
                yield ev
            return

        async for ev in self._execute_and_stream_cud(resolved_action, note, session_id, session_ctx, delay):
            yield ev

    async def handle_cud(
        self, *, content: str, lower: str, page_context, session_id: str, session_ctx, delay: float,
        gate: Optional[WriteGate] = None,
        verdict=None,
    ) -> AsyncGenerator[dict, None]:
        """Roadmap create/delete: extract the action, ask back when a target is unclear, then confirm or run it.

        `gate` is the route-level write decision (write_gate.gate_route); gate_action refines it for the extracted change.
        """
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return

        resolved_action, note, gate, block_reply = await self._extract_and_gate_cud(
            content=content,
            lower=lower,
            page_context=page_context,
            session_id=session_id,
            gate=gate,
            verdict=verdict,
        )
        if block_reply is not None:
            async for ev in self._stream_text(block_reply, delay):
                yield ev
            return

        item_snapshot = None
        if resolved_action.action == ActionType.DELETE:
            err_reply, note, item_snapshot = await self._prepare_cud_delete(resolved_action, note, page_context)
            if err_reply is not None:
                async for ev in self._stream_text(err_reply, delay):
                    yield ev
                return

        async for ev in self._run_prepared_cud(
            resolved_action=resolved_action,
            note=note,
            gate=gate,
            item_snapshot=item_snapshot,
            content=content,
            page_context=page_context,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
        ):
            yield ev
