"""Roadmap actions for the agent: asking the user to pick a topic or layer, and the roadmap greeting.

Mixed into NextGenRoadmapAgent. These methods read the roadmap's topics and layers, so they belong to
the roadmap domain, not to the generic orchestrator in rag_service/agent.py.
"""

from __future__ import annotations

from typing import AsyncGenerator, Optional

from rag_service.domains.roadmap.router.schemas import ActionType, StructuredRoadmapAction
from rag_service.tools import get_adapter
from rag_service.tools.layer_resolver import LayerResolution

# Words that point back at the layer/entity in context ("tạo bài đó" = the open layer)
ANAPHORA_TARGETS = ("CONTEXT_ACTIVE", "đó", "nó", "this", "it")
LAYER_VERBS = {ActionType.CREATE: "tạo", ActionType.DELETE: "xóa", ActionType.UPDATE: "sửa"}


async def _example_names() -> tuple[str, str]:
    """A topic slug and layer title that exist, so copied examples work.

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
    return topic_slug, layer_title


class RoadmapAgentActions:
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
            "1. Tạo layer mới theo tên bạn nhập — gõ `tạo layer <tên>`\n"
            "2. Hoặc gõ số thứ tự của layer có sẵn"
        )
        async for ev in self._stream_text(ask, delay):
            yield ev

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
        """Greeting whose examples name a topic and layer that exist, so they work when copied."""
        topic_slug, layer_title = await _example_names()
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

    async def _help_reply(self) -> str:
        """Answer to "làm được gì" / "cách thêm bài vào layer": every command, with names that exist.

        Fixed text, not the LLM: the commands must match what the router and extractor accept.
        """
        topic_slug, layer_title = await _example_names()
        return (
            "Tôi quản lý roadmap học tập và tra cứu bài học trong đó. Gõ lệnh theo mẫu:\n\n"
            "**Tra cứu**\n"
            "- 🔎 `tìm bài về Docker` · `topic AI có những bài gì`\n\n"
            "**Thêm mới**\n"
            "- 🗺️ Topic: `tạo topic <tên topic>`\n"
            f"- 📑 Layer: `tạo layer <tên layer> trong topic {topic_slug}`\n"
            f"- 📖 Bài học: `thêm bài <tên bài> vào layer {layer_title}`\n\n"
            "**Sửa, chuyển, xóa**\n"
            "- ✏️ `đổi tên bài <tên cũ> thành <tên mới>`\n"
            f"- 🔀 `chuyển bài <tên bài> sang layer {layer_title}`\n"
            "- 🗑️ `xóa bài <tên bài>` (luôn hỏi xác nhận trước khi xóa)\n\n"
            "**Lập kế hoạch**\n"
            "- 📋 `/plan Lộ trình Next.js Fullstack`\n\n"
            "_Tên đã có sẵn sẽ không bị tạo trùng. Lệnh hỏi dạng \"… được không\" sẽ hiện thẻ xác nhận trước khi chạy._"
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
