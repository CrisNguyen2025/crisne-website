"""Action Executor — Dispatches validated StructuredRoadmapAction to database adapters.

Updates session context with active IDs and triggers real-time RAG re-indexing.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional, Tuple

from rag_service.rag.rag_engine import rag_engine
from rag_service.router.entity_extractor import _generate_clean_short_code
from rag_service.router.schemas import ActionType, EntityLevel, StructuredRoadmapAction
from rag_service.state.session_store import session_store
from rag_service.tools import get_adapter


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
    ) -> Tuple[bool, str]:
        """Execute action, update state machine, and sync RAG index.

        Automatically falls back to SqliteAdapter if the HTTP API connection fails.
        Returns (success: bool, result_message: str).
        """
        adapter = self.adapter
        try:
            return await self._execute_inner(adapter, action, session_id)
        except Exception as exc:
            err_str = str(exc)
            # If network / HTTP connection error occurred and adapter is not SQLite, fallback to SqliteAdapter
            if any(k in err_str.lower() for k in ["connection", "connect", "timeout", "network", "errno"]):
                from rag_service.adapters.sqlite_adapter import SqliteAdapter
                if not isinstance(adapter, SqliteAdapter):
                    print(f"[ActionExecutor] HTTP connection failed ({exc}). Auto-falling back to direct SqliteAdapter...")
                    try:
                        sqlite_adapter = SqliteAdapter()
                        return await self._execute_inner(sqlite_adapter, action, session_id)
                    except Exception as fallback_exc:
                        return False, f"❌ Lỗi khi thực thi: {fallback_exc}"

            return False, f"❌ Lỗi khi thực thi: {exc}"

    async def _execute_inner(
        self,
        adapter: Any,
        action: StructuredRoadmapAction,
        session_id: str,
    ) -> Tuple[bool, str]:
        level = action.entity_level
        act_type = action.action

        # ── 1. TOPIC LEVEL ────────────────────────────────────────────────
        if level == EntityLevel.TOPIC:
            if act_type == ActionType.CREATE:
                created_topics = []
                for ent in action.entities:
                    res = await adapter.create_topic(
                        title=ent.title,
                        short_code=ent.short_code or "TOP",
                        description=ent.description or "",
                    )
                    created_slug = res.get("slug", "")
                    session_store.set_active_topic(session_id, slug=created_slug, title=ent.title)
                    created_topics.append((ent.title, ent.short_code, created_slug))

                # Background sync RAG
                asyncio.create_task(rag_engine.sync_live_database())

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
                ok = await adapter.delete_topic(slug=target_ident)
                if not ok and short_code and short_code.lower() != target_ident.lower():
                    ok = await adapter.delete_topic(slug=short_code)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    return True, f"🗑️ Đã xóa topic `{target_ident}` khỏi hệ thống."
                return False, f"⚠️ Không tìm thấy topic `{target_ident}` trong hệ thống (hoặc topic đã bị xóa trước đó)."


        # ── 2. LAYER LEVEL ────────────────────────────────────────────────
        elif level == EntityLevel.LAYER:
            topic_slug = action.target_parent_identifier
            if not topic_slug:
                return False, "❌ Không tìm thấy Topic đích để tạo Layer. Vui lòng chỉ định rõ tên topic."

            if act_type == ActionType.CREATE:
                created_layers = []
                topic = await adapter.get_topic(topic_slug)
                existing = len((topic or {}).get("layers") or [])
                for idx, ent in enumerate(action.entities, 1):
                    code = (ent.short_code or _generate_clean_short_code(ent.title))[:3].upper()
                    short_tag = ent.short_tag or f"{existing + idx:02d}-{code}"
                    res = await adapter.create_layer(
                        topic_slug=topic_slug,
                        title=ent.title,
                        short_tag=short_tag,
                        subtitle=ent.description or "",
                    )
                    layer_id = res.get("id", short_tag)
                    session_store.set_active_layer(session_id, layer_id=layer_id, title=ent.title)
                    created_layers.append((ent.title, short_tag))

                asyncio.create_task(rag_engine.sync_live_database())

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
                layer_id = action.target_parent_identifier or (action.entities[0].title if action.entities else "")
                ok = await adapter.delete_layer(layer_id=layer_id)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    return True, f"🗑️ Đã xóa layer `{layer_id}` khỏi hệ thống."
                return False, f"⚠️ Không tìm thấy layer `{layer_id}` trong hệ thống."

        # ── 3. GROUP LEVEL ────────────────────────────────────────────────
        elif level == EntityLevel.GROUP:
            layer_id = action.target_parent_identifier
            if not layer_id:
                return False, "❌ Không tìm thấy Layer đích để tạo Group."

            if act_type == ActionType.CREATE:
                created_groups = []
                for ent in action.entities:
                    res = await adapter.create_group(
                        layer_id=layer_id,
                        title=ent.title,
                        level=ent.level or "core",
                    )
                    created_groups.append(ent.title)

                asyncio.create_task(rag_engine.sync_live_database())
                bullets = "\n".join([f"- **{g}**" for g in created_groups])
                return True, (
                    f"✅ Đã tạo thành công {len(created_groups)} group trong layer `{layer_id}`:\n{bullets}"
                )

            elif act_type == ActionType.DELETE:
                group_id = action.target_parent_identifier or (action.entities[0].title if action.entities else "")
                ok = await adapter.delete_group(group_id=group_id)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    return True, f"🗑️ Đã xóa group `{group_id}`."
                return False, f"⚠️ Không tìm thấy group `{group_id}` trong hệ thống."

        # ── 4. ITEM LEVEL ─────────────────────────────────────────────────
        elif level == EntityLevel.ITEM:
            layer_id = action.target_parent_identifier
            if not layer_id:
                return False, "❌ Không tìm thấy Layer đích để thêm bài học (Item)."

            if act_type == ActionType.CREATE:
                created_items = []
                for ent in action.entities:
                    res = await adapter.create_item(
                        layer_id=layer_id,
                        level=ent.level or "core",
                        title=ent.title,
                        description=ent.description or "",
                    )
                    created_items.append(ent.title)

                asyncio.create_task(rag_engine.sync_live_database())
                bullets = "\n".join([f"- **{i}**" for i in created_items])
                ctx = session_store.get_or_create(session_id)
                layer_label = (
                    f"**{ctx.active_layer_title}**"
                    if ctx.active_layer_id == layer_id and ctx.active_layer_title
                    else f"`{layer_id}`"
                )
                return True, (
                    f"✅ Đã thêm thành công {len(created_items)} bài học vào layer {layer_label}:\n{bullets}\n\n"
                    f"Nội dung đã được lưu vào hệ thống."
                )

            elif act_type == ActionType.DELETE:
                item_id = action.target_parent_identifier or (action.entities[0].title if action.entities else "")
                ok = await adapter.delete_item(item_id=item_id)
                asyncio.create_task(rag_engine.sync_live_database())
                if ok:
                    return True, f"🗑️ Đã xóa bài học `{item_id}`."
                return False, f"⚠️ Không tìm thấy bài học `{item_id}` trong hệ thống."

        return False, f"Thao tác {act_type.value} trên cấp {level.value} chưa được hỗ trợ."

