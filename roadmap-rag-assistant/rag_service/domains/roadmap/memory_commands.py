"""Explicit Owner Memory commands via chat (ADR-0015): remember, forget, inspect.

Mixed into NextGenRoadmapAgent and run before the router (step 1e), matching the pattern of
sections.py / lesson_edit.py / lesson_status.py so write commands always go through Preview -> "ok"
and never disturb the router stress baseline.

Strict Actor isolation (ADR-0002, ADR-0015):
- Visitors are refused immediately with OWNER_ONLY_MESSAGE for read, create, and archive.
- Pending memory changes live only in RAM (TTL 10 minutes) and are never persisted.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import AsyncGenerator, Literal, Optional, Sequence

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.core.memory import KIND_LABELS, OwnerMemoryItem, owner_memory_store
from rag_service.domains.roadmap.host import AgentHostMixin
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.tools.topic_resolver import resolve_topic

MemoryAction = Literal["create", "archive", "list"]

_QUOTES = "\"'`“”‘’«»"

# View/list memories: must NOT match short-term recall like "tôi tên gì?" or "hồi nãy mình hỏi gì?"
_VIEW_MEMORY_RE = re.compile(
    r"^\s*(?:"
    r"(?:bạn|abot|bot)\s+(?:đang\s+)?nhớ\s+(?:những\s+)?gì\s+về\s+(?:mình|tôi|tao|em|anh)"
    r"|(?:xem|liệt\s+kê|hiển\s+thị|cho\s+(?:mình|tôi)\s+xem)\s+(?:lại\s+)?(?:bộ\s+nhớ|các\s+ghi\s+nhớ|ghi\s+nhớ|owner\s+memory|memory)"
    r"|(?:bộ\s+nhớ|ghi\s+nhớ)\s+(?:của\s+(?:bạn|abot|mình|tôi)\s+)?(?:đang\s+)?có\s+(?:những\s+)?gì"
    r"|những\s+gì\s+(?:bạn|abot)\s+(?:đang\s+)?nhớ\s+(?:về\s+(?:mình|tôi))?"
    r")\s*[?!.\s]*$",
    re.IGNORECASE,
)

# Explicit remember command: anchored at start to avoid matching questions ("bạn có nhớ ... không?")
_REMEMBER_PREFIX_RE = re.compile(
    r"^\s*(?:(?:bạn|abot|bot)\s+)?"
    r"(?:(?:hãy|vui\s+lòng|làm\s+ơn)\s+)?"
    r"(?:"
    r"ghi\s+nhớ(?:\s+lại)?(?:\s+giúp\s+(?:mình|tôi|em|anh)|\s+giùm\s+(?:mình|tôi|em|anh)|\s+cho\s+(?:mình|tôi|em|anh))?"
    r"|lưu\s+(?:lại\s+)?(?:vào\s+bộ\s+nhớ|bộ\s+nhớ)(?:\s+(?:giúp|giùm|cho)\s+(?:mình|tôi|em|anh))?"
    r"|lưu\s+lại\s+(?:giúp|giùm|cho)\s+(?:mình|tôi|em|anh)"
    r"|nhớ\s+(?:giúp|giùm|cho)\s+(?:mình|tôi|em|anh)"
    r"|nhớ\s+(?:rằng|là)"
    r"|(?:từ\s+giờ|sau\s+này|từ\s+nay)\s+(?:hãy\s+)?(?:ghi\s+)?nhớ"
    r"|hãy\s+nhớ"
    r"|remember(?:\s+that)?"
    r")"
    r"(?:\s*(?::|-|–|—)\s*|\s+(?:rằng|là)\s+|\s+)"
    r"(?P<body>.+?)\s*$",
    re.IGNORECASE | re.DOTALL,
)

# Explicit forget / archive command: requires "quên ..." or "xóa/xoá ghi nhớ|bộ nhớ|memory ..."
_FORGET_RE = re.compile(
    r"^\s*(?:(?:hãy|vui\s+lòng|làm\s+ơn)\s+)?"
    r"(?:"
    r"quên(?:\s+(?:giúp|giùm|cho)\s+(?:mình|tôi|em|anh))?\s+(?:ghi\s+nhớ\s+|bộ\s+nhớ\s+|mục\s+nhớ\s+|việc\s+|thông\s+tin\s+|rằng\s+|là\s+)?"
    r"|(?:xoá|xóa|bỏ|gỡ)(?:\s+(?:giúp|giùm|cho)\s+(?:mình|tôi|em|anh))?\s+(?:ghi\s+nhớ|bộ\s+nhớ|mục\s+nhớ|memory)(?:\s+(?:về|là|:))?\s+"
    r"|forget(?:\s+that|\s+about)?\s+"
    r")"
    r"(?P<target>.+?)(?:\s+đi)?(?:\s+(?:nhé|nha|giúp\s+(?:mình|tôi)|giùm\s+(?:mình|tôi)))?\s*[.!]*\s*$",
    re.IGNORECASE,
)

_THIS_TOPIC_SCOPE_RE = re.compile(
    r"(?:\s*,?\s*|\s+)(?:trong|cho|ở|áp\s+dụng\s+cho)\s+topic\s+(?:này|đang\s+mở|hiện\s+tại)\b",
    re.IGNORECASE,
)
_NAMED_TOPIC_SCOPE_RE = re.compile(
    r"(?:\s*,?\s*|\s+)(?:trong|cho|ở|áp\s+dụng\s+cho)\s+topic\s+(?P<topic>[A-Za-z0-9À-ỹ _./-]{1,60}?)(?=\s*[,.:;!?]*\s*$)",
    re.IGNORECASE,
)

_PREFERENCE_CUES = (
    "khi viet", "viet bai", "viet nhap", "tra loi", "giai thich", "ngan gon", "chi tiet",
    "format", "dinh dang", "loi hay gap", "tu gio", "luon co", "dung dich", "uu tien vi du",
    "phong cach", "style", "template",
)
_TECHSTACK_CUES = (
    "dang dung", "su dung", "techstack", "tech stack", "stack", "framework",
    "next.js", "nextjs", "react", "fastapi", "python", "typescript", "turso", "prisma",
    "docker", "kubernetes", "postgres", "redis", "tailwind", "vue", "golang", "rust", "java",
)
_GOAL_CUES = (
    "muc tieu", "dang on", "phong van", "muon hoc", "uu tien hoc", "du dinh", "ke hoach hoc",
    "q1", "q2", "q3", "q4",
)
_PROFILE_CUES = (
    "minh la", "toi la", "kinh nghiem", "senior", "junior", "backend", "frontend",
    "fullstack", "ky su", "developer", "engineer", "ten la", "ten minh", "ten toi",
)


@dataclass(frozen=True)
class MemoryCommandRequest:
    action: MemoryAction
    content: str = ""
    topic_hint: Optional[str] = None
    use_current_topic: bool = False


def infer_memory_kind(content: str) -> str:
    """Heuristically classify an explicit Owner Memory statement into one of the 5 ADR-0015 kinds."""
    flat = fold(normalize_vietnamese(content).lower())
    if any(cue in flat for cue in _PREFERENCE_CUES):
        return "preference"
    if any(cue in flat for cue in _TECHSTACK_CUES):
        return "techstack"
    if any(cue in flat for cue in _GOAL_CUES):
        return "goal"
    if any(cue in flat for cue in _PROFILE_CUES):
        return "profile"
    return "learning_note"


def parse_memory_command(text: str) -> Optional[MemoryCommandRequest]:
    """Parse an explicit remember / forget / inspect memory utterance, or return None."""
    cleaned = normalize_vietnamese(text or "").strip()
    if not cleaned:
        return None

    if _VIEW_MEMORY_RE.match(cleaned):
        return MemoryCommandRequest(action="list")

    if m := _REMEMBER_PREFIX_RE.match(cleaned):
        body = m.group("body").strip().strip(_QUOTES).strip()
        # Reject interrogative sentences ("hãy nhớ hôm qua tôi nói gì không?")
        if not body or body.endswith("?"):
            return None
        use_current_topic = False
        topic_hint: Optional[str] = None
        if _THIS_TOPIC_SCOPE_RE.search(body):
            use_current_topic = True
            body = _THIS_TOPIC_SCOPE_RE.sub("", body).strip(" ,;:-")
        elif tm := _NAMED_TOPIC_SCOPE_RE.search(body):
            topic_hint = tm.group("topic").strip().strip(_QUOTES).strip()
            body = body[: tm.start()].strip(" ,;:-")
        body = re.sub(r"^(?:rằng|là)\s+", "", body, flags=re.IGNORECASE).strip()
        if not body:
            return None
        return MemoryCommandRequest(
            action="create",
            content=body[:300],
            topic_hint=topic_hint,
            use_current_topic=use_current_topic,
        )

    if m := _FORGET_RE.match(cleaned):
        target = m.group("target").strip().strip(_QUOTES).strip()
        if not target or target.endswith("?"):
            return None
        return MemoryCommandRequest(action="archive", content=target[:300])

    return None


def find_matching_memory(query: str, items: Sequence[OwnerMemoryItem]) -> Optional[OwnerMemoryItem]:
    """Find the best matching active OwnerMemory item for a forget/archive command."""
    wanted = fold(normalize_vietnamese(query).lower()).strip()
    if not wanted or not items:
        return None
    for item in items:
        cand = fold(item.content.lower())
        if cand == wanted or wanted in cand or cand in wanted:
            return item
    wanted_tokens = {tok for tok in re.findall(r"[a-z0-9]+", wanted) if len(tok) >= 2}
    if not wanted_tokens:
        return None
    best: Optional[OwnerMemoryItem] = None
    best_overlap = 0.0
    for item in items:
        cand_tokens = {tok for tok in re.findall(r"[a-z0-9]+", fold(item.content.lower())) if len(tok) >= 2}
        if not cand_tokens:
            continue
        overlap = len(wanted_tokens & cand_tokens) / len(wanted_tokens)
        if overlap >= 0.5 and overlap > best_overlap:
            best_overlap = overlap
            best = item
    return best


def format_memory_list_reply(active: Sequence[OwnerMemoryItem], pending_count: int = 0) -> str:
    if not active and not pending_count:
        return (
            "🧠 Hiện tại mình chưa lưu mục **Owner Memory** nào cho bạn.\n\n"
            "Bạn có thể dặn mình bằng cách nhắn ví dụ: `nhớ giúp mình là mình đang dùng Next.js 15 và FastAPI`, "
            "hoặc bấm **Bộ nhớ** trong menu tùy chọn để quản lý trực tiếp."
        )

    lines = [f"🧠 **Bộ nhớ Owner hiện có ({len(active)} mục đang bật):**"]
    grouped: dict[str, list[OwnerMemoryItem]] = {}
    for item in active:
        grouped.setdefault(item.kind, []).append(item)

    for kind in ("preference", "techstack", "goal", "profile", "learning_note"):
        bucket = grouped.get(kind)
        if not bucket:
            continue
        lines.append(f"\n**{KIND_LABELS.get(kind, kind)} ({len(bucket)}):**")
        for idx, item in enumerate(bucket, start=1):
            scope = f" *(topic: `{item.scope}`)*" if item.scope else ""
            lines.append(f"{idx}. {item.content}{scope}")

    if pending_count > 0:
        lines.append(f"\n⏳ Còn **{pending_count}** mục đang ở trạng thái **chờ duyệt** (mở mục **Bộ nhớ** để xem và duyệt).")
    return "\n".join(lines)


class MemoryCommands(AgentHostMixin):
    async def handle_memory_command(
        self,
        *,
        content: str,
        page_context,
        session_ctx,
        delay: float,
        outcome: dict,
    ) -> AsyncGenerator[dict, None]:
        """Handle explicit Owner Memory read / create / archive commands before the router (ADR-0015)."""
        req = parse_memory_command(content)
        if req is None:
            return

        outcome["handled"] = True
        if not is_owner():
            async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay):
                yield ev
            return

        if req.action == "list":
            active = await owner_memory_store.list_active()
            pending = await owner_memory_store.list_pending()
            reply = format_memory_list_reply(active, len(pending))
            yield {"type": "tool_start", "name": "list_owner_memories", "args": {}}
            yield {"type": "tool_end", "name": "list_owner_memories", "result": f"{len(active)} active, {len(pending)} pending"}
            async for ev in self._stream_text(reply, delay):
                yield ev
            return

        if req.action == "create":
            kind = infer_memory_kind(req.content)
            scope_slug: Optional[str] = None
            if req.use_current_topic:
                scope_slug = ((page_context or {}).get("roadmapSlug") or "").strip() or session_ctx.active_topic_slug
            elif req.topic_hint:
                found = await resolve_topic(req.topic_hint)
                if found.status == "found" and found.slug:
                    scope_slug = found.slug
                else:
                    async for ev in self._stream_text(
                        f"Không tìm thấy topic `{req.topic_hint}` để gắn phạm vi bộ nhớ. "
                        "Bạn hãy kiểm tra lại tên topic hoặc bỏ tên topic để lưu toàn cục.",
                        delay,
                    ):
                        yield ev
                    return

            session_ctx.clear_pending()
            session_ctx.pending_memory_change = {
                "op": "create",
                "kind": kind,
                "content": req.content,
                "scope_topic_slug": scope_slug,
            }
            scope_label = f"Topic `{scope_slug}`" if scope_slug else "Toàn cục (mọi Topic)"
            preview_text = (
                "🧠 **Lưu vào Bộ nhớ Owner**\n\n"
                f"- **Loại:** {KIND_LABELS.get(kind, kind)} (`{kind}`)\n"
                f"- **Phạm vi:** {scope_label}\n"
                f"- **Nội dung:** {req.content}\n\n"
                "👉 Bấm **[✅ Xác nhận thực hiện]** (hoặc gõ **ok**) để lưu, hoặc bấm **[❌ Hủy bỏ]** để bỏ qua."
            )
            yield {
                "type": "action_preview",
                "action_id": session_ctx.session_id,
                "preview": preview_text,
            }
            async for ev in self._stream_text(preview_text, delay):
                yield ev
            return

        if req.action == "archive":
            active = await owner_memory_store.list_active()
            match = find_matching_memory(req.content, active)
            if match is None:
                reply = (
                    f"Mình không tìm thấy mục bộ nhớ nào khớp với **{req.content}**.\n\n"
                    + (format_memory_list_reply(active) if active else "Bộ nhớ Owner hiện đang trống.")
                )
                async for ev in self._stream_text(reply, delay):
                    yield ev
                return

            session_ctx.clear_pending()
            session_ctx.pending_memory_change = {
                "op": "archive",
                "memory_id": match.id,
                "kind": match.kind,
                "content": match.content,
                "scope_topic_slug": match.scope,
            }
            scope_label = f"Topic `{match.scope}`" if match.scope else "Toàn cục"
            preview_text = (
                "🗑️ **Gỡ khỏi Bộ nhớ Owner**\n\n"
                f"- **Loại:** {KIND_LABELS.get(match.kind, match.kind)} (`{match.kind}`)\n"
                f"- **Phạm vi:** {scope_label}\n"
                f"- **Nội dung:** {match.content}\n\n"
                "👉 Bấm **[✅ Xác nhận thực hiện]** (hoặc gõ **ok**) để gỡ, hoặc bấm **[❌ Hủy bỏ]** để giữ lại."
            )
            yield {
                "type": "action_preview",
                "action_id": session_ctx.session_id,
                "preview": preview_text,
            }
            async for ev in self._stream_text(preview_text, delay):
                yield ev
            return
