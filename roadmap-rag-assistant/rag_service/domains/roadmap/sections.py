"""Sections of a topic through the agent (ADR-0009): list them, and rename one (owner only, after a preview).

Mixed into NextGenRoadmapAgent. Both are read from the message by pattern, before the router: listing is answered
from the topic's `sections` (never the LLM, so no section is made up), and a rename is previewed and runs on "ok"
through handle_pending. The topic is the one named in the message, else the open page, else the session's.
"""

from __future__ import annotations

import re
from typing import AsyncGenerator, Optional

from rag_service.adapters.errors import normalize_title
from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.grounding import example_blocks
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.tools import get_adapter
from rag_service.tools.topic_resolver import resolve_topic, topic_named_in_message

GENERAL_SECTION = "Chung"
_CHANGE_VERB = re.compile(r"\b(?:them|xoa|tao|doi|sua|chuyen|add|delete|create|rename)\b")

# "topic X có những mục nào", "các mục của topic X", "liệt kê mục". Folded. "mục RAG có những bài gì" is a search.
LIST_SECTIONS = re.compile(
    r"\bco\s+(?:nhung\s+|cac\s+)?(?:muc|section)s?\s+(?:nao|gi)\b"
    r"|\b(?:liet\s+ke|danh\s+sach|xem)\s+(?:cac\s+|nhung\s+)?(?:muc|section)s?\b"
    r"|\b(?:cac|nhung)\s+(?:muc|section)s?\s+(?:cua|trong)\b"
)

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


class SectionCommands:
    async def _section_topic(self, named: Optional[str], content: str, page_context, session_ctx) -> Optional[dict]:
        """The topic the message means: named in it, else the open page, else the session's. None when unknown."""
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

    async def handle_sections(
        self, *, content: str, page_context, session_ctx, delay: float, outcome: dict
    ) -> AsyncGenerator[dict, None]:
        """List a topic's sections, or preview renaming one. Leaves `outcome["handled"]` False for other messages."""
        rename = parse_section_rename(content)
        if rename is None and not asks_section_list(content):
            return
        outcome["handled"] = True

        if rename is None:
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

        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return
        topic = await self._section_topic(rename["topic"], content, page_context, session_ctx)
        if topic is None:
            async for ev in self._ask_section_topic(delay, f"đổi tên mục {rename['src']} thành {rename['dst']} trong topic <tên topic>"):
                yield ev
            return

        title = topic.get("title") or topic.get("slug")
        rows = [(name, n) for name, n in section_counts(topic) if name]
        src_key, dst_key = normalize_title(rename["src"]), normalize_title(rename["dst"])
        source = next(((name, n) for name, n in rows if normalize_title(name) == src_key), None)
        if source is None:
            existing = ", ".join(f"`{name}`" for name, _ in rows) or "_(chưa có mục nào)_"
            reply = f"Topic **{title}** không có mục `{rename['src']}` nên mình chưa đổi gì. Các mục hiện có: {existing}."
            async for ev in self._stream_text(reply, delay):
                yield ev
            return
        if src_key == dst_key and source[0] == rename["dst"]:
            async for ev in self._stream_text(f"Mục `{source[0]}` đã có đúng tên này nên mình chưa đổi gì.", delay):
                yield ev
            return
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
        yield {"type": "action_preview", "action_id": session_ctx.session_id, "preview": preview}
        async for ev in self._stream_text(preview, delay):
            yield ev
        # The confirmed rename runs in commands.handle_pending, the decision point that grants writes
