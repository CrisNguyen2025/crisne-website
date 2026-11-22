"""Lesson rename and section move through the agent (owner only, after a preview), ADR-0009.

Mixed into NextGenRoadmapAgent. Runs before the router (it writes, after "ok" through commands.handle_pending).
The preview emits both `editable_titles` and `editable_target` (`section`) so the Owner can adjust either field
before confirming. Actual `update_item` writes stay in commands.handle_pending (write layer invariant).
"""

from __future__ import annotations

import re
from typing import AsyncGenerator, Optional

from rag_service.adapters.errors import normalize_title
from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.lesson_content import matches_page_item
from rag_service.domains.roadmap.lesson_status import parse_status_change_request
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.grounding import legacy_level_reply
from rag_service.domains.roadmap.router.understanding import understand
from rag_service.domains.roadmap.router.vietnamese import clean_conversational_fillers, normalize_vietnamese
from rag_service.domains.roadmap.sections import GENERAL_SECTION
from rag_service.tools import get_adapter
from rag_service.tools.topic_resolver import (
    describe_unresolved_topic,
    resolve_lesson,
    resolve_topic,
)

_QUOTES = "\"'`“”‘’«»"
_POINTING_LESSON = {
    "này", "nay", "đó", "do", "đây", "day", "hiện tại", "hien tai", "đang mở", "dang mo",
    "vừa tạo", "vua tao", "vừa thêm", "vua them", "nó", "no", "this", "it",
}
_THIS_TOPIC = {"này", "nay", "đó", "do", "nó", "hiện tại", "hien tai", "đang mở", "dang mo", "this", "it"}

_MULTI_CLAUSE_RE = re.compile(
    r"(?:;|\n|\s*,?\s*\b(?:rồi|roi|sau\s+đó|sau\s+do|and\s+then|then)\b\s*)"
    r"(?:hãy\s+|hay\s+)?(?:tạo|tao|thêm|them|xóa|xoá|xoa|sửa|sua|đổi|doi|chuyển|chuyen|"
    r"tìm|tim|liệt\s+kê|liet\s+ke|xem|giải\s+thích|giai\s+thich|list|find|search|create|add|delete)\b",
    re.IGNORECASE,
)

_TOPIC_CLAUSE = re.compile(
    r"\s+(?:trong|của|cua|ở|tại|tai|thuộc|thuoc)\s+(?:topic|lộ\s+trình|lo\s+trinh|chủ\s+đề|chu\s+de)\s+"
    r"(?P<topic>.+?)(?=\s+(?:thành|thanh|sang|vào|vao|qua|về|ve|->|→)\s|\s*[.!?]*\s*$)",
    re.IGNORECASE,
)

_LEADING_REQUEST = re.compile(r"^(?:(?:bạn|mình|tôi|anh|em)\s+)?có\s+thể\s+", re.IGNORECASE)

_MOVE_SECTION = re.compile(
    r"^\s*(?:hãy\s+|hay\s+|vui\s+lòng\s+|vui\s+long\s+|giúp\s+(?:tôi|mình)\s+)?"
    r"(?:chuyển|chuyen|đưa|dua|dời|doi|xếp|xep|gán|gan|move)\s+"
    r"(?:bài(?:\s+học)?|bai(?:\s+hoc)?|lesson|item)\s+(?P<src>.+?)\s+"
    r"(?:sang|vào|vao|qua|về|ve|tới|toi|đến|den|to|into)\s+(?:mục|muc|section)\s+(?P<sec>.+?)\s*[.!?]*\s*$",
    re.IGNORECASE,
)

_CLEAR_SECTION = re.compile(
    r"^\s*(?:hãy\s+|hay\s+|vui\s+lòng\s+)?"
    r"(?:bỏ|bo|gỡ|go|xóa|xoá|xoa)\s+(?:mục|muc|section)\s+(?:của|cua|cho)\s+"
    r"(?:bài(?:\s+học)?|bai(?:\s+hoc)?|lesson|item)\s+(?P<src>.+?)\s*[.!?]*\s*$",
    re.IGNORECASE,
)

_RENAME_LESSON = re.compile(
    r"^\s*(?:hãy\s+|hay\s+|vui\s+lòng\s+|vui\s+long\s+|giúp\s+(?:tôi|mình)\s+)?"
    r"(?:(?:đổi|doi|sửa|sua|cập\s+nhật|cap\s+nhat|điều\s+chỉnh|dieu\s+chinh)\s+(?:lại\s+|lai\s+)?(?:tên\s+|ten\s+)?(?:của\s+|cua\s+)?|rename\s+)"
    r"(?:bài(?:\s+học)?|bai(?:\s+hoc)?|lesson|item)\s+(?P<src>.+?)\s+"
    r"(?:thành|thanh|sang|là|la|to|->|→)\s+(?P<dst>.+?)\s*[.!?]*\s*$",
    re.IGNORECASE,
)

_SECTION_DST_PREFIX = re.compile(r"^(?:mục|muc|section)\s+(?P<sec>.+)$", re.IGNORECASE)
_DISALLOWED_DST_PREFIX = re.compile(
    r"^(?:topic|lộ\s+trình|lo\s+trinh|chủ\s+đề|chu\s+de|roadmap|layer|group)\b",
    re.IGNORECASE,
)


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().strip(_QUOTES).strip())


def _clean_topic(value: str) -> Optional[str]:
    cleaned = _clean_text(value)
    if not cleaned or cleaned.lower() in _THIS_TOPIC:
        return None
    return cleaned


def _clean_source(value: str) -> Optional[str]:
    cleaned = _clean_text(value)
    if not cleaned:
        return None
    return "" if cleaned.lower() in _POINTING_LESSON else cleaned


def _is_general_section(name: str) -> bool:
    return fold(name).lower().strip() in ("", "chung", "none")


def parse_lesson_edit(text: str) -> Optional[dict]:
    """Parse a lesson rename or section move command, or None when the message is something else."""
    raw = normalize_vietnamese(text).strip()
    if not raw:
        return None

    u = understand(raw)
    if u.write_blocker or u.act.value in ("question", "plan") or u.target.value == "off_topic":
        return None
    if _MULTI_CLAUSE_RE.search(raw):
        return None
    if parse_status_change_request(raw) is not None or legacy_level_reply(raw) is not None:
        return None

    cleaned = clean_conversational_fillers(raw)
    cleaned = _LEADING_REQUEST.sub("", cleaned).strip()
    cleaned = clean_conversational_fillers(cleaned)

    topic: Optional[str] = None
    if (tm := _TOPIC_CLAUSE.search(cleaned)) is not None:
        topic = _clean_topic(tm.group("topic"))
        cleaned = (cleaned[: tm.start()] + cleaned[tm.end() :]).strip()

    if parse_status_change_request(cleaned) is not None:
        return None

    if (m := _MOVE_SECTION.match(cleaned)) is not None:
        src = _clean_source(m.group("src"))
        sec = _clean_text(m.group("sec"))
        if src is None or not sec:
            return None
        clear = _is_general_section(sec)
        return {
            "src": src,
            "new_title": None,
            "new_section": None if clear else sec,
            "clear_section": clear,
            "topic": topic,
        }

    if (m := _CLEAR_SECTION.match(cleaned)) is not None:
        src = _clean_source(m.group("src"))
        if src is None:
            return None
        return {
            "src": src,
            "new_title": None,
            "new_section": None,
            "clear_section": True,
            "topic": topic,
        }

    if (m := _RENAME_LESSON.match(cleaned)) is not None:
        src = _clean_source(m.group("src"))
        dst = _clean_text(m.group("dst"))
        if src is None or not dst or _DISALLOWED_DST_PREFIX.match(dst):
            return None
        if (sec_m := _SECTION_DST_PREFIX.match(dst)) is not None:
            sec = _clean_text(sec_m.group("sec"))
            if not sec:
                return None
            clear = _is_general_section(sec)
            return {
                "src": src,
                "new_title": None,
                "new_section": None if clear else sec,
                "clear_section": clear,
                "topic": topic,
            }
        return {
            "src": src,
            "new_title": dst,
            "new_section": None,
            "clear_section": False,
            "topic": topic,
        }

    return None


def _unresolved_lesson_reply(name: str, candidates: list[dict]) -> str:
    if not candidates:
        return f"Không tìm thấy bài học `{name}` trong Roadmap nên mình chưa sửa gì. Bạn kiểm tra lại tên giúp mình nhé."
    listing = "\n".join(f"- {c['title']} (mục {c.get('section') or GENERAL_SECTION})" for c in candidates[:10])
    return f"Có nhiều bài học khớp với `{name}`:\n{listing}\n\nBạn gửi lại tên đầy đủ của bài học cần sửa nhé."


def _match_lesson_in_topic(topic: dict, name: str) -> tuple[Optional[dict], list[dict]]:
    """Find one lesson by id, exact title, or whole-word match inside a topic dict."""
    items = topic.get("items") or []
    raw = (name or "").strip()
    for item in items:
        if item.get("id") == raw:
            return item, []

    wanted = raw.lower()
    exact = [i for i in items if (i.get("title") or "").strip().lower() == wanted]
    if len(exact) == 1:
        return exact[0], []
    if len(exact) > 1:
        return None, exact

    partial = [
        i for i in items
        if re.search(rf"(?<!\w){re.escape(wanted)}(?!\w)", (i.get("title") or "").strip().lower()) is not None
    ]
    if len(partial) == 1:
        return partial[0], []
    if len(partial) > 1:
        return None, partial
    return None, []


async def _find_topic_and_lesson(
    lesson_id: str, preferred_slugs: list[Optional[str]]
) -> Optional[tuple[dict, dict]]:
    adapter = get_adapter()
    tried: set[str] = set()
    for slug in preferred_slugs:
        if not slug or slug in tried:
            continue
        tried.add(slug)
        detail = await adapter.get_topic(slug)
        if not detail:
            continue
        match = next((i for i in detail.get("items") or [] if i.get("id") == lesson_id), None)
        if match is not None:
            return detail, match

    for topic in await adapter.list_topics():
        slug = topic.get("slug")
        if not slug or slug in tried:
            continue
        tried.add(slug)
        detail = await adapter.get_topic(slug)
        if not detail:
            continue
        match = next((i for i in detail.get("items") or [] if i.get("id") == lesson_id), None)
        if match is not None:
            return detail, match
    return None


class LessonEditCommands:
    async def handle_lesson_edit(
        self, *, content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Preview renaming a lesson or moving it to another section. Runs before the router."""
        edit = parse_lesson_edit(content)
        if edit is None:
            return
        outcome["handled"] = True

        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return

        adapter = get_adapter()
        page_slug = (page_context or {}).get("roadmapSlug")
        page_item_id = ((page_context or {}).get("itemId") or "").strip()

        target_topic: Optional[dict] = None
        if edit["topic"]:
            found_topic = await resolve_topic(edit["topic"])
            if found_topic.status != "found" or not found_topic.slug:
                msg = (
                    "⚠️ Hiện chưa tải được danh sách topic. Bạn thử lại sau ít phút nhé."
                    if found_topic.status == "unavailable"
                    else describe_unresolved_topic(edit["topic"], found_topic)
                )
                async for ev in self._stream_text(msg, delay):
                    yield ev
                return
            target_topic = await adapter.get_topic(found_topic.slug)
            if target_topic is None:
                async for ev in self._stream_text(f"⚠️ Không tìm thấy topic `{edit['topic']}`.", delay):
                    yield ev
                return

        topic: Optional[dict] = None
        lesson: Optional[dict] = None

        if edit["src"] == "":
            active_item_ref = page_item_id or (session_ctx.active_lesson_id or "").strip()
            if not active_item_ref:
                async for ev in self._stream_text(
                    "Chưa xác định được bài học bạn đang mở. Hãy mở trang bài học hoặc nêu rõ tên bài cần sửa.",
                    delay,
                ):
                    yield ev
                return
            preferred_slug = page_slug or session_ctx.active_topic_slug
            if target_topic is not None:
                topic = target_topic
                lesson = next((i for i in topic.get("items") or [] if matches_page_item(i, active_item_ref)), None)
            elif preferred_slug:
                detail = await adapter.get_topic(preferred_slug)
                if detail:
                    topic = detail
                    lesson = next((i for i in detail.get("items") or [] if matches_page_item(i, active_item_ref)), None)
            if lesson is None and target_topic is None:
                for t in await adapter.list_topics():
                    slug = t.get("slug")
                    if not slug or slug == preferred_slug:
                        continue
                    detail = await adapter.get_topic(slug)
                    if not detail:
                        continue
                    found_item = next((i for i in detail.get("items") or [] if matches_page_item(i, active_item_ref)), None)
                    if found_item is not None:
                        topic, lesson = detail, found_item
                        break
            if lesson is None or topic is None:
                async for ev in self._stream_text(
                    "Không tìm thấy bài học bạn đang mở. Vui lòng nêu rõ tên bài cần sửa.", delay
                ):
                    yield ev
                return
        elif target_topic is not None:
            topic = target_topic
            lesson, candidates = _match_lesson_in_topic(topic, edit["src"])
            if lesson is None:
                async for ev in self._stream_text(_unresolved_lesson_reply(edit["src"], candidates), delay):
                    yield ev
                return
        else:
            preferred_slug = page_slug or session_ctx.active_topic_slug
            found_lesson = await resolve_lesson(edit["src"], topic_slug=preferred_slug)
            if found_lesson.status != "found" or not found_lesson.lesson_id:
                msg = (
                    "⚠️ Hiện chưa tải được danh sách bài học. Bạn thử lại sau ít phút nhé."
                    if found_lesson.status == "unavailable"
                    else _unresolved_lesson_reply(edit["src"], found_lesson.candidates)
                )
                async for ev in self._stream_text(msg, delay):
                    yield ev
                return
            located = await _find_topic_and_lesson(
                found_lesson.lesson_id, [page_slug, session_ctx.active_topic_slug]
            )
            if located is None:
                async for ev in self._stream_text(_unresolved_lesson_reply(edit["src"], []), delay):
                    yield ev
                return
            topic, lesson = located

        topic_slug = topic.get("slug") or ""
        topic_title = topic.get("title") or topic_slug
        old_title = (lesson.get("title") or "").strip()
        old_section = lesson.get("section") or None
        existing_sections = [s for s in (topic.get("sections") or []) if s]

        proposed_title = edit["new_title"] if edit["new_title"] is not None else old_title
        if edit["clear_section"]:
            proposed_section = None
        elif edit["new_section"] is not None:
            wanted_sec = normalize_title(edit["new_section"])
            matched_sec = next((s for s in existing_sections if normalize_title(s) == wanted_sec), None)
            proposed_section = matched_sec or edit["new_section"]
        else:
            proposed_section = old_section

        if proposed_title == old_title and proposed_section == old_section:
            async for ev in self._stream_text(
                f"Bài **{old_title}** đã có đúng tên và mục này rồi nên mình chưa đổi gì.", delay
            ):
                yield ev
            return

        if proposed_title != old_title:
            dup = next(
                (
                    item for item in topic.get("items") or []
                    if item.get("id") != lesson.get("id")
                    and normalize_title(item.get("title") or "") == normalize_title(proposed_title)
                ),
                None,
            )
            if dup is not None:
                async for ev in self._stream_text(
                    f"ℹ️ Topic **{topic_title}** đã có bài **{dup.get('title')}**, không thể đổi trùng tên.",
                    delay,
                ):
                    yield ev
                return

        session_ctx.pending_lesson_edit = {
            "item_id": lesson.get("id"),
            "topic_slug": topic_slug,
            "topic_title": topic_title,
            "old_title": old_title,
            "old_section": old_section,
            "new_title": proposed_title,
            "new_section": proposed_section,
        }

        old_sec_label = old_section or GENERAL_SECTION
        new_sec_label = proposed_section or GENERAL_SECTION
        title_line = (
            f"- Tên bài: `{old_title}` → `{proposed_title}`"
            if proposed_title != old_title
            else f"- Tên bài: `{old_title}` _(giữ nguyên, có thể sửa bên dưới)_"
        )
        section_line = (
            f"- Mục: `{old_sec_label}` → `{new_sec_label}`"
            if proposed_section != old_section
            else f"- Mục: `{old_sec_label}` _(giữ nguyên, có thể sửa bên dưới)_"
        )
        preview = (
            f"✏️ **CHỈNH SỬA BÀI HỌC**\n\n"
            f"- Topic: **{topic_title}**\n"
            f"{title_line}\n"
            f"{section_line}\n\n"
            "👉 Bấm nút **[✅ Xác nhận thực hiện]** bên dưới hoặc gõ \"ok\" để tiến hành. Bấm **[❌ Hủy bỏ]** để hủy."
        )
        yield {
            "type": "action_preview",
            "action_id": session_ctx.session_id,
            "preview": preview,
            "editable_titles": [proposed_title],
            "editable_target": {"section": proposed_section or ""},
        }
        async for ev in self._stream_text(preview, delay):
            yield ev
