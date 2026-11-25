"""Lesson content drafts: "thêm nội dung chi tiết cho bài X" (owner only).

Mixed into NextGenRoadmapAgent. The LLM drafts a body for a lesson that exists using a shared H2/H3
template contract (matching `On this page`); the Owner sees the draft with its predicted outline in a
preview and "ok" applies it through `update_item_content`.
"""

from __future__ import annotations

import asyncio
import html as html_lib
import re
import unicodedata
from dataclasses import dataclass
from typing import AsyncGenerator, Literal, Optional

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.host import AgentHostMixin
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.grounding import example_blocks
from rag_service.tools import get_adapter
from rag_service.tools.topic_resolver import resolve_topic, topic_named_in_message

DRAFT_TIMEOUT = 90.0
MAX_EXISTING_CHARS = 4000

TemplateKind = Literal["standard", "comparison", "implementation"]
WriteMode = Literal["create_or_replace_empty", "append", "fill_h2_section"]

LESSON_TEMPLATES: dict[TemplateKind, dict[str, object]] = {
    "standard": {
        "label": "Mẫu chuẩn (Khái niệm & Kiến trúc)",
        "headings": (
            "Tổng quan & Bài toán",
            "Cơ chế hoạt động",
            "Ví dụ & Áp dụng thực tế",
            "Lưu ý & Trade-off",
        ),
    },
    "comparison": {
        "label": "So sánh giải pháp",
        "headings": (
            "Bối cảnh & Tiêu chí so sánh",
            "So sánh chi tiết",
            "Khi nào chọn phương án nào?",
        ),
    },
    "implementation": {
        "label": "Hướng dẫn triển khai",
        "headings": (
            "Mục tiêu & Yêu cầu",
            "Các bước triển khai",
            "Kiểm thử & Lỗi thường gặp",
        ),
    },
}

_TEMPLATE_PLACEHOLDER_MARKERS = (
    "khai niem nay giai quyet van de gi va nam o dau trong buc tranh tong the",
    "luong xu ly chinh va cach cac thanh phan tuong tac",
    "tinh huong ap dung hoac doan cau hinh / code minh hoa",
    "dieu kien phu hop",
    "diem can tranh",
)

# Folded text ("them noi dung chi tiet cho bai …"): a draft verb, a content noun, then the lesson
_VERB = r"(?:them|viet|bo\s+sung|cap\s+nhat|soan|tao|mo\s+rong|lam\s+giau|dien|write|draft|expand|add|fill|update)"
_NOUN = r"(?:noi\s+dung|content|chi\s+tiet|phan\s+giai\s+thich)"
CONTENT_REQUEST = re.compile(
    rf"^\s*(?:hay\s+|giup\s+(?:minh|toi|em)\s+|vui\s+long\s+)?{_VERB}\s+(?:them\s+)?{_NOUN}"
    rf"(?:\s+chi\s+tiet)?\s+(?:(?:cho|vao|cua|trong|for|to|of)\s+)?(?:bai(?:\s+hoc)?|lesson)\b(?P<rest>.*)$"
)
SECTION_CONTENT_REQUEST = re.compile(
    rf"^\s*(?:hay\s+|giup\s+(?:minh|toi|em)\s+|vui\s+long\s+)?{_VERB}\s+(?:muc|phan)\s+(?P<target_h2>.+?)\s+"
    rf"(?:cho|vao|cua|trong|for|to|of)\s+(?:bai(?:\s+hoc)?|lesson)\b(?P<rest>.*)$"
)
_QUOTED = re.compile(r"[\"“”'‘’«»](.+?)[\"“”'‘’«»]")
_TOPIC_TAIL = re.compile(r"\s+(?:trong|o|thuoc|cua|in)\s+(?:topic\s+|chu\s+de\s+|lo\s+trinh\s+)?(?P<topic>.+)$")
_POINTING = {"", "nay", "do", "day", "kia", r"hien\s+tai", r"vua\s+tao", r"vua\s+them", "no", "this", "it"}


@dataclass(frozen=True)
class ContentRequest:
    lesson: str  # the lesson's name as written; "" means the page's lesson ("bài này")
    topic: Optional[str]  # a topic named in the message, or None
    target_h2: Optional[str] = None  # specific H2 heading to fill, when requested


def _original_span(text: str, folded_start: int, folded_end: int) -> str:
    """The original text for a span of fold(text): fold keeps one character per character except marks."""
    out, i = [], 0
    for ch in text:
        width = len(fold(ch))
        if folded_start <= i < folded_end and width:
            out.append(ch)
        i += width
    return "".join(out)


def _extract_lesson_and_topic(rest_original: str) -> tuple[str, Optional[str]]:
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
    return lesson, topic


def parse_content_request(text: str) -> Optional[ContentRequest]:
    """The lesson (and topic / target_h2) a draft request names; None for any other message."""
    stripped = text.strip()
    flat = fold(stripped)

    if sec_m := SECTION_CONTENT_REQUEST.search(flat):
        target_h2 = _original_span(stripped, sec_m.start("target_h2"), sec_m.end("target_h2")).strip(" .?!\"“”")
        rest_original = _original_span(stripped, sec_m.start("rest"), sec_m.end("rest"))
        lesson, topic = _extract_lesson_and_topic(rest_original)
        if target_h2:
            return ContentRequest(lesson=lesson, topic=topic, target_h2=target_h2)

    m = CONTENT_REQUEST.search(flat)
    if m is None:
        return None
    rest_original = _original_span(stripped, m.start("rest"), m.end("rest"))
    lesson, topic = _extract_lesson_and_topic(rest_original)
    return ContentRequest(lesson=lesson, topic=topic, target_h2=None)


def detect_template_kind(text: str) -> TemplateKind:
    """Pick the lesson outline preset implied by the user's request."""
    flat = fold(text or "")
    if any(k in flat for k in ("so sanh", "khac nhau", "comparison", " vs ")):
        return "comparison"
    if any(k in flat for k in ("trien khai", "cai dat", "huong dan", "tung buoc", "implementation", "how-to")):
        return "implementation"
    return "standard"


def lesson_slugs(title: str) -> set[str]:
    """The URL slugs a lesson title may have: lib/utils.ts slugify, and its older form that dropped "đ"."""
    def slug(text: str) -> str:
        text = "".join(c for c in unicodedata.normalize("NFD", text.lower().strip()) if unicodedata.category(c) != "Mn")
        text = re.sub(r"[^\w\s-]", "", text, flags=re.ASCII)
        return re.sub(r"^-+|-+$", "", re.sub(r"[\s_-]+", "-", text))

    return {slug(title.replace("đ", "d").replace("Đ", "D")), slug(title)}


def matches_page_item(item: dict, item_ref: Optional[str]) -> bool:
    """True when PageContext.itemId (lesson id or URL slug) points at `item`."""
    ref = (item_ref or "").strip()
    return bool(ref) and (ref in (item.get("id"), item.get("slug")) or ref in lesson_slugs(item.get("title") or ""))


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


def extract_html_outline(html_text: str) -> list[tuple[int, str]]:
    """Extract (level, text) for <h2> and <h3> headings, mirroring the UI `On this page` parser."""
    outline: list[tuple[int, str]] = []
    for m in re.finditer(r"<h([23])(?:\s[^>]*)?>(.*?)</h\1>", html_text or "", flags=re.IGNORECASE | re.DOTALL):
        text = _plain(m.group(2))
        if text:
            outline.append((int(m.group(1)), text))
    return outline


def is_template_placeholder_only(html_text: str) -> bool:
    """True when content is empty or only contains unfilled client starter template copy."""
    if "data-provenance-ref=" in (html_text or ""):
        return False
    plain = fold(_plain(html_text))
    if not plain:
        return True
    return any(marker in plain for marker in _TEMPLATE_PLACEHOLDER_MARKERS) and len(plain) < 550


def validate_lesson_draft(html_text: str) -> tuple[bool, Optional[str]]:
    """Output guard before creating Preview: ensures structured H2/H3 headings and no placeholder text."""
    plain = _plain(html_text)
    if not plain:
        return False, "Bản nháp rỗng."
    if re.search(r"<h1\b", html_text, flags=re.IGNORECASE):
        return False, "Bản nháp chứa thẻ H1; chỉ được dùng ## và ###."
    if re.search(r"\[điền vào đây\]|\bTODO\s*:|:\s*\.\.\.(?:\s|$)", plain, flags=re.IGNORECASE):
        return False, "Bản nháp vẫn còn nội dung giữ chỗ (TODO / ...)."
    if not extract_html_outline(html_text):
        return False, "Bản nháp cần ít nhất một tiêu đề ## hoặc ### để hiển thị On this page."
    return True, None


def merge_h2_section(existing_html: str, target_h2: str, new_section_html: str) -> str:
    """Replace an existing <h2> section matching `target_h2`, or append when absent."""
    existing = (existing_html or "").strip()
    section_html = (new_section_html or "").strip()
    if not re.match(r"^\s*<h2\b", section_html, flags=re.IGNORECASE):
        section_html = f"<h2>{html_lib.escape(target_h2.strip())}</h2>{section_html}"
    if not existing:
        return section_html

    wanted = fold(target_h2.strip())
    h2_matches = list(re.finditer(r"<h2(?:\s[^>]*)?>(.*?)</h2>", existing, flags=re.IGNORECASE | re.DOTALL))
    target_idx = next((idx for idx, m in enumerate(h2_matches) if fold(_plain(m.group(1))) == wanted), None)
    if target_idx is None:
        target_idx = next((idx for idx, m in enumerate(h2_matches) if wanted in fold(_plain(m.group(1)))), None)
    if target_idx is None:
        return f"{existing}\n{section_html}"

    start = h2_matches[target_idx].start()
    end = h2_matches[target_idx + 1].start() if target_idx + 1 < len(h2_matches) else len(existing)
    before = existing[:start].rstrip()
    after = existing[end:].lstrip()
    parts = [p for p in (before, section_html, after) if p]
    return "\n".join(parts)


def draft_prompt(
    *,
    topic: str,
    lesson: dict,
    request: str,
    topic_description: str = "",
    template_kind: TemplateKind = "standard",
    write_mode: WriteMode = "create_or_replace_empty",
    target_h2: Optional[str] = None,
    strict_retry_reason: Optional[str] = None,
    owner_memory_block: str = "",
) -> str:
    raw_existing = lesson.get("content") or ""
    existing = "" if is_template_placeholder_only(raw_existing) else _plain(raw_existing)[:MAX_EXISTING_CHARS]
    section = lesson.get("section") or "(không có mục)"
    description = (lesson.get("description") or "").strip() or "(chưa có mô tả)"
    topic_desc = (topic_description or "").strip()
    topic_line = f"Topic: {topic}" + (f"\nMô tả topic: {topic_desc}" if topic_desc else "")
    headings: tuple[str, ...] = LESSON_TEMPLATES.get(template_kind, LESSON_TEMPLATES["standard"])["headings"]  # type: ignore[assignment]
    headings_spec = "\n".join(f"- ## {h}" for h in headings)

    if write_mode == "fill_h2_section" and target_h2:
        structure_block = (
            (f"Bài đã có nội dung sau, giữ ngữ cảnh chung và KHÔNG lặp lại phần khác:\n{existing}\n\n" if existing else "")
            + f"CHỈ viết nội dung cho mục `## {target_h2}` (có thể chia thêm `###` bên dưới nếu cần).\n"
        )
    elif write_mode == "append" and existing:
        structure_block = (
            f"Bài đã có nội dung sau, KHÔNG lặp lại, chỉ viết phần bổ sung:\n{existing}\n\n"
            "Dùng tiêu đề `##` và `###` mới phù hợp với phần bổ sung.\n"
        )
    else:
        structure_block = (
            "Bắt buộc tổ chức bài theo các tiêu đề `##` chuẩn sau để khớp mục lục `On this page` "
            "(có thể thêm `###` bên dưới khi cần làm rõ):\n"
            f"{headings_spec}\n\n"
        )

    retry_note = f"\nLƯU Ý SỬA LỖI LẦN TRƯỚC: {strict_retry_reason}\n" if strict_retry_reason else ""
    memory_section = f"\n{owner_memory_block}\n" if owner_memory_block else ""

    return (
        "Bạn viết nội dung cho một bài trong kho kiến thức cá nhân (second brain) của một kỹ sư phần mềm.\n"
        f"{topic_line}\nMục: {section}\nTên bài: {lesson.get('title')}\nMô tả: {description}\n"
        f"Yêu cầu của chủ kho: {request}\n"
        f"{memory_section}\n"
        f"{structure_block}"
        "Viết bằng tiếng Việt, thuật ngữ kỹ thuật giữ tiếng Anh. Dùng Markdown: tiêu đề ## và ###, gạch đầu dòng, "
        "ví dụ code trong ``` khi hợp chủ đề. Không viết tiêu đề # (tên bài đã là tiêu đề trang), không lời mở đầu "
        "hay kết luận kiểu trò chuyện, không để chuỗi giữ chỗ như TODO hay '...'. Khoảng 400–800 từ. "
        "Nếu tên bài mơ hồ, hiểu nó theo topic và mục ở trên. Chỉ trả về nội dung bài."
        f"{retry_note}"
    )


def _text_of(message: object) -> str:
    content = getattr(message, "content", message)
    if isinstance(content, list):
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    return str(content or "")


class LessonContentCommands(AgentHostMixin):
    async def _content_topic(self, named: Optional[str], content: str, page_context, session_ctx) -> Optional[dict]:
        """Named in the message, else the open page, else the session's topic."""
        candidates: list[Optional[str]] = [named] if named else []
        candidates += [
            await topic_named_in_message(content),
            (page_context or {}).get("roadmapSlug"),
            session_ctx.active_topic_slug,
        ]
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
        """Draft a body for a lesson and preview it with its On this page outline."""
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

        topic_title = str(topic.get("title") or topic.get("slug") or "")
        lessons = topic.get("items") or []
        lesson = None
        if request.lesson:
            wanted = fold(request.lesson)
            exact = [i for i in lessons if fold(i.get("title") or "") == wanted]
            partial = [i for i in lessons if wanted and wanted in fold(i.get("title") or "")]
            matches = exact or partial
            if len(matches) > 1:
                names = ", ".join(f"**{i.get('title')}**" for i in matches[:6])
                async for ev in self._stream_text(
                    f"Topic **{topic_title}** có nhiều bài khớp: {names}. Bạn ghi đúng tên bài giúp mình.", delay
                ):
                    yield ev
                return
            lesson = matches[0] if matches else None
        else:
            page_item = ((page_context or {}).get("itemId") or "").strip()
            if (page_context or {}).get("roadmapSlug") == topic.get("slug") and page_item:
                lesson = next((i for i in lessons if matches_page_item(i, page_item)), None)
            if lesson is None and session_ctx.active_lesson_id:
                lesson = next((i for i in lessons if matches_page_item(i, session_ctx.active_lesson_id)), None)
        if lesson is None:
            listing = ", ".join(f"**{i.get('title')}**" for i in lessons[:8]) or "_(topic chưa có bài nào)_"
            what = f"bài **{request.lesson}**" if request.lesson else "bài bạn đang nói tới"
            reply = (
                f"Mình không tìm thấy {what} trong topic **{topic_title}** nên chưa viết gì. "
                f"Các bài hiện có: {listing}."
            )
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        if self.llm is None:
            async for ev in self._stream_text(
                "Mình chưa viết được nháp lúc này vì mô hình ngôn ngữ chưa sẵn sàng. Bạn thử lại sau nhé.", delay
            ):
                yield ev
            return

        template_kind = detect_template_kind(content)
        existing_raw = (lesson.get("content") or "").strip()
        has_real_content = bool(existing_raw) and not is_template_placeholder_only(existing_raw)
        if request.target_h2:
            write_mode: WriteMode = "fill_h2_section"
        elif has_real_content:
            write_mode = "append"
        else:
            write_mode = "create_or_replace_empty"

        yield {
            "type": "tool_start",
            "name": "draft_item_content",
            "args": {
                "topic": topic.get("slug"),
                "item": lesson.get("id"),
                "template_kind": template_kind,
                "write_mode": write_mode,
            },
        }

        from rag_service.core.memory import format_owner_memory, owner_memory_store

        topic_slug = topic.get("slug")
        owner_memories = await owner_memory_store.list_active(topic_slug)
        relevant_memories = [m for m in owner_memories if m.kind in ("preference", "techstack", "learning_note")]
        owner_memory_block, _ = format_owner_memory(
            relevant_memories,
            note="Ngữ cảnh cá nhân của Owner (áp dụng cho ví dụ và phong cách viết, không nhắc lại như lời trò chuyện):",
            scope=topic_slug,
            max_items=8,
            max_chars=800,
        )

        markdown = ""
        draft_html = ""
        guard_error: Optional[str] = None
        for attempt in range(2):
            try:
                message = await asyncio.wait_for(
                    self.llm.ainvoke(
                        draft_prompt(
                            topic=topic_title,
                            lesson=lesson,
                            request=content,
                            topic_description=(topic.get("description") or "").strip(),
                            template_kind=template_kind,
                            write_mode=write_mode,
                            target_h2=request.target_h2,
                            strict_retry_reason=guard_error if attempt == 1 else None,
                            owner_memory_block=owner_memory_block,
                        )
                    ),
                    DRAFT_TIMEOUT,
                )
                candidate = _text_of(message).strip()
            except Exception as exc:
                print(f"[lesson_content] Draft failed: {exc}")
                candidate = ""
            if not candidate:
                markdown = ""
                break
            candidate = re.sub(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", r"\1", candidate, flags=re.DOTALL)
            candidate_html = markdown_to_html(candidate)
            ok, guard_error = validate_lesson_draft(candidate_html)
            if ok:
                markdown = candidate
                draft_html = candidate_html
                break

        yield {
            "type": "tool_end",
            "name": "draft_item_content",
            "result": "ok" if draft_html else "failed",
            "is_error": not draft_html,
        }
        if not draft_html:
            reason = f" ({guard_error})" if guard_error else " (mô hình không trả lời)"
            async for ev in self._stream_text(
                f"Mình chưa tạo được bản nháp đạt chuẩn{reason}. Bạn thử lại nhé.", delay
            ):
                yield ev
            return

        session_ctx.pending_content_draft = {
            "topic": topic.get("slug"),
            "topic_title": topic_title,
            "item_id": lesson.get("id"),
            "title": lesson.get("title"),
            "html": draft_html,
            "write_mode": write_mode,
            "target_h2": request.target_h2,
        }

        outline = extract_html_outline(draft_html)
        outline_lines = "\n".join(("  " if lvl == 3 else "") + f"- {txt}" for lvl, txt in outline)
        if write_mode == "fill_h2_section" and request.target_h2:
            mode_label = f'Điền mục "{request.target_h2}"'
            where = f'cập nhật mục "{request.target_h2}" của bài'
        elif write_mode == "append":
            mode_label = "Bổ sung cuối bài"
            where = "thêm vào cuối nội dung đang có"
        else:
            mode_label = str(LESSON_TEMPLATES[template_kind]["label"])
            where = "làm nội dung của bài"

        preview = (
            f"📝 **NHÁP NỘI DUNG** cho bài **{lesson.get('title')}** (topic **{topic_title}**)\n"
            f"- **Chế độ:** {mode_label}\n"
            f"- **On this page dự kiến:**\n{outline_lines}\n\n"
            f"---\n\n{markdown}\n\n---\n\n"
            f"👉 Bấm nút **[✅ Xác nhận thực hiện]** bên dưới hoặc gõ \"ok\" để {where}. Bấm **[❌ Hủy bỏ]** để bỏ nháp."
        )
        yield {"type": "action_preview", "action_id": session_ctx.session_id, "preview": preview}
        async for ev in self._stream_text(preview, delay):
            yield ev
        # The confirmed write runs in commands.handle_pending, the decision point that grants writes
