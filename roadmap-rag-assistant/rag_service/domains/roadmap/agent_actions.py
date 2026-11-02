"""Roadmap actions for the agent: asking the user to pick a topic, and the roadmap greeting and help (ADR-0009).

Mixed into NextGenRoadmapAgent. These methods read the roadmap's topics and sections, so they belong to the
roadmap domain, not to the generic orchestrator in rag_service/agent.py.
"""

from __future__ import annotations

from typing import AsyncGenerator, Optional

from rag_service.domains.roadmap.router.grounding import (
    CREATE_TOPIC_EXAMPLE,
    example_blocks,
    plan_examples,
    search_examples,
    topic_examples,
)
from rag_service.domains.roadmap.router.schemas import ActionType, StructuredRoadmapAction
from rag_service.tools import get_adapter

# Words that point back at the topic in context ("thêm bài đó" = the open topic)
ANAPHORA_TARGETS = ("CONTEXT_ACTIVE", "đó", "nó", "this", "it")
ITEM_VERBS = {ActionType.CREATE: "thêm", ActionType.DELETE: "xóa", ActionType.UPDATE: "sửa"}
EMPTY_ROADMAP_NOTE = "_Roadmap chưa có bài nào để tra cứu. Tạo topic và bài học trước, tôi sẽ gợi ý tra cứu từ chính chúng._"


def _labelled(label: str, *commands: str) -> str:
    """A label line, then its example commands as blocks the widget can copy or send. Empty without commands."""
    return f"{label}\n\n{example_blocks(*commands)}" if commands else ""


async def _example_names() -> tuple[str, str]:
    """A topic slug and a section name that exist, so copied examples work.

    With no data (or the API down) the examples keep <placeholders> instead of made-up names.
    """
    topic_slug, section = "<slug topic>", "<tên mục>"
    try:
        adapter = get_adapter()
        topics = await adapter.list_topics()
        if topics:
            topic_slug = topics[0].get("slug") or topic_slug
            names = [s for s in ((await adapter.get_topic(topic_slug) or {}).get("sections") or []) if s]
            if names:
                section = names[0]
    except Exception as exc:
        print(f"[agent] Greeting examples use placeholders: {exc}")
    return topic_slug, section


class RoadmapAgentActions:
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
        """Ask which topic a lesson belongs to, listing the existing topics. Nothing is written."""
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
        verb = ITEM_VERBS.get(action.action, "")
        titles = ", ".join(e.title for e in action.entities) or "<tên bài>"
        ask = (
            f"{head}\n\n**Các topic hiện có:**\n{listing}\n\n"
            "Hãy gửi lại kèm tên topic, ví dụ:\n\n"
            + example_blocks(f"{verb} bài {titles} vào topic <slug>")
        )
        async for ev in self._stream_text(ask, delay):
            yield ev

    async def _greeting_reply(self) -> str:
        """Greeting whose examples name a topic and section that exist, so they work when copied."""
        topic_slug, section = await _example_names()
        sections = [
            "Xin chào! Tôi là **Abot** — trợ lý quản lý hệ thống tài liệu & lộ trình học tập. Bạn có thể yêu cầu tôi:",
            _labelled("🗺️ **Tạo topic**", CREATE_TOPIC_EXAMPLE),
            _labelled("📖 **Thêm bài học**", f"thêm bài <tên bài> vào topic {topic_slug} mục {section}"),
            "_Tên đã có sẵn sẽ không bị tạo trùng._",
        ]
        return "\n\n".join(s for s in sections if s)

    async def _help_reply(self) -> str:
        """Answer to "làm được gì" / "cách thêm bài": every command, with names that exist.

        Fixed text, not the LLM: the commands must match what the router and extractor accept.
        """
        topic_slug, section = await _example_names()
        reading = [
            _labelled("🔎 **Tra cứu**", *search_examples(), *topic_examples()),
            _labelled("🧭 **Gợi ý bài nên học**", *plan_examples()),
        ]
        sections = [
            "Tôi quản lý roadmap học tập và tra cứu bài học trong đó. Gõ lệnh theo mẫu:",
            *([s for s in reading if s] or [EMPTY_ROADMAP_NOTE]),
            _labelled(
                "➕ **Thêm mới**",
                CREATE_TOPIC_EXAMPLE,
                f"thêm bài <tên bài> vào topic {topic_slug}",
                f"thêm bài <tên bài> vào topic {topic_slug} mục {section}",
            ),
            _labelled(
                "🗑️ **Xóa** (luôn hỏi xác nhận trước)",
                "xóa bài <tên bài>",
                "xóa topic <slug topic>",
            ),
            "_Tên đã có sẵn sẽ không bị tạo trùng. Lệnh hỏi dạng \"… được không\" sẽ hiện thẻ xác nhận trước khi chạy._",
        ]
        return "\n\n".join(s for s in sections if s)
