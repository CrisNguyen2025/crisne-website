"""Deterministic Slash Action dispatcher for Abot Composer (ADR-0021).

Handles leading `/command [args]` messages before IntentRouter so UI Actions never suffer
classification drift while preserving all Owner authorization checks and `Preview -> ok`
confirmation gates.
"""

from __future__ import annotations

import re
from typing import Any, AsyncGenerator, Optional

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.host import AgentHostMixin
from rag_service.domains.roadmap.lesson_status import (
    LESSON_STATUS_LABEL,
    _all_owner_items,
    _status_of,
)
from rag_service.tools import get_adapter

_SLASH_CMD_RE = re.compile(r"^\s*/(?P<cmd>[a-zA-Z][a-zA-Z0-9_-]*)(?:\s+(?P<arg>.*))?$", re.DOTALL)
_QUIZ_LESSON_PREFIX_RE = re.compile(r"^(?:bai|bài)\s+", re.IGNORECASE)

_VALID_STATUS_FILTERS = frozenset({"target", "learning", "known"})
KNOWN_SLASH_COMMANDS = frozenset({
    "quiz",
    "topics",
    "status",
    "review",
    "next",
    "draft",
    "remember",
    "gmail",
    "webmcp",
    "help",
})


def parse_slash_command(raw_text: str) -> Optional[tuple[str, str]]:
    """Parse known leading `/cmd [arg]`; unknown slash prefixes fall through to routing."""
    m = _SLASH_CMD_RE.match(raw_text or "")
    if not m:
        return None
    cmd = m.group("cmd").lower()
    if cmd not in KNOWN_SLASH_COMMANDS:
        return None
    return cmd, (m.group("arg") or "").strip()


def apply_slash_rewrite(
    raw_content: str,
    connectors: Optional[list[str]],
) -> tuple[str, list[str]]:
    """Rewrite `/draft <arg>` and `/gmail <arg>` into routed prompts when Owner is authorized."""
    active_connectors = list(connectors or [])
    parsed = parse_slash_command(raw_content)
    if parsed is None or not is_owner():
        return raw_content, active_connectors

    cmd, arg = parsed
    if cmd == "draft" and arg:
        return f"tạo preview {arg}", active_connectors
    if cmd == "gmail":
        if "gmail" not in active_connectors:
            active_connectors.append("gmail")
        rewritten = arg or "Tóm tắt các email mới nhất liên quan đến học tập của tôi"
        return rewritten, active_connectors
    return raw_content, active_connectors


def _format_slash_status_reply(items: list[dict], topic_title: Optional[str], status_filter: str) -> str:
    counts = {"target": 0, "learning": 0, "known": 0}
    filtered: list[dict] = []
    for item in items:
        st = _status_of(item)
        if st in counts:
            counts[st] += 1
        if status_filter and st == status_filter:
            filtered.append(item)

    scope = f"Topic **{topic_title}**" if topic_title else "**toàn bộ lộ trình**"
    header = (
        f"📊 **Thống kê trạng thái học tập — {scope}**\n\n"
        f"- ⏳ Chưa học (`target`): **{counts['target']}**\n"
        f"- 📖 Đang học (`learning`): **{counts['learning']}**\n"
        f"- ✅ Đã nắm (`known`): **{counts['known']}**"
    )
    if not status_filter:
        return header

    label = LESSON_STATUS_LABEL.get(status_filter, status_filter)
    if not filtered:
        return f"{header}\n\nHiện không có bài học nào ở trạng thái **{label}**."

    lines = [header, f"\n**Danh sách bài `{label}` ({len(filtered)}):**"]
    for item in filtered[:12]:
        topic_note = f" — *{item.get('topic_title')}*" if not topic_title and item.get("topic_title") else ""
        lines.append(f"- {item.get('title')}{topic_note}")
    if len(filtered) > 12:
        lines.append(f"- *…và {len(filtered) - 12} bài khác.*")
    return "\n".join(lines)


def _slash_help_text(cmd: str) -> str:
    owner_hint = (
        "\n- `/review` — Xem bài cần ôn hôm nay"
        "\n- `/next` — Gợi ý bài học tiếp theo"
        "\n- `/status [target|learning|known]` — Thống kê trạng thái bài học"
        "\n- `/draft <chủ đề>` — Soạn Preview tạo Topic/Lesson mới"
        "\n- `/remember <ghi chú>` — Lưu vào Owner Memory (qua duyệt)"
        "\n- `/gmail <câu hỏi>` — Tra cứu kèm ngữ cảnh Gmail đã kết nối"
        if is_owner()
        else ""
    )
    return (
        "**Các lệnh Slash khả dụng:**\n"
        "- `/topics` — Danh sách Topic hiện có"
        "\n- `/quiz <Topic>` — Gợi ý danh sách quiz phù hợp theo Topic"
        f"{owner_hint}"
    )


class SlashCommandMixin(AgentHostMixin):
    """Deterministically executes leading `/command` actions before routing."""

    async def _handle_slash_quiz(
        self,
        *,
        arg: str,
        page_context: Any,
        session_id: str,
        session_ctx: Any,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        if arg and _QUIZ_LESSON_PREFIX_RE.match(arg):
            async for ev in self.handle_quiz_command(
                content=f"quiz {arg}",
                page_context=page_context,
                session_id=session_id,
                session_ctx=session_ctx,
                delay=delay,
                outcome=outcome,
            ):
                yield ev
            return
        async for ev in self.handle_topic_quiz_menu(
            topic_ref=arg,
            page_context=page_context,
            session_id=session_id,
            session_ctx=session_ctx,
            delay=delay,
            outcome=outcome,
        ):
            yield ev

    async def _handle_slash_status(
        self,
        *,
        arg: str,
        page_context: Any,
        session_ctx: Any,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        status_filter = arg.lower() if arg.lower() in _VALID_STATUS_FILTERS else ""
        adapter = get_adapter()
        topic = await self._resolve_target_topic(None, arg, page_context, session_ctx)
        items = topic.get("items") or [] if topic else await _all_owner_items(adapter)
        topic_title = topic.get("title") if topic else None
        reply = _format_slash_status_reply(items, topic_title, status_filter)
        yield {"type": "tool_start", "name": "get_lesson_status", "args": {"filter": status_filter or "all"}}
        yield {"type": "tool_end", "name": "get_lesson_status", "result": reply}
        async for ev in self._stream_text(reply, delay):
            yield ev

    async def _handle_slash_review_or_next(
        self,
        *,
        is_review: bool,
        arg: str,
        page_context: Any,
        session_ctx: Any,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        query_kind, reply = await self._build_status_query_reply(
            get_adapter(), arg, page_context, session_ctx, is_kwn=False, is_rev=is_review
        )
        yield {"type": "tool_start", "name": "get_lesson_status", "args": {"query": query_kind}}
        yield {"type": "tool_end", "name": "get_lesson_status", "result": reply}
        async for ev in self._stream_text(reply, delay):
            yield ev

    async def _handle_slash_remember(
        self,
        *,
        arg: str,
        page_context: Any,
        session_ctx: Any,
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        if not arg:
            async for ev in self._stream_text(
                "Hãy nhập nội dung cần lưu sau lệnh `/remember`, ví dụ: `/remember Mình ưu tiên đọc ví dụ Go trước lý thuyết`.",
                delay,
            ):
                yield ev
            return
        mem_outcome = {"handled": False}
        async for ev in self.handle_memory_command(
            content=f"ghi nhớ: {arg}",
            page_context=page_context,
            session_ctx=session_ctx,
            delay=delay,
            outcome=mem_outcome,
        ):
            yield ev
        if not mem_outcome["handled"]:
            async for ev in self._stream_text(
                "Mình chưa nhận diện rõ nội dung ghi nhớ. Bạn thử viết thành câu ngắn gọn sau `/remember` nhé.",
                delay,
            ):
                yield ev

    def _static_slash_notice(self, cmd: str) -> str:
        if cmd == "draft":
            return (
                OWNER_ONLY_MESSAGE
                if not is_owner()
                else "Hãy nhập chủ đề sau `/draft`, ví dụ: `/draft Bài học RAG Chunking trong AI Architecture`."
            )
        if cmd == "gmail":
            return OWNER_ONLY_MESSAGE
        if cmd == "webmcp":
            return "Lệnh `/webmcp` chỉ chạy trên trình duyệt khi widget có kích hoạt WebMCP."
        return _slash_help_text(cmd)

    async def handle_slash_command(
        self,
        *,
        raw_content: str,
        page_context: Any,
        session_id: str,
        session_ctx: Any,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        parsed = parse_slash_command(raw_content)
        if parsed is None:
            return
        cmd, arg = parsed
        outcome["handled"] = True

        async_handlers = {
            "quiz": self._handle_slash_quiz(
                arg=arg, page_context=page_context, session_id=session_id,
                session_ctx=session_ctx, delay=delay, outcome=outcome,
            ),
            "topics": self.handle_listing(
                content="xem các topic", lower="xem các topic", delay=delay, outcome={"handled": False},
            ),
            "status": self._handle_slash_status(arg=arg, page_context=page_context, session_ctx=session_ctx, delay=delay),
            "review": self._handle_slash_review_or_next(
                is_review=True, arg=arg, page_context=page_context, session_ctx=session_ctx, delay=delay,
            ),
            "next": self._handle_slash_review_or_next(
                is_review=False, arg=arg, page_context=page_context, session_ctx=session_ctx, delay=delay,
            ),
            "remember": self._handle_slash_remember(arg=arg, page_context=page_context, session_ctx=session_ctx, delay=delay),
        }
        gen = async_handlers.get(cmd)
        if gen is not None:
            async for ev in gen:
                yield ev
            return
        async for ev in self._stream_text(self._static_slash_notice(cmd), delay):
            yield ev
