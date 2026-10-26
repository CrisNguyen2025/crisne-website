"""Action Executor — Dispatches validated StructuredRoadmapAction to database adapters.

Updates session context with active IDs and triggers real-time RAG re-indexing.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional, Tuple

from rag_service.adapters.errors import DuplicateEntityError
from rag_service.nlp_cleaner import generate_short_code
from rag_service.execution.changes import ChangeSet, snapshot_before_delete
from rag_service.domains.roadmap.retrieval.engine import rag_engine
from rag_service.domains.roadmap.router.entity_extractor import _generate_clean_short_code
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, StructuredRoadmapAction
from rag_service.state.session_store import session_store
from rag_service.tools import get_adapter


_KIND_LABEL = {"topic": "topic", "layer": "layer", "group": "group", "item": "bài học"}


def _skipped_message(skipped: list[DuplicateEntityError]) -> str:
    """Explain which entries were left alone because they already exist."""
    names = ", ".join(f"**{d.title}**" for d in skipped)
    kind = _KIND_LABEL.get(skipped[0].kind, skipped[0].kind) if skipped else ""
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
        """Execute action, update state machine, and sync RAG index.

        Automatically falls back to SqliteAdapter if the HTTP API connection fails.
        Returns (success: bool, result_message: str). Pass *changes* to collect the rows written.
        """
        adapter = self.adapter
        if changes is None:
            changes = ChangeSet.of(action)
        try:
            return await self._execute_inner(adapter, action, session_id, changes)
        except Exception as exc:
            err_str = str(exc)
            # If network / HTTP connection error occurred and adapter is not SQLite, fallback to SqliteAdapter
            if any(k in err_str.lower() for k in ["connection", "connect", "timeout", "network", "errno"]):
                from rag_service.adapters.sqlite_adapter import SqliteAdapter
                if not isinstance(adapter, SqliteAdapter):
                    print(f"[ActionExecutor] HTTP connection failed ({exc}). Auto-falling back to direct SqliteAdapter...")
                    try:
                        sqlite_adapter = SqliteAdapter()
                        return await self._execute_inner(sqlite_adapter, action, session_id, changes)
                    except Exception as fallback_exc:
                        return False, f"❌ Lỗi khi thực thi: {fallback_exc}"

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

        # ── 1. TOPIC LEVEL ────────────────────────────────────────────────
        if level == EntityLevel.TOPIC:
            if act_type == ActionType.CREATE:
                created_topics = []
                skipped: list[DuplicateEntityError] = []
                for ent in action.entities:
                    try:
                        res = await adapter.create_topic(
                            title=ent.title,
                            # The code is read from the title ("AI Engineering" -> AI), never a fixed one
                            short_code=ent.short_code or generate_short_code(ent.title),
                            description=ent.description or "",
                        )
                    except DuplicateEntityError as dup:
                        # Keep working in the topic that already exists
                        session_store.set_active_topic(
                            session_id, slug=dup.existing.get("slug", ""), title=dup.title
                        )
                        skipped.append(dup)
                        changes.skip(dup.title)
                        continue
                    created_slug = res.get("slug", "")
                    changes.created(ent.title, res, ent.short_code)
                    session_store.set_active_topic(session_id, slug=created_slug, title=ent.title)
                    created_topics.append((ent.title, ent.short_code, created_slug))

                if not created_topics:
                    return True, _skipped_message(skipped)
                asyncio.create_task(rag_engine.sync_live_database())

                if skipped:
                    bullets = "\n".join([f"- **{t}** (mã: `{sc}`)" for t, sc, _ in created_topics])
                    return True, f"✅ Đã tạo {len(created_topics)} topic:\n{bullets}\n\n{_skipped_message(skipped)}"
                if len(created_topics) == 1:
                    t, sc, slug = created_topics[0]
                    return True, (
                        f"✅ Đã tạo thành công topic **{t}** (mã: `{sc}`, slug: `{slug}`).\n\n"
                        f"Dữ liệu đã được lưu và cập nhật trực tiếp trên trang Roadmap của bạn."
                    )
                else:
                    bullets = "\n".join([f"- **{t}** (mã: `{sc}`)" for t, sc, _ in created_topics])
                    return True, (
                        f"✅ Đã tạo thành công {len(created_topics)} topic:\n{bullets}\n\n"
                        f"Dữ liệu đã được đồng bộ vào hệ thống Roadmap."
                    )

            elif act_type == ActionType.DELETE:
                target_ident = action.target_parent_identifier or (action.entities[0].title if action.entities else "")
                short_code = action.entities[0].short_code if action.entities else ""
                before = await snapshot_before_delete(adapter, "topic", target_ident)
                ok = await adapter.delete_topic(slug=target_ident)
                if not ok and short_code and short_code.lower() != target_ident.lower():
                    before = await snapshot_before_delete(adapter, "topic", short_code)
                    ok = await adapter.delete_topic(slug=short_code)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    changes.deleted(target_ident, before)
                    return True, f"🗑️ Đã xóa topic `{target_ident}` khỏi hệ thống."
                return False, f"⚠️ Không tìm thấy topic `{target_ident}` trong hệ thống (hoặc topic đã bị xóa trước đó)."


        # ── 2. LAYER LEVEL ────────────────────────────────────────────────
        elif level == EntityLevel.LAYER:
            topic_slug = action.target_parent_identifier
            if act_type == ActionType.CREATE and not topic_slug:
                return False, "❌ Không tìm thấy Topic đích để tạo Layer. Vui lòng chỉ định rõ tên topic."

            if act_type == ActionType.CREATE:
                created_layers = []
                skipped = []
                topic = await adapter.get_topic(topic_slug)
                existing = len((topic or {}).get("layers") or [])
                for idx, ent in enumerate(action.entities, 1):
                    code = (ent.short_code or _generate_clean_short_code(ent.title))[:3].upper()
                    short_tag = ent.short_tag or f"{existing + idx:02d}-{code}"
                    try:
                        res = await adapter.create_layer(
                            topic_slug=topic_slug,
                            title=ent.title,
                            short_tag=short_tag,
                            subtitle=ent.description or "",
                        )
                    except DuplicateEntityError as dup:
                        # Follow-up steps (e.g. adding items) go into the layer that already exists
                        if dup.existing.get("id"):
                            session_store.set_active_layer(session_id, layer_id=dup.existing["id"], title=dup.title)
                        skipped.append(dup)
                        changes.skip(dup.title)
                        existing -= 1  # numbering skips nothing for a layer not created
                        continue
                    layer_id = res.get("id", short_tag)
                    changes.created(ent.title, res, short_tag)
                    session_store.set_active_layer(session_id, layer_id=layer_id, title=ent.title)
                    created_layers.append((ent.title, short_tag))

                if not created_layers:
                    return True, _skipped_message(skipped)
                asyncio.create_task(rag_engine.sync_live_database())

                if skipped:
                    bullets = "\n".join([f"- **{t}** (mã: `{tag}`)" for t, tag in created_layers])
                    return True, (
                        f"✅ Đã tạo {len(created_layers)} layer trong topic **{topic_slug}**:\n{bullets}\n\n"
                        f"{_skipped_message(skipped)}"
                    )
                if len(created_layers) == 1:
                    t, tag = created_layers[0]
                    return True, (
                        f"✅ Đã tạo thành công layer **{t}** (mã: `{tag}`) trong topic **{topic_slug}**.\n\n"
                        f"Dữ liệu đã được cập nhật trực tiếp trên website."
                    )
                else:
                    bullets = "\n".join([f"- **{t}** (mã: `{tag}`)" for t, tag in created_layers])
                    return True, (
                        f"✅ Đã tạo thành công {len(created_layers)} layer trong topic **{topic_slug}**:\n"
                        f"{bullets}\n\n"
                        f"Dữ liệu đã được cập nhật trực tiếp trên website."
                    )

            elif act_type == ActionType.DELETE:
                # target_parent_identifier holds the layer id, resolved by the agent before confirmation
                layer_id = action.target_parent_identifier
                if not layer_id:
                    return False, "❌ Không xác định được layer cần xóa. Vui lòng chỉ định rõ tên layer và topic."
                before = await snapshot_before_delete(adapter, "layer", layer_id)
                ok = await adapter.delete_layer(layer_id=layer_id)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    changes.deleted(layer_id, before)
                    return True, f"🗑️ Đã xóa layer `{layer_id}` khỏi hệ thống."
                return False, f"⚠️ Không tìm thấy layer `{layer_id}` trong hệ thống."

        # ── 3. GROUP LEVEL ────────────────────────────────────────────────
        elif level == EntityLevel.GROUP:
            layer_id = action.target_parent_identifier
            if not layer_id:
                return False, "❌ Không tìm thấy Layer đích để tạo Group."

            if act_type == ActionType.CREATE:
                if any(not ent.level for ent in action.entities):
                    return False, "❌ Thiếu level của group (core / intermediate / advanced)."
                created_groups = []
                skipped = []
                for ent in action.entities:
                    try:
                        res = await adapter.create_group(
                            layer_id=layer_id,
                            title=ent.title,
                            level=ent.level or "",
                        )
                    except DuplicateEntityError as dup:
                        skipped.append(dup)
                        changes.skip(dup.title)
                        continue
                    changes.created(ent.title, res)
                    created_groups.append(ent.title)

                if not created_groups:
                    return True, _skipped_message(skipped)
                asyncio.create_task(rag_engine.sync_live_database())
                bullets = "\n".join([f"- **{g}**" for g in created_groups])
                tail = f"\n\n{_skipped_message(skipped)}" if skipped else ""
                return True, (
                    f"✅ Đã tạo thành công {len(created_groups)} group trong layer `{layer_id}`:\n{bullets}{tail}"
                )

            elif act_type == ActionType.DELETE:
                group_id = action.target_parent_identifier or (action.entities[0].title if action.entities else "")
                before = await snapshot_before_delete(adapter, "group", group_id)
                ok = await adapter.delete_group(group_id=group_id)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    changes.deleted(group_id, before)
                    return True, f"🗑️ Đã xóa group `{group_id}`."
                return False, f"⚠️ Không tìm thấy group `{group_id}` trong hệ thống."

        # ── 4. ITEM LEVEL ─────────────────────────────────────────────────
        elif level == EntityLevel.ITEM:
            layer_id = action.target_parent_identifier
            if not layer_id:
                return False, "❌ Không tìm thấy Layer đích để thêm bài học (Item)."

            if act_type == ActionType.CREATE:
                if any(not ent.level for ent in action.entities):
                    return False, "❌ Thiếu level của bài học (core / intermediate / advanced)."
                created_items = []
                skipped = []
                for ent in action.entities:
                    try:
                        res = await adapter.create_item(
                            layer_id=layer_id,
                            level=ent.level or "",
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
                bullets = "\n".join([f"- **{i}**" for i in created_items])
                ctx = session_store.get_or_create(session_id)
                layer_label = (
                    f"**{ctx.active_layer_title}**"
                    if ctx.active_layer_id == layer_id and ctx.active_layer_title
                    else f"`{layer_id}`"
                )
                tail = f"\n\n{_skipped_message(skipped)}" if skipped else "\n\nNội dung đã được lưu vào hệ thống."
                return True, (
                    f"✅ Đã thêm thành công {len(created_items)} bài học vào layer {layer_label}:\n{bullets}{tail}"
                )

            elif act_type == ActionType.DELETE:
                item_id = action.target_parent_identifier or (action.entities[0].title if action.entities else "")
                before = await snapshot_before_delete(adapter, "item", item_id)
                ok = await adapter.delete_item(item_id=item_id)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    changes.deleted(item_id, before)
                    return True, f"🗑️ Đã xóa bài học `{item_id}`."
                return False, f"⚠️ Không tìm thấy bài học `{item_id}` trong hệ thống."

        return False, f"Thao tác {act_type.value} trên cấp {level.value} chưa được hỗ trợ."

