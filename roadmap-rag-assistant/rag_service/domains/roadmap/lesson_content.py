"""Lesson content drafts: "thêm nội dung chi tiết cho bài X" (owner only).

Mixed into NextGenRoadmapAgent. The LLM drafts a body for a lesson that exists using a shared H2/H3
template contract (matching `On this page`); the Owner sees the draft with its predicted outline in a
preview and "ok" applies it through `update_item_content`.
"""

from __future__ import annotations

import asyncio
import html as html_lib
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Literal, Optional, Sequence

log = logging.getLogger(__name__)

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.config import settings
from rag_service.domains.roadmap import linking_advisor
from rag_service.domains.roadmap.host import AgentHostMixin
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.grounding import example_blocks, format_concept_promotion_preview
from rag_service.observability import end_step, end_step_on_error, start_step, usage_from_langchain
from rag_service.state.session_store import build_action_preview_event
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


@dataclass(frozen=True)
class ConceptPromotionRequest:
    concept: str
    summary: str = ""
    topic: Optional[str] = None


_CONCEPT_PROMOTE_NAMED_RE = re.compile(
    r"^\s*(?:hay\s+|giup\s+(?:minh|toi|em)\s+|vui\s+long\s+)?"
    r"(?:(?:luu|chuyen|them|bo\s+sung|tao)\s+(?:khai\s+niem|kien\s+thuc|chu\s+de)\b"
    r"|promote(?:\s+concept)?\b|save\s+concept\b)(?P<rest>.*)$"
)
_CONCEPT_PROMOTE_DIRECT_RE = re.compile(
    r"^\s*(?:hay\s+|giup\s+(?:minh|toi|em)\s+|vui\s+long\s+)?"
    r"(?:luu|chuyen)\s+(?:noi\s+dung\s+)?(?P<obj>.+?)\s+"
    r"(?:thanh\s+bai(?:\s+hoc)?|vao\s+(?:roadmap|lo\s+trinh|kho\s+kien\s+thuc))(?P<rest>.*)$"
)
_CONCEPT_QUESTION_START_RE = re.compile(r"^\s*(?:lam\s+sao|cach|huong\s+dan|co\s+the|tai\s+sao|vi\s+sao|how\s+to)\b")
_CONCEPT_TARGET_TAIL_RE = re.compile(
    r"\s+(?:thanh\s+bai(?:\s+hoc)?|vao\s+(?:roadmap|lo\s+trinh|kho\s+kien\s+thuc)|to\s+(?:a\s+)?lesson|as\s+(?:a\s+)?lesson)\b",
    re.IGNORECASE,
)
_CONCEPT_TOPIC_TAIL_RE = re.compile(
    r"\s+(?:trong|vao|o|thuoc|cua|in)\s+(?:topic\s+|chu\s+de\s+|lo\s+trinh\s+)?(?P<topic>.+)$"
)


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


def _split_concept_summary(text: str) -> tuple[str, str]:
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    if not lines:
        return "", ""
    head = lines[0]
    summary_lines = lines[1:]
    if ":" in head:
        left, right = head.split(":", 1)
        left_clean = left.strip(" .-\"“”'‘’")
        right_clean = right.strip()
        if left_clean and right_clean:
            head = left_clean
            summary_lines = [right_clean, *summary_lines]
        elif not left_clean and right_clean:
            head = right_clean
    return head, "\n".join(summary_lines).strip()


def _strip_folded_suffix(text: str, pattern: re.Pattern[str]) -> str:
    if m := pattern.search(fold(text)):
        return _original_span(text, 0, m.start()).strip()
    return text.strip()


def _clean_concept_head_and_topic(raw_head: str, extra_tail: str = "") -> tuple[str, Optional[str]]:
    combined = f"{raw_head.strip()} {extra_tail.strip()}".strip()
    topic: Optional[str] = None
    if t := _CONCEPT_TOPIC_TAIL_RE.search(fold(combined)):
        topic = _original_span(combined, t.start("topic"), t.end("topic")).strip(" .?!\"“”'‘’") or None
        combined = _original_span(combined, 0, t.start()).strip()
    combined = _strip_folded_suffix(combined, _CONCEPT_TARGET_TAIL_RE)
    if t2 := _CONCEPT_TOPIC_TAIL_RE.search(fold(combined)):
        topic = topic or (_original_span(combined, t2.start("topic"), t2.end("topic")).strip(" .?!\"“”'‘’") or None)
        combined = _original_span(combined, 0, t2.start()).strip()
    quoted = _QUOTED.search(combined)
    concept = quoted.group(1).strip() if quoted else combined.strip(" .?!:\"“”'‘’")
    return concept, topic


def parse_concept_promotion_request(text: str) -> Optional[ConceptPromotionRequest]:
    """Match explicit requests to promote a chat concept into a Roadmap lesson."""
    stripped = (text or "").strip()
    if not stripped or parse_content_request(stripped) is not None:
        return None
    flat = fold(stripped)
    if _CONCEPT_QUESTION_START_RE.search(flat) or re.search(r"\b(?:bo\s+nho|owner\s+memory|memory)\b", flat):
        return None

    m_named = _CONCEPT_PROMOTE_NAMED_RE.match(flat)
    m_direct = _CONCEPT_PROMOTE_DIRECT_RE.match(flat) if m_named is None else None
    if m_named is None and m_direct is None:
        return None

    if m_named is not None:
        rest = _original_span(stripped, m_named.start("rest"), m_named.end("rest")).lstrip()
        head, summary = _split_concept_summary(rest)
        concept, topic = _clean_concept_head_and_topic(head)
    elif m_direct is not None:
        obj = _original_span(stripped, m_direct.start("obj"), m_direct.end("obj"))
        rest = _original_span(stripped, m_direct.start("rest"), m_direct.end("rest"))
        rest_head, summary = _split_concept_summary(rest)
        concept, topic = _clean_concept_head_and_topic(obj, rest_head)
    else:
        return None

    if not concept or fold(concept) in _POINTING:
        return None
    return ConceptPromotionRequest(concept=concept, summary=summary, topic=topic)


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


def _consume_fenced_code_block(lines: list[str], start_idx: int) -> tuple[str, int]:
    lang = lines[start_idx].strip()[3:].strip()
    body: list[str] = []
    idx = start_idx + 1
    while idx < len(lines) and not lines[idx].strip().startswith("```"):
        body.append(lines[idx])
        idx += 1
    cls = f' class="language-{html_lib.escape(lang)}"' if lang else ""
    return f"<pre><code{cls}>{html_lib.escape(chr(10).join(body))}</code></pre>", idx + 1


def _flush_paragraph(out: list[str], para: list[str]) -> None:
    if para:
        out.append(f"<p>{_inline(' '.join(para))}</p>")
        para.clear()


def _close_html_list(out: list[str], cur_tag: Optional[str]) -> Optional[str]:
    if cur_tag:
        out.append(f"</{cur_tag}>")
    return None


def _append_list_item(out: list[str], li: re.Match[str], list_tag: Optional[str]) -> str:
    tag = "ol" if li.group(1) else "ul"
    if list_tag != tag:
        _close_html_list(out, list_tag)
        out.append(f"<{tag}>")
    out.append(f"<li>{_inline(li.group(2))}</li>")
    return tag


def _append_block_line(
    stripped: str,
    out: list[str],
    para: list[str],
    list_tag: Optional[str],
) -> Optional[str]:
    if not stripped:
        _flush_paragraph(out, para)
        return _close_html_list(out, list_tag)
    if h := re.match(r"^(#{1,4})\s+(.*)$", stripped):
        _flush_paragraph(out, para)
        list_tag = _close_html_list(out, list_tag)
        level = min(max(len(h.group(1)), 2), 4)  # the lesson title is the page's h1
        out.append(f"<h{level}>{_inline(h.group(2).strip())}</h{level}>")
        return list_tag
    if li := re.match(r"^(?:[-*+]|(\d+)[.)])\s+(.*)$", stripped):
        _flush_paragraph(out, para)
        return _append_list_item(out, li, list_tag)
    if stripped.startswith(">"):
        _flush_paragraph(out, para)
        list_tag = _close_html_list(out, list_tag)
        out.append(f"<blockquote><p>{_inline(stripped.lstrip('> ').strip())}</p></blockquote>")
        return list_tag
    if re.fullmatch(r"-{3,}|\*{3,}", stripped):
        _flush_paragraph(out, para)
        list_tag = _close_html_list(out, list_tag)
        out.append("<hr>")
        return list_tag
    list_tag = _close_html_list(out, list_tag)
    para.append(stripped)
    return list_tag


def markdown_to_html(markdown: str) -> str:
    """The small Markdown the draft prompt asks for (headings, lists, code, quotes, paragraphs) as HTML."""
    out: list[str] = []
    lines = markdown.replace("\r\n", "\n").split("\n")
    para: list[str] = []
    list_tag: Optional[str] = None
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped.startswith("```"):
            if para:
                out.append(f"<p>{_inline(' '.join(para))}</p>")
                para.clear()
            if list_tag:
                out.append(f"</{list_tag}>")
                list_tag = None
            block, i = _consume_fenced_code_block(lines, i)
            out.append(block)
            continue
        list_tag = _append_block_line(stripped, out, para, list_tag)
        i += 1
    if para:
        out.append(f"<p>{_inline(' '.join(para))}</p>")
    if list_tag:
        out.append(f"</{list_tag}>")
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
    from rag_service.pii import contains_secret

    plain = _plain(html_text)
    if not plain:
        return False, "Bản nháp rỗng."
    if re.search(r"<h1\b", html_text, flags=re.IGNORECASE):
        return False, "Bản nháp chứa thẻ H1; chỉ được dùng ## và ###."
    if re.search(
        r"</?(?:owner_memory|system|instructions?|prompt|conversation_history)\b",
        html_text,
        flags=re.IGNORECASE,
    ):
        return False, "Bản nháp chứa thẻ hệ thống nội bộ không hợp lệ."
    if contains_secret(plain):
        return False, "Bản nháp chứa token hoặc thông tin bí mật nhạy cảm."
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

    def _select_target_lesson(
        self,
        request,
        topic: dict,
        topic_title: str,
        page_context,
        session_ctx,
    ) -> tuple[Optional[dict], Optional[str]]:
        lessons = topic.get("items") or []
        if request.lesson:
            wanted = fold(request.lesson)
            exact = [i for i in lessons if fold(i.get("title") or "") == wanted]
            partial = [i for i in lessons if wanted and wanted in fold(i.get("title") or "")]
            matches = exact or partial
            if len(matches) > 1:
                names = ", ".join(f"**{i.get('title')}**" for i in matches[:6])
                return None, f"Topic **{topic_title}** có nhiều bài khớp: {names}. Bạn ghi đúng tên bài giúp mình."
            lesson = matches[0] if matches else None
        else:
            page_item = ((page_context or {}).get("itemId") or "").strip()
            lesson = None
            if (page_context or {}).get("roadmapSlug") == topic.get("slug") and page_item:
                lesson = next((i for i in lessons if matches_page_item(i, page_item)), None)
            if lesson is None and session_ctx.active_lesson_id:
                lesson = next((i for i in lessons if matches_page_item(i, session_ctx.active_lesson_id)), None)

        if lesson is not None:
            return lesson, None
        listing = ", ".join(f"**{i.get('title')}**" for i in lessons[:8]) or "_(topic chưa có bài nào)_"
        what = f"bài **{request.lesson}**" if request.lesson else "bài bạn đang nói tới"
        return (
            None,
            f"Mình không tìm thấy {what} trong topic **{topic_title}** nên chưa viết gì. Các bài hiện có: {listing}.",
        )

    async def _generate_validated_draft(
        self,
        *,
        topic: dict,
        topic_title: str,
        lesson: dict,
        content: str,
        template_kind: TemplateKind,
        write_mode: WriteMode,
        target_h2: Optional[str],
        include_owner_memory: bool = False,
    ) -> tuple[str, str, Optional[str]]:
        owner_memory_block = ""
        if include_owner_memory:
            from rag_service.core.memory import format_owner_memory, owner_memory_store

            topic_slug = topic.get("slug")
            owner_memories = await owner_memory_store.list_active(topic_slug)
            relevant_memories = [
                m
                for m in owner_memories
                if m.kind == "preference" and m.source == "explicit"
            ]
            owner_memory_block, _ = format_owner_memory(
                relevant_memories,
                note="Ngữ cảnh cá nhân của Owner (áp dụng cho ví dụ và phong cách viết, không nhắc lại như lời trò chuyện):",
                scope=topic_slug,
                max_items=8,
                max_chars=800,
            )

        guard_error: Optional[str] = None
        for attempt in range(2):
            prompt = draft_prompt(
                topic=topic_title,
                lesson=lesson,
                request=content,
                topic_description=(topic.get("description") or "").strip(),
                template_kind=template_kind,
                write_mode=write_mode,
                target_h2=target_h2,
                strict_retry_reason=guard_error if attempt == 1 else None,
                owner_memory_block=owner_memory_block,
            )
            draft_step = start_step(
                "lesson-draft-generation",
                "generation",
                model=settings.llm_model,
                input=prompt,
                metadata={"template_kind": template_kind, "write_mode": write_mode, "attempt": attempt + 1},
            )
            try:
                message = await asyncio.wait_for(self.llm.ainvoke(prompt), DRAFT_TIMEOUT)
                candidate = _text_of(message).strip()
                end_step(draft_step, output=candidate, usage_details=usage_from_langchain(message))
            except BaseException as exc:
                if isinstance(exc, (asyncio.CancelledError, GeneratorExit)):
                    end_step_on_error(draft_step, exc)
                    raise
                end_step(draft_step, level="ERROR", status_message=f"{type(exc).__name__}: {exc}")
                print(f"[lesson_content] Draft failed: {exc}")
                candidate = ""
            if not candidate:
                return "", "", guard_error
            candidate = re.sub(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", r"\1", candidate, flags=re.DOTALL)
            candidate_html = markdown_to_html(candidate)
            ok, guard_error = validate_lesson_draft(candidate_html)
            if ok:
                return candidate, candidate_html, None
        return "", "", guard_error

    @staticmethod
    def _resolve_content_write_mode(content: str, lesson: dict, target_h2: Optional[str]) -> tuple[TemplateKind, WriteMode]:
        template_kind = detect_template_kind(content)
        existing_raw = (lesson.get("content") or "").strip()
        has_real_content = bool(existing_raw) and not is_template_placeholder_only(existing_raw)
        if target_h2:
            return template_kind, "fill_h2_section"
        if has_real_content:
            return template_kind, "append"
        return template_kind, "create_or_replace_empty"


    async def _resolve_content_target(
        self, request, content: str, page_context, session_ctx
    ) -> tuple[Optional[dict], Optional[dict], Optional[str]]:
        if not is_owner():
            return None, None, OWNER_ONLY_MESSAGE
        topic = await self._content_topic(request.topic, content, page_context, session_ctx)
        if topic is None:
            reply = "Mình chưa biết bài này thuộc topic nào. Bạn gửi lại kèm tên topic, ví dụ:\n\n" + example_blocks(
                f"thêm nội dung chi tiết cho bài \"{request.lesson or '…'}\" trong topic …"
            )
            return None, None, reply
        topic_title = str(topic.get("title") or topic.get("slug") or "")
        lesson, err_reply = self._select_target_lesson(request, topic, topic_title, page_context, session_ctx)
        if lesson is None:
            return topic, None, err_reply or ""
        if self.llm is None:
            return (
                topic,
                lesson,
                "Mình chưa viết được nháp lúc này vì mô hình ngôn ngữ chưa sẵn sàng. Bạn thử lại sau nhé.",
            )
        return topic, lesson, None

    async def _emit_content_draft_preview(
        self,
        *,
        session_ctx,
        topic: dict,
        topic_title: str,
        lesson: dict,
        markdown: str,
        draft_html: str,
        template_kind: TemplateKind,
        write_mode: WriteMode,
        target_h2: Optional[str],
        delay: float,
    ) -> AsyncGenerator[dict, None]:
        session_ctx.pending_content_draft = {
            "topic": topic.get("slug"),
            "topic_title": topic_title,
            "item_id": lesson.get("id"),
            "title": lesson.get("title"),
            "html": draft_html,
            "write_mode": write_mode,
            "target_h2": target_h2,
        }
        outline = extract_html_outline(draft_html)
        outline_lines = "\n".join(("  " if lvl == 3 else "") + f"- {txt}" for lvl, txt in outline)
        if write_mode == "fill_h2_section" and target_h2:
            mode_label = f'Điền mục "{target_h2}"'
            where = f'cập nhật mục "{target_h2}" của bài'
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
        yield build_action_preview_event(
            action_id=session_ctx.session_id,
            kind="content_draft",
            preview=preview,
        )
        async for ev in self._stream_text(preview, delay):
            yield ev

    async def handle_lesson_content(
        self, *, content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Draft a body for a lesson and preview it with its On this page outline."""
        request = parse_content_request(content)
        if request is None:
            return
        outcome["handled"] = True
        topic, lesson, err_msg = await self._resolve_content_target(request, content, page_context, session_ctx)
        if err_msg is not None or topic is None or lesson is None:
            async for ev in self._stream_text(err_msg or "", delay):
                yield ev
            return

        topic_title = str(topic.get("title") or topic.get("slug") or "")
        template_kind, write_mode = self._resolve_content_write_mode(content, lesson, request.target_h2)

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
        markdown, draft_html, guard_error = await self._generate_validated_draft(
            topic=topic,
            topic_title=topic_title,
            lesson=lesson,
            content=content,
            template_kind=template_kind,
            write_mode=write_mode,
            target_h2=request.target_h2,
        )
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

        async for ev in self._emit_content_draft_preview(
            session_ctx=session_ctx,
            topic=topic,
            topic_title=topic_title,
            lesson=lesson,
            markdown=markdown,
            draft_html=draft_html,
            template_kind=template_kind,
            write_mode=write_mode,
            target_h2=request.target_h2,
            delay=delay,
        ):
            yield ev
        # The confirmed write runs in commands.handle_pending, the decision point that grants writes

    @staticmethod
    def build_fallback_concept_draft(
        concept: str,
        summary: str = "",
        *,
        write_mode: WriteMode = "create_or_replace_empty",
        target_h2: Optional[str] = None,
    ) -> tuple[str, str]:
        heading = (
            target_h2.strip()
            if write_mode == "fill_h2_section" and target_h2
            else (f"Bổ sung: {concept}" if write_mode == "append" else "Tổng quan & Bài toán")
        )
        body = (
            summary.strip()
            or f"Khái niệm **{concept}** được đề xuất đưa vào lộ trình để hệ thống hóa kiến thức và tài liệu tham chiếu."
        )
        markdown = f"## {heading}\n\n{body}"
        return markdown, markdown_to_html(markdown)

    async def _draft_concept_markdown_and_html(
        self,
        *,
        concept: str,
        topic_detail: dict,
        topic_title: str,
        lesson: dict,
        summary: str,
        write_mode: WriteMode,
        target_h2: Optional[str] = None,
    ) -> tuple[str, str]:
        if getattr(self, "llm", None) is not None:
            request_text = f"Hệ thống hóa khái niệm '{concept}' thành nội dung bài học chuẩn" + (
                f": {summary}" if summary else ""
            )
            markdown, draft_html, _ = await self._generate_validated_draft(
                topic=topic_detail,
                topic_title=topic_title,
                lesson=lesson,
                content=request_text,
                template_kind="standard",
                write_mode=write_mode,
                target_h2=target_h2,
                include_owner_memory=False,
            )
            if draft_html:
                return markdown, draft_html
        return self.build_fallback_concept_draft(
            concept, summary, write_mode=write_mode, target_h2=target_h2
        )

    async def _resolve_promotion_topic(
        self,
        *,
        concept: str,
        topic_hint: Optional[str],
        preferred_topic_slug: Optional[str],
        advice: dict,
        session_ctx: Any,
    ) -> tuple[Optional[str], Optional[str], Optional[str]]:
        if topic_hint:
            found = await resolve_topic(topic_hint)
            if found.status == "found" and found.slug:
                return found.slug, found.title or found.slug, None
            return None, None, f"Mình chưa tìm thấy topic **{topic_hint}** để lưu khái niệm **{concept}**."

        candidate_slug = (
            advice.get("target_topic_slug")
            or preferred_topic_slug
            or getattr(session_ctx, "active_topic_slug", None)
        )
        if candidate_slug:
            return candidate_slug, advice.get("target_topic_title") or candidate_slug, None

        topics = await get_adapter().list_topics()
        if len(topics) == 1:
            only = topics[0]
            return only.get("slug"), only.get("title") or only.get("slug"), None
        return (
            None,
            None,
            f"Mình chưa biết nên lưu khái niệm **{concept}** vào topic nào. Bạn ghi rõ tên topic giúp mình nhé.",
        )

    async def build_concept_promotion_proposal(
        self,
        *,
        concept: str,
        summary: str = "",
        topic_hint: Optional[str] = None,
        preferred_topic_slug: Optional[str] = None,
        preferred_lesson: Optional[dict] = None,
        write_mode_override: Optional[WriteMode] = None,
        target_h2: Optional[str] = None,
        source: str = "explicit",
        keywords: Sequence[str] = (),
        session_ctx: Any,
        status: str = "target",
    ) -> tuple[Optional[dict], Optional[str]]:
        """Build a previewable concept-promotion proposal without writing anything."""
        if not is_owner():
            return None, OWNER_ONLY_MESSAGE

        proposal_step = start_step(
            "concept-promotion-proposal",
            "span",
            input={"concept": concept, "source": source, "preferred_topic": preferred_topic_slug},
        )
        try:
            proposal, err_msg = await self._build_concept_promotion_proposal_impl(
                concept=concept,
                summary=summary,
                topic_hint=topic_hint,
                preferred_topic_slug=preferred_topic_slug,
                preferred_lesson=preferred_lesson,
                write_mode_override=write_mode_override,
                target_h2=target_h2,
                source=source,
                keywords=keywords,
                session_ctx=session_ctx,
                status=status,
            )
            end_step(
                proposal_step,
                output=(
                    {"mode": proposal["mode"], "topic": proposal["topic"], "section": proposal["section"]}
                    if proposal is not None
                    else {"error": err_msg}
                ),
            )
            return proposal, err_msg
        except BaseException as exc:
            end_step_on_error(proposal_step, exc)
            raise

    async def _build_concept_promotion_proposal_impl(
        self,
        *,
        concept: str,
        summary: str = "",
        topic_hint: Optional[str] = None,
        preferred_topic_slug: Optional[str] = None,
        preferred_lesson: Optional[dict] = None,
        write_mode_override: Optional[WriteMode] = None,
        target_h2: Optional[str] = None,
        source: str = "explicit",
        keywords: Sequence[str] = (),
        session_ctx: Any,
        status: str = "target",
    ) -> tuple[Optional[dict], Optional[str]]:
        advice: dict = {
            "mode": "create",
            "target_lesson": None,
            "target_topic_slug": preferred_topic_slug,
            "target_topic_title": preferred_topic_slug,
            "target_section": None,
            "related_lessons": [],
        }
        try:
            if getattr(linking_advisor.rag_engine, "_is_synced", True):
                advice = await linking_advisor.advise_concept_promotion(
                    title=concept,
                    summary=summary,
                    keywords=keywords,
                    preferred_topic_slug=preferred_topic_slug,
                )
        except Exception as exc:
            log.debug("concept_promotion: linking advisor skipped (%s)", exc)

        topic_slug, topic_title, err_msg = await self._resolve_promotion_topic(
            concept=concept,
            topic_hint=topic_hint,
            preferred_topic_slug=preferred_topic_slug,
            advice=advice,
            session_ctx=session_ctx,
        )
        if err_msg or not topic_slug:
            return None, err_msg

        topic_detail = await get_adapter().get_topic(topic_slug) or {"slug": topic_slug, "title": topic_title, "items": []}
        topic_title = str(topic_detail.get("title") or topic_title or topic_slug)

        target_lesson = preferred_lesson
        if target_lesson is None and advice.get("mode") == "append" and advice.get("target_lesson"):
            adv_id = advice["target_lesson"].get("lesson_id")
            target_lesson = next(
                (i for i in topic_detail.get("items") or [] if i.get("id") == adv_id),
                None,
            )

        if target_lesson is not None:
            mode = "append"
            write_mode: WriteMode = write_mode_override or ("fill_h2_section" if target_h2 else "append")
            draft_lesson = target_lesson
            related = [
                r for r in advice.get("related_lessons") or [] if r.get("lesson_id") != target_lesson.get("id")
            ][:3]
            section = str(target_lesson.get("section") or advice.get("target_section") or "")
        else:
            mode = "create"
            write_mode = "create_or_replace_empty"
            section = str(advice.get("target_section") or "")
            draft_lesson = {"title": concept, "section": section, "description": summary, "content": ""}
            related = list(advice.get("related_lessons") or [])[:3]

        draft_md, draft_html = await self._draft_concept_markdown_and_html(
            concept=concept,
            topic_detail=topic_detail,
            topic_title=topic_title,
            lesson=draft_lesson,
            summary=summary,
            write_mode=write_mode,
            target_h2=target_h2,
        )
        proposal = {
            "mode": mode,
            "source": source,
            "title": concept,
            "topic": topic_slug,
            "topic_title": topic_title,
            "section": section,
            "item_id": target_lesson.get("id") if target_lesson else None,
            "target_lesson_title": target_lesson.get("title") if target_lesson else None,
            "write_mode": write_mode,
            "target_h2": target_h2,
            "status": status,
            "description": (summary or f"Khái niệm {concept}").strip()[:200],
            "html": draft_html,
            "markdown": draft_md,
            "related_lessons": related,
        }
        return proposal, None

    async def emit_concept_promotion_preview(
        self, proposal: dict, session_ctx: Any, delay: float, *, prefix_newline: bool = False
    ) -> AsyncGenerator[dict, None]:
        """Store `pending_concept_promotion` in RAM and yield preview events."""
        session_ctx.pending_concept_promotion = proposal
        preview_text = format_concept_promotion_preview(proposal)
        editable_titles = [proposal["title"]] if proposal.get("mode") == "create" else None
        editable_target = (
            {"topic": proposal.get("topic") or "", "section": proposal.get("section") or ""}
            if proposal.get("mode") == "create"
            else None
        )
        yield build_action_preview_event(
            action_id=session_ctx.session_id,
            kind="concept_promotion",
            preview=preview_text,
            editable_titles=editable_titles,
            editable_target=editable_target,
        )
        stream_text = f"\n\n{preview_text}" if prefix_newline else preview_text
        async for ev in self._stream_text(stream_text, delay):
            yield ev

    async def handle_concept_promotion(
        self, *, content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Promote an explicit chat concept into a Previewed Lesson create/append proposal."""
        request = parse_concept_promotion_request(content)
        if request is None:
            return
        outcome["handled"] = True
        proposal, err_msg = await self.build_concept_promotion_proposal(
            concept=request.concept,
            summary=request.summary,
            topic_hint=request.topic,
            preferred_topic_slug=(page_context or {}).get("roadmapSlug") or session_ctx.active_topic_slug,
            source="explicit",
            session_ctx=session_ctx,
            status="target",
        )
        if err_msg is not None or proposal is None:
            async for ev in self._stream_text(err_msg or "", delay):
                yield ev
            return
        session_ctx.clear_pending()
        async for ev in self.emit_concept_promotion_preview(proposal, session_ctx, delay):
            yield ev
