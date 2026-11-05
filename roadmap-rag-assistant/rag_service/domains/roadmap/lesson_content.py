"""Lesson content drafts: "thêm nội dung chi tiết cho bài X" (owner only).

Mixed into NextGenRoadmapAgent. The LLM drafts a body for a lesson that exists; the Owner sees the draft
as a preview and "ok" adds it to the end of the lesson. The write runs in commands.handle_pending, the
decision point that grants writes, through the `update_item_content` tool.

2026-11-05, live (trace 860725dc…): the message was read as "add a lesson" with no name and was asked back,
naming the topic the thread had open before instead of the page's.
"""

from __future__ import annotations

import asyncio
import html as html_lib
import re
import unicodedata
from dataclasses import dataclass
from typing import AsyncGenerator, Optional

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.grounding import example_blocks
from rag_service.tools import get_adapter
from rag_service.tools.topic_resolver import resolve_topic, topic_named_in_message

DRAFT_TIMEOUT = 90.0
MAX_EXISTING_CHARS = 4000

# Folded text ("them noi dung chi tiet cho bai …"): a draft verb, a content noun, then the lesson
_VERB = r"(?:them|viet|bo\s+sung|soan|tao|mo\s+rong|lam\s+giau|dien|write|draft|expand|add)"
_NOUN = r"(?:noi\s+dung|content|chi\s+tiet|phan\s+giai\s+thich)"
CONTENT_REQUEST = re.compile(
    rf"^\s*(?:hay\s+|giup\s+(?:minh|toi|em)\s+|vui\s+long\s+)?{_VERB}\s+(?:them\s+)?{_NOUN}"
    rf"(?:\s+chi\s+tiet)?\s+(?:(?:cho|vao|cua|trong|for|to|of)\s+)?(?:bai(?:\s+hoc)?|lesson)\b(?P<rest>.*)$"
)
_QUOTED = re.compile(r"[\"“”'‘’«»](.+?)[\"“”'‘’«»]")
_TOPIC_TAIL = re.compile(r"\s+(?:trong|o|thuoc|cua|in)\s+(?:topic\s+|chu\s+de\s+|lo\s+trinh\s+)?(?P<topic>.+)$")
_POINTING = {"", "nay", "do", "day", "kia", r"hien\s+tai", "this", "it"}


@dataclass(frozen=True)
class ContentRequest:
    lesson: str          # the lesson's name as written; "" means the page's lesson ("bài này")
    topic: Optional[str]  # a topic named in the message, or None


def _original_span(text: str, folded_start: int, folded_end: int) -> str:
    """The original text for a span of fold(text): fold keeps one character per character except marks."""
    out, i = [], 0
    for ch in text:
        width = len(fold(ch))
        if folded_start <= i < folded_end and width:
            out.append(ch)
        i += width
    return "".join(out)


def parse_content_request(text: str) -> Optional[ContentRequest]:
    """The lesson (and topic) a "thêm nội dung chi tiết cho bài X" message names; None for any other message."""
    flat = fold(text.strip())
    m = CONTENT_REQUEST.search(flat)
    if m is None:
        return None
    rest_original = _original_span(text.strip(), m.start("rest"), m.end("rest"))
    quoted = _QUOTED.search(rest_original)
    lesson = quoted.group(1).strip() if quoted else ""
    tail_from = quoted.end() if quoted else 0
    tail = rest_original[tail_from:]
    topic = None
    if t := _TOPIC_TAIL.search(fold(tail)):
        topic = _original_span(tail, t.start("topic"), t.end("topic")).strip(" .?!\"“”") or None
        if not quoted:
            lesson = _original_span(tail, 0, t.start())
    elif not quoted:
        lesson = tail
    lesson = lesson.strip(" .?!:\"“”")
    if re.fullmatch(r"|".join(_POINTING), fold(lesson)):
        lesson = ""
    return ContentRequest(lesson=lesson, topic=topic)


def lesson_slugs(title: str) -> set[str]:
    """The URL slugs a lesson title may have: lib/utils.ts slugify, and its older form that dropped "đ"."""
    def slug(text: str) -> str:
        text = "".join(c for c in unicodedata.normalize("NFD", text.lower().strip()) if unicodedata.category(c) != "Mn")
        text = re.sub(r"[^\w\s-]", "", text, flags=re.ASCII)
        return re.sub(r"^-+|-+$", "", re.sub(r"[\s_-]+", "-", text))
    return {slug(title.replace("đ", "d").replace("Đ", "D")), slug(title)}


def _inline(text: str) -> str:
    text = html_lib.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])", r"<em>\1</em>", text)
    return re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', text)


def markdown_to_html(markdown: str) -> str:
    """The small Markdown the draft prompt asks for (headings, lists, code, quotes, paragraphs) as HTML."""
    out: list[str] = []
    lines = markdown.replace("\r\n", "\n").split("\n")
    para: list[str] = []
    list_tag: Optional[str] = None

    def flush_para() -> None:
        if para:
            out.append(f"<p>{_inline(' '.join(para))}</p>")
            para.clear()

    def close_list() -> None:
        nonlocal list_tag
        if list_tag:
            out.append(f"</{list_tag}>")
            list_tag = None

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("```"):
            flush_para()
            close_list()
            lang = stripped[3:].strip()
            body: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            cls = f' class="language-{html_lib.escape(lang)}"' if lang else ""
            out.append(f"<pre><code{cls}>{html_lib.escape(chr(10).join(body))}</code></pre>")
            i += 1
            continue
        if not stripped:
            flush_para()
            close_list()
        elif h := re.match(r"^(#{1,4})\s+(.*)$", stripped):
            flush_para()
            close_list()
            level = min(max(len(h.group(1)), 2), 4)  # the lesson title is the page's h1
            out.append(f"<h{level}>{_inline(h.group(2).strip())}</h{level}>")
        elif li := re.match(r"^(?:[-*+]|(\d+)[.)])\s+(.*)$", stripped):
            flush_para()
            tag = "ol" if li.group(1) else "ul"
            if list_tag != tag:
                close_list()
                out.append(f"<{tag}>")
                list_tag = tag
            out.append(f"<li>{_inline(li.group(2))}</li>")
        elif stripped.startswith(">"):
            flush_para()
            close_list()
            out.append(f"<blockquote><p>{_inline(stripped.lstrip('> ').strip())}</p></blockquote>")
        elif re.fullmatch(r"-{3,}|\*{3,}", stripped):
            flush_para()
            close_list()
            out.append("<hr>")
        else:
            close_list()
            para.append(stripped)
        i += 1
    flush_para()
    close_list()
    return "".join(out)


def _plain(html_text: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", html_text or ""))).strip()


def draft_prompt(*, topic: str, lesson: dict, request: str) -> str:
    existing = _plain(lesson.get("content") or "")[:MAX_EXISTING_CHARS]
    section = lesson.get("section") or "(không có mục)"
    description = (lesson.get("description") or "").strip() or "(chưa có mô tả)"
    return (
        "Bạn viết nội dung cho một bài trong kho kiến thức cá nhân (second brain) của một kỹ sư phần mềm.\n"
        f"Topic: {topic}\nMục: {section}\nTên bài: {lesson.get('title')}\nMô tả: {description}\n"
        f"Yêu cầu của chủ kho: {request}\n\n"
        + (f"Bài đã có nội dung sau, KHÔNG lặp lại, chỉ viết phần bổ sung:\n{existing}\n\n" if existing else "")
        + "Viết bằng tiếng Việt, thuật ngữ kỹ thuật giữ tiếng Anh. Dùng Markdown: tiêu đề ## và ###, gạch đầu dòng, "
        "ví dụ code trong ``` khi hợp chủ đề. Không viết tiêu đề # (tên bài đã là tiêu đề trang), không lời mở đầu "
        "hay kết luận kiểu trò chuyện. Khoảng 400–800 từ. Nếu tên bài mơ hồ, hiểu nó theo topic và mục ở trên. "
        "Chỉ trả về nội dung bài."
    )


def _text_of(message: object) -> str:
    content = getattr(message, "content", message)
    if isinstance(content, list):
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    return str(content or "")


class LessonContentCommands:
    async def _content_topic(self, named: Optional[str], content: str, page_context, session_ctx) -> Optional[dict]:
        """Named in the message, else the open page, else the session's topic."""
        candidates = [named] if named else []
        candidates += [await topic_named_in_message(content), (page_context or {}).get("roadmapSlug"),
                       session_ctx.active_topic_slug]
        for ref in candidates:
            if not ref:
                continue
            found = await resolve_topic(ref)
            if found.status == "found" and found.slug:
                return await get_adapter().get_topic(found.slug)
            if named and ref == named:
                return None
        return None

    async def handle_lesson_content(
        self, *, content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Draft a body for a lesson and preview it. Leaves `outcome["handled"]` False for other messages."""
        request = parse_content_request(content)
        if request is None:
            return
        outcome["handled"] = True
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return

        topic = await self._content_topic(request.topic, content, page_context, session_ctx)
        if topic is None:
            reply = "Mình chưa biết bài này thuộc topic nào. Bạn gửi lại kèm tên topic, ví dụ:\n\n" + example_blocks(
                f"thêm nội dung chi tiết cho bài \"{request.lesson or '…'}\" trong topic …"
            )
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        topic_title = topic.get("title") or topic.get("slug")
        lessons = topic.get("items") or []
        lesson = None
        if request.lesson:
            wanted = fold(request.lesson)
            exact = [i for i in lessons if fold(i.get("title") or "") == wanted]
            partial = [i for i in lessons if wanted and wanted in fold(i.get("title") or "")]
            matches = exact or partial
            if len(matches) > 1:
                names = ", ".join(f"**{i.get('title')}**" for i in matches[:6])
                async for ev in self._stream_text(f"Topic **{topic_title}** có nhiều bài khớp: {names}. Bạn ghi đúng tên bài giúp mình.", delay):
                    yield ev
                return
            lesson = matches[0] if matches else None
        else:
            page_item = ((page_context or {}).get("itemId") or "").strip()
            if (page_context or {}).get("roadmapSlug") == topic.get("slug") and page_item:
                lesson = next((i for i in lessons if page_item == i.get("id") or page_item in lesson_slugs(i.get("title") or "")), None)
        if lesson is None:
            listing = ", ".join(f"**{i.get('title')}**" for i in lessons[:8]) or "_(topic chưa có bài nào)_"
            what = f"bài **{request.lesson}**" if request.lesson else "bài bạn đang nói tới"
            reply = f"Mình không tìm thấy {what} trong topic **{topic_title}** nên chưa viết gì. Các bài hiện có: {listing}."
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        if self.llm is None:
            async for ev in self._stream_text("Mình chưa viết được nháp lúc này vì mô hình ngôn ngữ chưa sẵn sàng. Bạn thử lại sau nhé.", delay):
                yield ev
            return
        yield {"type": "tool_start", "name": "draft_item_content", "args": {"topic": topic.get("slug"), "item": lesson.get("id")}}
        try:
            message = await asyncio.wait_for(
                self.llm.ainvoke(draft_prompt(topic=topic_title, lesson=lesson, request=content)), DRAFT_TIMEOUT
            )
            markdown = _text_of(message).strip()
        except Exception as exc:
            print(f"[lesson_content] Draft failed: {exc}")
            markdown = ""
        yield {"type": "tool_end", "name": "draft_item_content", "result": "ok" if markdown else "failed", "is_error": not markdown}
        if not markdown:
            async for ev in self._stream_text("Mình chưa viết được nháp lúc này (mô hình không trả lời). Bạn thử lại sau nhé.", delay):
                yield ev
            return

        markdown = re.sub(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", r"\1", markdown, flags=re.DOTALL)
        session_ctx.pending_content_draft = {
            "topic": topic.get("slug"), "topic_title": topic_title, "item_id": lesson.get("id"),
            "title": lesson.get("title"), "html": markdown_to_html(markdown),
        }
        where = "thêm vào cuối nội dung đang có" if (lesson.get("content") or "").strip() else "làm nội dung của bài"
        preview = (
            f"📝 **NHÁP NỘI DUNG** cho bài **{lesson.get('title')}** (topic **{topic_title}**)\n\n---\n\n{markdown}\n\n---\n\n"
            f"👉 Bấm nút **[✅ Xác nhận thực hiện]** bên dưới hoặc gõ \"ok\" để {where}. Bấm **[❌ Hủy bỏ]** để bỏ nháp."
        )
        yield {"type": "action_preview", "action_id": session_ctx.session_id, "preview": preview}
        async for ev in self._stream_text(preview, delay):
            yield ev
        # The confirmed write runs in commands.handle_pending, the decision point that grants writes
