"""Lesson Status management (ADR-0010): read progress & change status with preview (owner only).

Provides pure sorting/filtering functions for:
- (a) What do I know about X ("tôi đang biết gì về X")
- (b) What to learn next ("nên học gì tiếp": learning first, then target)
- (c) Lessons needing review ("bài nào cần ôn lại": known sorted by statusUpdatedAt ascending, nulls first)
- (d) Lesson status change command with confirmation preview ("đánh dấu bài X là đang học")
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Optional, Sequence

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.tools import get_adapter
from rag_service.tools.topic_resolver import resolve_topic, topic_named_in_message

LESSON_STATUSES = ("known", "learning", "target")

LESSON_STATUS_LABEL = {
    "known": "Đã nắm",
    "learning": "Đang học",
    "target": "Mục tiêu",
}

# ── Pure Sorting and Filtering Functions (Step 1) ──────────────────────────


def _status_of(item: dict) -> str:
    status = item.get("status")
    return str(status).strip().lower() if status else "known"


def filter_and_sort_review_lessons(items: Sequence[dict]) -> list[dict]:
    """Filter 'known' lessons and sort: statusUpdatedAt null/empty first, then ascending."""
    known = [i for i in items if _status_of(i) == "known"]

    def _sort_key(item: dict) -> tuple[int, str]:
        ts = item.get("statusUpdatedAt")
        if not ts:
            return (0, "")
        return (1, str(ts))

    return sorted(known, key=_sort_key)


def filter_and_sort_next_lessons(items: Sequence[dict]) -> tuple[list[dict], list[dict]]:
    """Separate lessons into learning (first) and target (second)."""
    learning = [i for i in items if _status_of(i) == "learning"]
    target = [i for i in items if _status_of(i) == "target"]
    return learning, target


def filter_known_lessons(items: Sequence[dict]) -> list[dict]:
    """Filter lessons currently in 'known' status."""
    return [i for i in items if _status_of(i) == "known"]


def format_review_reply(items: Sequence[dict], topic_title: Optional[str] = None) -> str:
    """Format reply for query (c): lessons needing review."""
    header = f"📚 **Các bài cần ôn lại**"
    if topic_title:
        header += f" trong topic **{topic_title}**"
    header += " (ưu tiên bài lâu chưa ôn hoặc chưa có thời gian cập nhật):\n\n"

    if not items:
        where = f" trong topic '{topic_title}'" if topic_title else ""
        return f"Hiện chưa có bài nào ở trạng thái **Đã nắm** cần ôn lại{where}."

    lines = [header]
    for idx, item in enumerate(items, start=1):
        title = item.get("title") or item.get("id")
        topic_info = ""
        if not topic_title and (item.get("topic_title") or item.get("topic_slug")):
            topic_info = f" *(topic: {item.get('topic_title') or item.get('topic_slug')}*)"
        lines.append(f"{idx}. **{title}**{topic_info}")
    return "\n".join(lines)


def format_next_learning_reply(
    learning: Sequence[dict], target: Sequence[dict], topic_title: Optional[str] = None
) -> str:
    """Format reply for query (b): what to learn next."""
    if not learning and not target:
        where = f" trong topic '{topic_title}'" if topic_title else ""
        return f"Hiện chưa có bài nào ở trạng thái **Đang học** hoặc **Mục tiêu**{where}."

    header = f"🎯 **Gợi ý bài nên học tiếp**"
    if topic_title:
        header += f" trong topic **{topic_title}**"
    header += ":\n"
    parts = [header]

    if learning:
        parts.append("\n**Đang học (ưu tiên hoàn thành):**")
        for idx, item in enumerate(learning, start=1):
            title = item.get("title") or item.get("id")
            topic_info = ""
            if not topic_title and (item.get("topic_title") or item.get("topic_slug")):
                topic_info = f" *(topic: {item.get('topic_title') or item.get('topic_slug')}*)"
            parts.append(f"{idx}. **{title}**{topic_info}")

    if target:
        parts.append("\n**Mục tiêu tiếp theo:**")
        for idx, item in enumerate(target, start=1):
            title = item.get("title") or item.get("id")
            topic_info = ""
            if not topic_title and (item.get("topic_title") or item.get("topic_slug")):
                topic_info = f" *(topic: {item.get('topic_title') or item.get('topic_slug')}*)"
            parts.append(f"{idx}. **{title}**{topic_info}")

    return "\n".join(parts)


def format_what_i_know_reply(
    known: Sequence[dict],
    topic_title: str,
    learning: Sequence[dict] = (),
    target: Sequence[dict] = (),
) -> str:
    """Format reply for query (a): what do I know about topic X."""
    header = f"🧠 **Tiến độ học tập về topic {topic_title}:**\n"
    parts = [header]

    if known:
        parts.append(f"\n**Đã nắm ({len(known)} bài):**")
        for idx, item in enumerate(known, start=1):
            parts.append(f"{idx}. **{item.get('title') or item.get('id')}**")
    else:
        parts.append("\n**Đã nắm:** Chưa có bài nào.")

    if learning:
        parts.append(f"\n**Đang học ({len(learning)} bài):**")
        for idx, item in enumerate(learning, start=1):
            parts.append(f"{idx}. **{item.get('title') or item.get('id')}**")

    if target:
        parts.append(f"\n**Mục tiêu ({len(target)} bài):**")
        for idx, item in enumerate(target, start=1):
            parts.append(f"{idx}. **{item.get('title') or item.get('id')}**")

    return "\n".join(parts)


# ── Query Recognition & Parsing ────────────────────────────────────────────

_REVIEW_CUE = re.compile(
    r"\b(?:on\s+lai|can\s+on|on\s+tap|on\s+bai|bai\s+can\s+on|can\s+review|review\s+bai|can\s+nhac\s+on)\b"
)

_NEXT_CUE = re.compile(
    r"\b(?:hoc\s+gi\s+tiep|nen\s+hoc\s+gi|hoc\s+tiep|tiep\s+theo\s+nen\s+hoc|goi\s+y\s+hoc|hoc\s+cai\s+gi\s+tiep|can\s+hoc\s+gi\s+tiep|hoc\s+gi\s+bay\s+gio)\b"
)

_KNOWN_CUE = re.compile(
    r"\b(?:dang\s+biet\s+gi|da\s+biet\s+gi|da\s+nam\s+gi|da\s+nam\s+nhung\s+gi|nam\s+nhung\s+gi|biet\s+nhung\s+gi|da\s+hoc\s+nhung\s+gi|da\s+hoc\s+gi|tien\s+do\s+hoc|tien\s+do)\b"
)


def asks_review(text: str) -> bool:
    """True when the user asks which lessons to review (query c)."""
    flat = fold(normalize_vietnamese(text).lower())
    # Must not be a change request or tech question
    if re.search(r"\b(?:danh\s+dau|chuyen|dat|mark|set|doi|giai\s+thich|la\s+gi)\b", flat):
        return False
    return _REVIEW_CUE.search(flat) is not None


def asks_next_learning(text: str) -> bool:
    """True when the user asks what to learn next (query b)."""
    flat = fold(normalize_vietnamese(text).lower())
    if re.search(r"\b(?:danh\s+dau|chuyen|dat|mark|set|doi|giai\s+thich|la\s+gi)\b", flat):
        return False
    return _NEXT_CUE.search(flat) is not None


def asks_what_i_know(text: str) -> bool:
    """True when the user asks what they know / have learned about X (query a)."""
    flat = fold(normalize_vietnamese(text).lower())
    if re.search(r"\b(?:danh\s+dau|chuyen|dat|mark|set|doi)\b", flat):
        return False
    return _KNOWN_CUE.search(flat) is not None


# ── Status Change Command Parsing (Query d) ────────────────────────────────

_CHANGE_VERBS = r"(?:danh\s+dau|chuyen|dat|mark|set\s+status|set|doi\s+trang\s+thai|doi|thay\s+doi\s+trang\s+thai|thay\s+doi|cap\s+nhat\s+trang\s+thai)"

_STATUS_MAP = {
    "known": ["known", "da nam", "nam", "done", "hoan thanh"],
    "learning": ["learning", "dang hoc", "in progress", "dang lam"],
    "target": ["target", "muc tieu", "se hoc", "du dinh"],
}

_POINTING_WORDS = {"", "nay", "do", "day", "kia", "hien tai", "this", "it"}


@dataclass(frozen=True)
class StatusChangeRequest:
    lesson: str  # Lesson name or empty string if referring to current page lesson
    new_status: str  # "known" | "learning" | "target"
    topic_hint: Optional[str] = None


def _resolve_status_string(raw: str) -> Optional[str]:
    flat = fold(raw.lower()).strip()
    for status, phrases in _STATUS_MAP.items():
        for p in phrases:
            if flat == p or re.search(rf"\b{re.escape(p)}\b", flat):
                return status
    return None


_VERB = r"(?:đánh\s+dấu|danh\s+dau|chuyển|chuyen|đặt|dat|mark|set\s+status|set|đổi\s+trạng\s+thái|doi\s+trang\s+thai|đổi|doi|thay\s+đổi\s+trạng\s+thái|thay\s+doi\s+trang\s+thai|thay\s+đổi|thay\s+doi|cập\s+nhật\s+trạng\s+thái|cap\s+nhat\s+trang\s+thai)"
_CONN = r"(?:sang|thành|thanh|là|la|as|to|vào|vao)?\s*(?:trạng\s+thái\s+|trang\s+thai\s+)?"
_STAT = r"(?:đã\s+nắm|da\s+nam|known|done|hoàn\s+thành|hoan\s+thanh|đang\s+học|dang\s+hoc|learning|in\s+progress|mục\s+tiêu|muc\s+tieu|target|sẽ\s+học|se\s+hoc)"

_STATUS_CHANGE_RE = re.compile(
    rf"^\s*(?:hãy\s+|hay\s+|vui\s+lòng\s+|vui\s+long\s+)?{_VERB}\s+(?:trạng\s+thái\s+)?(?:bài\s+học\s+|bài\s+|bai\s+|lesson\s+|item\s+)?(?P<lesson>.+?)\s+{_CONN}(?P<status>{_STAT})\s*[.!?\s]*$",
    re.IGNORECASE,
)


def parse_status_change_request(text: str) -> Optional[StatusChangeRequest]:
    """Parse an explicit status-change command.

    Must contain an explicit change verb + lesson name + target status.
    Will NOT match explanatory questions like 'tôi đang học RAG, giải thích chunking'.
    """
    flat = fold(normalize_vietnamese(text).lower()).strip()

    # If it's a question seeking explanations, it's not a status change command
    if re.search(r"\b(?:giai\s+thich|la\s+gi|the\s+nao|huong\s+dan|tai\s+sao|so\s+sanh)\b", flat):
        return None

    m = _STATUS_CHANGE_RE.match(text.strip())
    if not m:
        return None

    raw_lesson = m.group("lesson").strip(" '\"`.:,")
    raw_status = m.group("status")
    resolved_status = _resolve_status_string(raw_status)
    if not resolved_status:
        return None

    if fold(raw_lesson.lower()) in _POINTING_WORDS:
        raw_lesson = ""

    return StatusChangeRequest(lesson=raw_lesson, new_status=resolved_status, topic_hint=None)


# ── LessonStatusCommands Mixin ─────────────────────────────────────────────


class LessonStatusCommands:
    async def _resolve_target_topic(
        self, topic_hint: Optional[str], content: str, page_context, session_ctx
    ) -> Optional[dict]:
        """Find the topic for status queries/commands."""
        adapter = get_adapter()
        page_slug = (page_context or {}).get("roadmapSlug")
        if page_slug:
            try:
                top = await adapter.get_topic(page_slug)
                if top:
                    return top
            except Exception:
                pass

        candidates = [topic_hint] if topic_hint else []
        candidates += [
            await topic_named_in_message(content),
            page_slug,
            session_ctx.active_topic_slug,
        ]
        for ref in candidates:
            if not ref:
                continue
            found = await resolve_topic(ref)
            if found.status == "found" and found.slug:
                return await adapter.get_topic(found.slug)
            try:
                top = await adapter.get_topic(ref)
                if top:
                    return top
            except Exception:
                pass
        return None

    async def handle_lesson_status(
        self,
        *,
        content: str,
        raw_content: str,
        page_context,
        session_ctx,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        """Handle (a)-(d) lesson status queries and changes.

        Sets outcome["handled"] = True when handled.
        """
        # 1. Status change command (d)
        req = parse_status_change_request(content)
        if req is not None:
            outcome["handled"] = True
            if not is_owner():
                async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                    yield ev
                return

            topic = await self._resolve_target_topic(req.topic_hint, content, page_context, session_ctx)
            if not topic:
                async for ev in self._stream_text(
                    "Chưa xác định được topic để đổi trạng thái bài. Hãy mở topic trên trang hoặc nêu tên topic trong câu lệnh.",
                    delay,
                ):
                    yield ev
                return

            items = topic.get("items") or []
            lesson = None
            if req.lesson:
                wanted = fold(req.lesson).lower()
                for item in items:
                    title_flat = fold(item.get("title", "")).lower()
                    if title_flat == wanted or wanted in title_flat:
                        lesson = item
                        break
            else:
                current_item_id = (page_context or {}).get("itemId")
                if current_item_id:
                    lesson = next((i for i in items if i.get("id") == current_item_id), None)

            if not lesson:
                msg = f"Không tìm thấy bài '{req.lesson}' trong topic '{topic.get('title')}'" if req.lesson else "Chưa xác định được bài học cần đổi trạng thái"
                async for ev in self._stream_text(msg + ". Vui lòng kiểm tra lại tên bài.", delay):
                    yield ev
                return

            current_status = _status_of(lesson)
            if current_status == req.new_status:
                curr_label = LESSON_STATUS_LABEL.get(current_status, current_status)
                async for ev in self._stream_text(
                    f"Bài **{lesson.get('title')}** đã ở trạng thái **{curr_label}** rồi, không cần đổi.", delay
                ):
                    yield ev
                return

            old_label = LESSON_STATUS_LABEL.get(current_status, current_status)
            new_label = LESSON_STATUS_LABEL.get(req.new_status, req.new_status)

            session_ctx.pending_status_change = {
                "item_id": lesson.get("id"),
                "item_title": lesson.get("title"),
                "topic_slug": topic.get("slug"),
                "old_status": current_status,
                "new_status": req.new_status,
            }

            preview_text = (
                f"🔄 **Đổi trạng thái bài học**\n\n"
                f"- **Bài:** {lesson.get('title')}\n"
                f"- **Topic:** {topic.get('title')}\n"
                f"- **Trạng thái cũ:** {old_label}\n"
                f"- **Trạng thái mới:** {new_label}\n\n"
                f"👉 Gõ **ok** để xác nhận thực hiện hoặc **hủy** để hủy bỏ."
            )

            yield {
                "type": "action_preview",
                "action_id": session_ctx.session_id,
                "preview": preview_text,
            }
            async for ev in self._stream_text(preview_text, delay):
                yield ev
            return

        # 2. Status queries (a), (b), (c)
        is_rev = asks_review(content)
        is_nxt = asks_next_learning(content)
        is_kwn = asks_what_i_know(content)

        if not (is_rev or is_nxt or is_kwn):
            return

        outcome["handled"] = True
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return

        adapter = get_adapter()

        # (a) What do I know about X
        if is_kwn:
            topic = await self._resolve_target_topic(None, content, page_context, session_ctx)
            if topic:
                items = topic.get("items") or []
                known = filter_known_lessons(items)
                learning, target = filter_and_sort_next_lessons(items)
                reply = format_what_i_know_reply(known, topic.get("title") or topic.get("slug"), learning, target)
            else:
                # If no specific topic, summarize across all topics
                all_topics = await adapter.export_full_hierarchy()
                all_items = []
                for t in all_topics:
                    for it in t.get("items") or []:
                        it_copy = dict(it)
                        it_copy["topic_title"] = t.get("title")
                        it_copy["topic_slug"] = t.get("slug")
                        all_items.append(it_copy)
                known = filter_known_lessons(all_items)
                learning, target = filter_and_sort_next_lessons(all_items)
                reply = format_what_i_know_reply(known, "toàn bộ kho kiến thức", learning, target)

            yield {"type": "tool_start", "name": "get_lesson_status", "args": {"query": "what_i_know"}}
            yield {"type": "tool_end", "name": "get_lesson_status", "result": reply}
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        # (c) What lessons need review
        if is_rev:
            topic = await self._resolve_target_topic(None, content, page_context, session_ctx)
            if topic:
                items = topic.get("items") or []
                sorted_review = filter_and_sort_review_lessons(items)
                reply = format_review_reply(sorted_review, topic.get("title"))
            else:
                all_topics = await adapter.export_full_hierarchy()
                all_items = []
                for t in all_topics:
                    for it in t.get("items") or []:
                        it_copy = dict(it)
                        it_copy["topic_title"] = t.get("title")
                        it_copy["topic_slug"] = t.get("slug")
                        all_items.append(it_copy)
                sorted_review = filter_and_sort_review_lessons(all_items)
                reply = format_review_reply(sorted_review)

            yield {"type": "tool_start", "name": "get_lesson_status", "args": {"query": "review"}}
            yield {"type": "tool_end", "name": "get_lesson_status", "result": reply}
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        # (b) What to learn next
        if is_nxt:
            topic = await self._resolve_target_topic(None, content, page_context, session_ctx)
            if topic:
                items = topic.get("items") or []
                learning, target = filter_and_sort_next_lessons(items)
                reply = format_next_learning_reply(learning, target, topic.get("title"))
            else:
                all_topics = await adapter.export_full_hierarchy()
                all_items = []
                for t in all_topics:
                    for it in t.get("items") or []:
                        it_copy = dict(it)
                        it_copy["topic_title"] = t.get("title")
                        it_copy["topic_slug"] = t.get("slug")
                        all_items.append(it_copy)
                learning, target = filter_and_sort_next_lessons(all_items)
                reply = format_next_learning_reply(learning, target)

            yield {"type": "tool_start", "name": "get_lesson_status", "args": {"query": "next_learning"}}
            yield {"type": "tool_end", "name": "get_lesson_status", "result": reply}
            async for ev in self._stream_text(reply, delay):
                yield ev
            return
