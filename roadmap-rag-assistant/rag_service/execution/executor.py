"""Action Executor — Dispatches validated StructuredRoadmapAction to database adapters (ADR-0009).

Topics are created and deleted; lessons are created and deleted, each into a topic and optionally a section.
Updates session context with the active topic and triggers a real-time RAG re-index.

A write never falls back to another database: when the source is unreachable the action fails, and the reply says so.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional, Tuple

from rag_service.adapters.errors import DuplicateEntityError
from rag_service.execution.changes import ChangeSet, snapshot_before_delete
from rag_service.domains.roadmap.retrieval.engine import rag_engine
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, StructuredRoadmapAction
from rag_service.state.session_store import session_store
from rag_service.tools import get_adapter


def _skipped_message(skipped: list[DuplicateEntityError]) -> str:
    """Explain which entries were left alone because they already exist."""
    names = ", ".join(f"**{d.title}**" for d in skipped)
    kind = "topic" if skipped and skipped[0].kind == "topic" else "bài học"
    return f"ℹ️ Đã có sẵn {kind} {names}, không tạo thêm bản trùng."


class ActionExecutor:
    """Dispatches StructuredRoadmapAction to the underlying adapter and updates state."""

    def __init__(self, adapter: Optional[Any] = None) -> None:
        self._adapter = adapter

    @property
    def adapter(self) -> Any:
        if self._adapter is not None:
            return self._adapter
        return get_adapter()

    async def aexecute(
        self,
        action: StructuredRoadmapAction,
        session_id: str,
        changes: Optional[ChangeSet] = None,
    ) -> Tuple[bool, str]:
        """Execute action, update state, and sync the RAG index.

        Returns (success: bool, result_message: str). Pass *changes* to collect the rows written.
        """
        if changes is None:
            changes = ChangeSet.of(action)
        try:
            return await self._execute_inner(self.adapter, action, session_id, changes)
        except Exception as exc:
            return False, f"❌ Lỗi khi thực thi: {exc}"

    async def _execute_inner(
        self,
        adapter: Any,
        action: StructuredRoadmapAction,
        session_id: str,
        changes: ChangeSet,
    ) -> Tuple[bool, str]:
        level = action.entity_level
        act_type = action.action

        # ── 1. TOPIC ──────────────────────────────────────────────────────
        if level == EntityLevel.TOPIC:
            if act_type == ActionType.CREATE:
                created: list[tuple[str, str]] = []
                skipped: list[DuplicateEntityError] = []
                for ent in action.entities:
                    try:
                        res = await adapter.create_topic(title=ent.title, description=ent.description or "")
                    except DuplicateEntityError as dup:
                        # Keep working in the topic that already exists
                        session_store.set_active_topic(session_id, slug=dup.existing.get("slug", ""), title=dup.title)
                        skipped.append(dup)
                        changes.skip(dup.title)
                        continue
                    changes.created(ent.title, res)
                    session_store.set_active_topic(session_id, slug=res.get("slug", ""), title=ent.title)
                    created.append((ent.title, res.get("slug", "")))

                if not created:
                    return True, _skipped_message(skipped)
                asyncio.create_task(rag_engine.sync_live_database())

                bullets = "\n".join(f"- **{t}** (slug: `{slug}`)" for t, slug in created)
                tail = f"\n\n{_skipped_message(skipped)}" if skipped else ""
                if len(created) == 1:
                    t, slug = created[0]
                    return True, (
                        f"✅ Đã tạo thành công topic **{t}** (slug: `{slug}`). Bài học sẽ được thêm vào sau."
                        f"{tail}"
                    )
                return True, f"✅ Đã tạo thành công {len(created)} topic:\n{bullets}{tail}"

            if act_type == ActionType.DELETE:
                target = action.target_parent_identifier or (action.entities[0].title if action.entities else "")
                before = await snapshot_before_delete(adapter, "topic", target)
                ok = await adapter.delete_topic(slug=target)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    changes.deleted(target, before)
                    return True, f"🗑️ Đã xóa topic `{target}` và toàn bộ bài học bên trong."
                return False, f"⚠️ Không tìm thấy topic `{target}` trong hệ thống (hoặc topic đã bị xóa trước đó)."

        # ── 2. LESSON ─────────────────────────────────────────────────────
        if level == EntityLevel.ITEM:
            topic_slug = action.target_parent_identifier
            if not topic_slug:
                return False, "❌ Không tìm thấy topic đích để thêm bài học. Hãy nêu rõ tên topic."

            if act_type == ActionType.CREATE:
                created_items: list[str] = []
                skipped = []
                for ent in action.entities:
                    try:
                        res = await adapter.create_item(
                            topic_slug=topic_slug,
                            section=ent.section,
                            title=ent.title,
                            description=ent.description or "",
                        )
                    except DuplicateEntityError as dup:
                        skipped.append(dup)
                        changes.skip(dup.title)
                        continue
                    changes.created(ent.title, res)
                    created_items.append(ent.title)

                if not created_items:
                    return True, _skipped_message(skipped)
                asyncio.create_task(rag_engine.sync_live_database())
                bullets = "\n".join(f"- **{i}**" for i in created_items)
                section_note = ""
                if action.entities and action.entities[0].section:
                    section_note = f" mục **{action.entities[0].section}**"
                tail = f"\n\n{_skipped_message(skipped)}" if skipped else "\n\nNội dung đã được lưu vào hệ thống."
                return True, (
                    f"✅ Đã thêm thành công {len(created_items)} bài học vào topic **{topic_slug}**{section_note}:"
                    f"\n{bullets}{tail}"
                )

            if act_type == ActionType.DELETE:
                item_id = action.target_parent_identifier or (action.entities[0].title if action.entities else "")
                before = await snapshot_before_delete(adapter, "item", item_id)
                ok = await adapter.delete_item(item_id=item_id)
                asyncio.create_task(rag_engine.sync_live_database())
                # handle_cud resolved the name to the id: the reply names the lesson, not its id
                name = action.entities[0].title if action.entities else item_id
                if ok:
                    changes.deleted(item_id, before)
                    return True, f"🗑️ Đã xóa bài học **{name}**."
                return False, f"⚠️ Không tìm thấy bài học **{name}** trong hệ thống."

        return False, f"Thao tác {act_type.value} trên cấp {level.value} chưa được hỗ trợ."
