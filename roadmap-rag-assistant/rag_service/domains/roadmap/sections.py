"""Sections of a topic through the agent (ADR-0009): list them, and rename one (owner only, after a preview).

Mixed into NextGenRoadmapAgent. Listing runs after the router (sub_intent CATALOG), a rename before it (it writes): listing is answered
from the topic's `sections` (never the LLM, so no section is made up), and a rename is previewed and runs on "ok"
through handle_pending. The topic is the one named in the message, else the open page, else the session's.
"""

from __future__ import annotations

import re
from typing import AsyncGenerator, Optional

from rag_service.adapters.errors import normalize_title
from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.host import AgentHostMixin
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.grounding import example_blocks
from rag_service.domains.roadmap.router.policy import LIST_SECTIONS
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.tools import get_adapter
from rag_service.tools.topic_resolver import resolve_topic, topic_named_in_message

GENERAL_SECTION = "Chung"
_CHANGE_VERB = re.compile(r"\b(?:them|xoa|tao|doi|sua|chuyen|add|delete|create|rename)\b")
_CURRENT_SECTION_NAME = re.compile(
    r"\b(?:section|muc)\s+(?:nay|hien\s+tai|dang\s+(?:xem|mo))\s+(?:la\s+(?:gi|cai\s+gi|nao)|ten\s+(?:la\s+)?gi)\b"
)
_PAGE_ITEM_SECTION = re.compile(
    r"\b(?:bai(?:\s+hoc)?|trang)\s+(?:nay|hien\s+tai|dang\s+(?:xem|mo))\s+(?:nam\s+o|o|thuoc)\s+(?:muc|section)\s+(?:nao|gi)\b"
)
_WHERE_SECTION = re.compile(r"^\s*(?:toi\s+|minh\s+|em\s+)?(?:dang\s+)?(?:o|xem)\s+(?:muc|section)\s+(?:nao|gi)\b")
_SECTION_LESSONS_ASK = re.compile(r"\b(?:bai(?:\s+hoc)?|lessons?|bao\s+nhieu|may\s+bai|co\s+nhung)\b")

# The topic the message names: "… (trong|của) topic <name>", up to "thành" or the end. Accented or not.
_TOPIC_CLAUSE = re.compile(
    r"\s+(?:trong|của|cua|ở|tại|tai|thuộc|thuoc)\s+(?:topic|lộ\s+trình|lo\s+trinh|chủ\s+đề|chu\s+de)\s+"
    r"(?P<topic>.+?)(?=\s+(?:thành|thanh|sang)\s|\s*[.!?]*\s*$)",
    re.IGNORECASE,
)
# "đổi tên mục <from> thành <to>" once the topic clause is taken out
RENAME_SECTION = re.compile(
    r"^\s*(?:hãy\s+|hay\s+)?(?:đổi|doi|sửa|sua)\s+(?:tên|ten)\s+(?:mục|muc|section)\s+(?P<src>.+?)"
    r"\s+(?:thành|thanh|sang|->|→)\s+(?P<dst>.+?)\s*[.!?]*\s*$",
    re.IGNORECASE,
)
_QUOTES = "\"'`“”‘’«»"
# "topic này", "topic hiện tại": the open page or the session's topic, not a name
_THIS_TOPIC = {"này", "nay", "đó", "do", "nó", "hiện tại", "hien tai", "đang mở", "dang mo", "this", "it"}


def _clean(name: str) -> Optional[str]:
    cleaned = re.sub(r"\s+", " ", (name or "").strip().strip(_QUOTES).strip())
    return None if cleaned.lower() in _THIS_TOPIC else cleaned


def asks_section_list(text: str) -> bool:
    flat = fold(normalize_vietnamese(text).lower())
    return LIST_SECTIONS.search(flat) is not None and _CHANGE_VERB.search(flat) is None


def asks_current_section(text: str) -> bool:
    """True when the user asks which section the currently open page or lesson belongs to."""
    flat = fold(normalize_vietnamese(text).lower())
    if _CHANGE_VERB.search(flat) is not None:
        return False
    return bool(
        _CURRENT_SECTION_NAME.search(flat)
        or _PAGE_ITEM_SECTION.search(flat)
        or _WHERE_SECTION.search(flat)
    )


def parse_section_rename(text: str) -> Optional[dict]:
    """{"src", "dst", "topic"} for "đổi tên mục A thành B [trong topic C]", None for any other message."""
    raw = normalize_vietnamese(text).strip()
    topic = None
    if (m := _TOPIC_CLAUSE.search(raw)) is not None:
        topic = _clean(m.group("topic"))
        raw = (raw[: m.start()] + raw[m.end():]).strip()
    m = RENAME_SECTION.match(raw)
    if m is None:
        return None
    src, dst = _clean(m.group("src")), _clean(m.group("dst"))
    if not src or not dst:
        return None
    return {"src": src, "dst": dst, "topic": topic}


def section_counts(topic: dict) -> list[tuple[Optional[str], int]]:
    """(section, lessons) in page order; None is the topic's general group."""
    counts: dict[str, list] = {}
    for item in topic.get("items") or []:
        name = item.get("section") or None
        key = normalize_title(name) if name else ""
        counts.setdefault(key, [name, 0])[1] += 1
    return [(name, n) for name, n in counts.values()]


def section_list_reply(topic: dict) -> str:
    title = topic.get("title") or topic.get("slug")
    rows = section_counts(topic)
    if not rows:
        return f"Topic **{title}** chưa có bài học nào nên chưa có mục."
    named = [r for r in rows if r[0]]
    if not named:
        return f"Topic **{title}** chưa chia mục: cả {rows[0][1]} bài đang ở mục {GENERAL_SECTION}."
    general = next((n for name, n in rows if not name), 0)
    head = f"Topic **{title}** có {len(named)} mục"
    head += f", và {general} bài chưa vào mục nào (nhóm {GENERAL_SECTION})" if general else ""
    lines = "\n".join(f"- {name or GENERAL_SECTION} ({n} bài)" for name, n in rows)
    return f"{head}:\n\n{lines}"


class SectionCommands(AgentHostMixin):
    async def _section_topic(self, named: Optional[str], content: str, page_context, session_ctx) -> Optional[dict]:
        """The topic the message means: named in it, else the open page, else the session's. None when unknown."""
        candidates: list[Optional[str]] = [named] if named else []
        candidates += [await topic_named_in_message(content), (page_context or {}).get("roadmapSlug"),
                       session_ctx.active_topic_slug]
        for ref in candidates:
            if not ref:
                continue
            found = await resolve_topic(ref)
            if found.status == "found" and found.slug:
                return await get_adapter().get_topic(found.slug)
            if named and ref == named:
                return None  # a name the user wrote that matches no topic is asked back, not replaced
        return None

    async def _ask_section_topic(self, delay: float, example: str) -> AsyncGenerator[dict, None]:
        try:
            topics = await get_adapter().list_topics()
        except Exception as exc:
            print(f"[sections] Topic list skipped: {exc}")
            topics = []
        listing = "\n".join(f"- `{t.get('slug')}` — {t.get('title')}" for t in topics[:15]) or "_(chưa có topic nào)_"
        text = (
            f"Bạn muốn xem mục của topic nào?\n\n**Các topic hiện có:**\n{listing}\n\n"
            "Hãy gửi lại kèm tên topic, ví dụ:\n\n" + example_blocks(example)
        )
        async for ev in self._stream_text(text, delay):
            yield ev

    async def handle_section_list(
        self, *, content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """List a topic's sections: read-only, runs after the router for sub_intent CATALOG.

        Leaves `outcome["handled"]` False for other messages, so the caller falls back to the search.
        """
        if parse_section_rename(content) is not None or not asks_section_list(content):
            return
        outcome["handled"] = True

        named = None
        if (m := re.search(r"(?:topic|lộ\s+trình|chủ\s+đề)\s+(.+?)\s+(?:có|co)\s", content, re.IGNORECASE)):
            named = _clean(m.group(1))
        topic = await self._section_topic(named, content, page_context, session_ctx)
        if topic is None:
            async for ev in self._ask_section_topic(delay, "topic <tên topic> có những mục nào"):
                yield ev
            return
        yield {"type": "tool_start", "name": "list_sections", "args": {"topic": topic.get("slug")}}
        reply = section_list_reply(topic)
        yield {"type": "tool_end", "name": "list_sections", "result": reply}
        async for ev in self._stream_text(reply, delay):
            yield ev
        return

    async def _lookup_lesson_section(
        self, page_context: Optional[dict], topic_slug: Optional[str], lesson_ref: Optional[str]
    ) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
        """Look up a lesson's section and display labels from the local index, then the topic API."""
        if not lesson_ref:
            return None, None, None, topic_slug
        from rag_service.domains.roadmap.retrieval.engine import rag_engine

        lookup_ctx = page_context or {"roadmapSlug": topic_slug or "", "itemId": lesson_ref}
        page_doc = rag_engine.find_page_document(lookup_ctx)
        if page_doc is not None and page_doc.doc_type == "item":
            return (
                (page_doc.section or "").strip() or None,
                page_doc.title or None,
                page_doc.topic_title or None,
                page_doc.topic_slug or topic_slug,
            )
        if not topic_slug:
            return None, None, None, None
        try:
            topic = await get_adapter().get_topic(topic_slug)
        except Exception as exc:
            print(f"[sections] Lesson section lookup skipped: {exc}")
            return None, None, None, topic_slug
        if not topic:
            return None, None, None, topic_slug
        item = next(
            (i for i in topic.get("items") or [] if i.get("id") == lesson_ref or i.get("slug") == lesson_ref),
            None,
        )
        if item is None:
            return None, None, topic.get("title") or None, topic.get("slug") or topic_slug
        return (
            (item.get("section") or "").strip() or None,
            item.get("title") or None,
            topic.get("title") or None,
            topic.get("slug") or topic_slug,
        )

    async def _resolve_current_section(
        self, page_context: Optional[dict], session_ctx
    ) -> tuple[str, Optional[str], Optional[str], Optional[str], Optional[str]]:
        """Resolve `(status, section, lesson_title, topic_title, topic_slug)` from page context or thread state."""
        has_page = bool(
            page_context
            and any(str(page_context.get(k) or "").strip() for k in ("roadmapSlug", "itemId", "section"))
        )
        if has_page:
            section = ((page_context or {}).get("section") or "").strip() or None
            lesson_ref = ((page_context or {}).get("itemId") or "").strip() or None
            lesson_title = ((page_context or {}).get("itemTitle") or "").strip() or lesson_ref
            topic_slug = ((page_context or {}).get("roadmapSlug") or "").strip() or None
            topic_title = ((page_context or {}).get("roadmapTitle") or "").strip() or topic_slug
        else:
            section = (getattr(session_ctx, "active_section", None) or "").strip() or None
            lesson_ref = (getattr(session_ctx, "active_lesson_id", None) or "").strip() or None
            lesson_title = (getattr(session_ctx, "active_lesson_title", None) or "").strip() or lesson_ref
            topic_slug = (getattr(session_ctx, "active_topic_slug", None) or "").strip() or None
            topic_title = (getattr(session_ctx, "active_topic_title", None) or "").strip() or topic_slug

        if not section and lesson_ref:
            found_sec, found_lesson, found_topic, found_slug = await self._lookup_lesson_section(
                page_context if has_page else None, topic_slug, lesson_ref
            )
            section = found_sec or section
            lesson_title = found_lesson or lesson_title
            topic_title = found_topic or topic_title
            topic_slug = found_slug or topic_slug

        if section:
            return "found", section, lesson_title, topic_title, topic_slug
        if lesson_ref:
            return "general", None, lesson_title, topic_title, topic_slug
        if topic_slug:
            return "topic_only", None, None, topic_title, topic_slug
        return "none", None, None, None, None

    @staticmethod
    def _format_current_section_reply(
        status: str,
        section: Optional[str],
        lesson_title: Optional[str],
        topic_title: Optional[str],
        topic_slug: Optional[str],
    ) -> str:
        slug_part = f" (`{topic_slug}`)" if topic_slug and topic_title != topic_slug else ""
        topic_part = f" trong lộ trình **{topic_title}**{slug_part}" if topic_title else ""
        if status == "found" and section:
            if lesson_title:
                return f"Mục (section) hiện tại của bài **{lesson_title}**{topic_part} là **`{section}`**."
            if topic_title:
                return f"Mục (section) hiện tại{topic_part} là **`{section}`**."
            return f"Mục (section) hiện tại là **`{section}`**."
        if status == "general":
            return f"Bài học **{lesson_title}**{topic_part} chưa thuộc mục (section) riêng nào (đang ở nhóm **{GENERAL_SECTION}**)."
        if status == "topic_only":
            return f"Bạn đang xem lộ trình **{topic_title}**{slug_part} và chưa mở bài học hay mục (section) cụ thể nào."
        return "Mình chưa thấy bài học hay mục (section) nào đang mở. Bạn hãy mở một bài học hoặc nêu tên topic/bài muốn kiểm tra nhé."

    async def handle_current_section(
        self, *, content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Answer questions about the currently open section directly from page context or lesson metadata."""
        if not asks_current_section(content):
            return
        outcome["handled"] = True
        status, section, lesson_title, topic_title, topic_slug = await self._resolve_current_section(
            page_context, session_ctx
        )
        yield {
            "type": "tool_start",
            "name": "get_current_section",
            "args": {k: v for k, v in {"topic": topic_slug, "lesson": lesson_title, "section": section}.items() if v},
        }
        reply = self._format_current_section_reply(status, section, lesson_title, topic_title, topic_slug)
        yield {"type": "tool_end", "name": "get_current_section", "result": reply}
        async for ev in self._stream_text(reply, delay):
            yield ev

    def _build_section_rename_preview(
        self, rename: dict, topic: dict, session_ctx
    ) -> tuple[str | None, dict | None]:
        title = topic.get("title") or topic.get("slug")
        rows = [(name, n) for name, n in section_counts(topic) if name]
        src_key, dst_key = normalize_title(rename["src"]), normalize_title(rename["dst"])
        source = next(((name, n) for name, n in rows if normalize_title(name) == src_key), None)
        if source is None:
            existing = ", ".join(f"`{name}`" for name, _ in rows) or "_(chưa có mục nào)_"
            return (
                f"Topic **{title}** không có mục `{rename['src']}` nên mình chưa đổi gì. Các mục hiện có: {existing}.",
                None,
            )
        if src_key == dst_key and source[0] == rename["dst"]:
            return f"Mục `{source[0]}` đã có đúng tên này nên mình chưa đổi gì.", None
        merge = next((name for name, _ in rows if normalize_title(name) == dst_key and name != source[0]), None)
        session_ctx.pending_section_rename = {
            "topic": topic.get("slug"), "title": title, "from": source[0], "to": rename["dst"],
            "count": source[1], "merge": merge,
        }
        note = f"\n\n⚠️ Topic đã có mục `{merge}`: hai mục sẽ được gộp làm một." if merge else ""
        preview = (
            f"✏️ **ĐỔI TÊN MỤC**\n\n- Topic: **{title}**\n- `{source[0]}` → `{merge or rename['dst']}` "
            f"({source[1]} bài){note}\n\n"
            "👉 Bấm nút **[✅ Xác nhận thực hiện]** bên dưới hoặc gõ \"ok\" để tiến hành. Bấm **[❌ Hủy bỏ]** để hủy."
        )
        preview_ev = {
            "type": "action_preview",
            "action_id": session_ctx.session_id,
            "preview": preview,
            "editable_titles": [merge or rename["dst"]],
        }
        return preview, preview_ev

    async def handle_section_rename(
        self, *, content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """Preview renaming a section. Runs before the router: it writes, after "ok" (commands.handle_pending).

        Leaves `outcome["handled"]` False for other messages.
        """
        rename = parse_section_rename(content)
        if rename is None:
            return
        outcome["handled"] = True

        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        topic = await self._section_topic(rename["topic"], content, page_context, session_ctx)
        if topic is None:
            async for ev in self._ask_section_topic(delay, f"đổi tên mục {rename['src']} thành {rename['dst']} trong topic <tên topic>"):
                yield ev
            return

        reply, preview_ev = self._build_section_rename_preview(rename, topic, session_ctx)
        if preview_ev is not None:
            yield preview_ev
        async for ev in self._stream_text(reply or "", delay):
            yield ev
        # The confirmed rename runs in commands.handle_pending, the decision point that grants writes
