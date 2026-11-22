"""Background Owner Memory auto-suggestion extractor (ADR-0015, domain-neutral core).

Strict safety guarantees:
- Owner-only: Visitors NEVER trigger extraction or touch the memory store (ADR-0002).
- Always writes `source="suggested", status="pending"`; never activates memories without Owner approval.
- Fast heuristic pre-filter avoids LLM calls on ordinary questions or short commands.
- Fail-open: any LLM/network/parse error is swallowed so chat replies are never impacted.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, List, Optional, Sequence

from rag_service.auth import is_owner
from rag_service.core.memory.store import (
    OWNER_MEMORY_KINDS,
    OwnerMemoryItem,
    OwnerMemoryStore,
    owner_memory_store,
)

log = logging.getLogger(__name__)

MIN_MESSAGE_CHARS = 15
MIN_CONFIDENCE = 0.75
MAX_SUGGESTIONS_PER_TURN = 2
MAX_PENDING_MEMORIES = 10
EXTRACT_TIMEOUT_SECONDS = 20.0

_TRIVIAL_MESSAGES = frozenset({"ok", "okay", "oke", "yes", "co", "có", "huy", "hủy", "cancel", "no", "khong", "không"})

# Fast Vietnamese/English cues that hint the Owner stated a durable fact about themselves
_SIGNAL_CUES = (
    # Profile / background
    "minh la", "toi la", "kinh nghiem", "senior", "junior", "backend", "frontend", "fullstack", "engineer", "developer",
    # Techstack / tooling
    "dang dung", "chuyen sang", "nang cap len", "migrated to", "switched to", "techstack", "tech stack", "du an cua minh",
    "next.js", "nextjs", "fastapi", "turso", "prisma", "postgres", "redis", "docker", "kubernetes", "typescript", "python", "golang", "rust",
    # Goals / study plans
    "muc tieu", "dang on", "phong van", "muon hoc", "uu tien hoc", "ke hoach hoc", "thang nay", "quy nay", "q1", "q2", "q3", "q4",
    # Preferences / formatting
    "thich giai thich", "uu tien vi du", "tra loi ngan gon", "luon kem", "dung dich", "phong cach", "prefer",
    # Learning struggles / notes
    "hay nham", "thuong quen", "kho nho", "hay bi nham",
)


@dataclass(frozen=True)
class MemorySuggestion:
    kind: str
    content: str
    scope: Optional[str] = None
    replaces_memory_id: Optional[str] = None
    confidence: float = 0.8


def _fold_ascii(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", (text or "").replace("đ", "d").replace("Đ", "D"))
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower().strip()


def has_memory_signal(user_message: str) -> bool:
    """Cheap pre-filter: True only when the utterance plausibly contains a durable Owner fact."""
    cleaned = (user_message or "").strip()
    if len(cleaned) < MIN_MESSAGE_CHARS:
        return False
    flat = _fold_ascii(cleaned)
    if flat in _TRIVIAL_MESSAGES:
        return False
    # Pure questions rarely declare a durable personal fact unless paired with self-statement cues
    if cleaned.endswith("?") and not any(
        cue in flat for cue in ("minh dang", "toi dang", "minh dung", "toi dung", "minh la", "toi la", "hay nham", "muc tieu")
    ):
        return False
    return any(cue in flat for cue in _SIGNAL_CUES)


def _build_extraction_prompt(
    *,
    user_message: str,
    assistant_reply: str,
    existing_active: Sequence[OwnerMemoryItem],
    existing_pending: Sequence[OwnerMemoryItem],
    scope: Optional[str],
) -> str:
    active_lines = [
        f"- id={m.id} | kind={m.kind} | scope={m.scope or 'global'} | {m.content}"
        for m in existing_active[:30]
    ]
    pending_lines = [
        f"- kind={m.kind} | scope={m.scope or 'global'} | {m.content}"
        for m in existing_pending[:20]
    ]
    active_block = "\n".join(active_lines) if active_lines else "(trống)"
    pending_block = "\n".join(pending_lines) if pending_lines else "(trống)"
    scope_line = scope or "global"

    return (
        "Bạn là bộ trích xuất Owner Memory chạy nền.\n"
        "Nhiệm vụ: đọc lượt hội thoại gần nhất của Owner và chỉ trích xuất những sự thật BỀN VỮNG về chính Owner "
        "(nền tảng, techstack đang dùng, mục tiêu dài hạn, quy ước trả lời, hoặc điểm kiến thức hay nhầm).\n\n"
        "QUY TẮC BẮT BUỘC:\n"
        "1. Trả về JSON array hợp lệ, KHÔNG kèm giải thích ngoài JSON. Nếu không có gì đáng lưu lâu dài, trả về `[]`.\n"
        "2. BỎ QUA câu hỏi giả định, ví dụ minh hoạ, chuyện của người khác, hoặc yêu cầu nhất thời chỉ cho lượt này.\n"
        "3. KHÔNG gợi ý trùng lặp với bất kỳ mục nào trong danh sách ACTIVE hoặc PENDING bên dưới.\n"
        "4. Nếu sự thật mới THAY THẾ/CẬP NHẬT trực tiếp một mục ACTIVE (vd đổi phiên bản framework hay đổi mục tiêu), "
        "điền đúng `id` của mục đó vào `replaces_memory_id`; nếu không, để `null`.\n"
        "5. `kind` chỉ được là một trong: `profile`, `techstack`, `goal`, `preference`, `learning_note`.\n"
        "6. `content` viết ngắn gọn, rõ ràng bằng tiếng Việt (<= 220 ký tự), không chứa thẻ XML.\n"
        "7. `scoped`: `true` nếu chỉ áp dụng riêng cho ngữ cảnh đang mở (`" + scope_line + "`), `false` nếu áp dụng toàn cục.\n"
        "8. Chỉ đề xuất khi `confidence >= 0.75`. Tối đa 2 mục.\n\n"
        "Định dạng JSON:\n"
        '[{"kind":"techstack","content":"...","scoped":false,"replaces_memory_id":null,"confidence":0.9}]\n\n'
        f"ACTIVE MEMORIES:\n{active_block}\n\n"
        f"PENDING MEMORIES:\n{pending_block}\n\n"
        f"OWNER MESSAGE:\n{user_message[:1200]}\n\n"
        f"ASSISTANT REPLY (ngữ cảnh phụ):\n{assistant_reply[:800]}"
    )


def _extract_json_array(raw_text: str) -> list[Any]:
    text = (raw_text or "").strip()
    if not text:
        return []
    fenced = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1)
    else:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end > start:
            text = text[start : end + 1]
    parsed = json.loads(text)
    return parsed if isinstance(parsed, list) else []


def _parse_suggestions(
    raw_text: str,
    *,
    existing_active: Sequence[OwnerMemoryItem],
    existing_pending: Sequence[OwnerMemoryItem],
    scope: Optional[str],
) -> List[MemorySuggestion]:
    try:
        rows = _extract_json_array(raw_text)
    except (ValueError, TypeError):
        return []

    active_ids = {m.id for m in existing_active}
    known_contents = {
        _fold_ascii(m.content) for m in (*existing_active, *existing_pending)
    }

    out: List[MemorySuggestion] = []
    seen_new: set[str] = set()
    clean_scope = scope.strip().lower() if isinstance(scope, str) and scope.strip() else None

    for row in rows:
        if len(out) >= MAX_SUGGESTIONS_PER_TURN:
            break
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "").strip()
        content = " ".join(str(row.get("content") or "").split()).strip()[:300]
        if kind not in OWNER_MEMORY_KINDS or len(content) < 5:
            continue
        try:
            confidence = float(row.get("confidence", 0.0))
        except (TypeError, ValueError):
            continue
        if confidence < MIN_CONFIDENCE:
            continue

        folded = _fold_ascii(content)
        if folded in known_contents or folded in seen_new:
            continue
        seen_new.add(folded)

        raw_replaces = row.get("replaces_memory_id") or row.get("replacesMemoryId")
        replaces_id = str(raw_replaces).strip() if isinstance(raw_replaces, str) else None
        if replaces_id not in active_ids:
            replaces_id = None

        item_scope = clean_scope if (bool(row.get("scoped")) and clean_scope) else None
        out.append(
            MemorySuggestion(
                kind=kind,
                content=content,
                scope=item_scope,
                replaces_memory_id=replaces_id,
                confidence=confidence,
            )
        )
    return out


async def _invoke_llm_text(llm: Any, prompt: str) -> str:
    if hasattr(llm, "ainvoke"):
        res = await asyncio.wait_for(llm.ainvoke(prompt), timeout=EXTRACT_TIMEOUT_SECONDS)
        content = getattr(res, "content", res)
        if isinstance(content, list):
            return "".join(
                part.get("text", "") if isinstance(part, dict) else str(part) for part in content
            )
        return str(content or "")
    if hasattr(llm, "astream"):
        chunks: list[str] = []

        async def _collect() -> str:
            async for chunk in llm.astream(prompt):
                delta = getattr(chunk, "content", chunk)
                if isinstance(delta, str):
                    chunks.append(delta)
            return "".join(chunks)

        return await asyncio.wait_for(_collect(), timeout=EXTRACT_TIMEOUT_SECONDS)
    return ""


async def extract_memory_suggestions(
    llm: Any,
    *,
    user_message: str,
    assistant_reply: str = "",
    existing_active: Sequence[OwnerMemoryItem] = (),
    existing_pending: Sequence[OwnerMemoryItem] = (),
    scope: Optional[str] = None,
) -> List[MemorySuggestion]:
    """Run LLM extraction for durable Owner facts. Strict Owner-only and fail-open."""
    if not is_owner() or llm is None:
        return []
    if len(existing_pending) >= MAX_PENDING_MEMORIES:
        return []

    prompt = _build_extraction_prompt(
        user_message=user_message,
        assistant_reply=assistant_reply,
        existing_active=existing_active,
        existing_pending=existing_pending,
        scope=scope,
    )
    try:
        raw = await _invoke_llm_text(llm, prompt)
    except Exception as exc:
        log.warning("owner_memory.extractor: skipped due to LLM error (%s)", exc)
        return []

    return _parse_suggestions(
        raw,
        existing_active=existing_active,
        existing_pending=existing_pending,
        scope=scope,
    )


async def maybe_suggest_memories(
    llm: Any,
    *,
    user_message: str,
    assistant_reply: str = "",
    scope: Optional[str] = None,
    store: OwnerMemoryStore = owner_memory_store,
    bypass_prefilter: bool = False,
) -> List[OwnerMemoryItem]:
    """Background helper: extract & persist `pending` OwnerMemory suggestions (never `active`)."""
    if not is_owner() or llm is None:
        return []
    if not bypass_prefilter and not has_memory_signal(user_message):
        return []

    try:
        existing_active, existing_pending = await asyncio.gather(
            store.list_active(),
            store.list_pending(),
        )
    except Exception as exc:
        log.debug("owner_memory.extractor: failed to read existing memories (%s)", exc)
        return []

    if len(existing_pending) >= MAX_PENDING_MEMORIES:
        return []

    suggestions = await extract_memory_suggestions(
        llm,
        user_message=user_message,
        assistant_reply=assistant_reply,
        existing_active=existing_active,
        existing_pending=existing_pending,
        scope=scope,
    )
    created: List[OwnerMemoryItem] = []
    remaining_slots = max(MAX_PENDING_MEMORIES - len(existing_pending), 0)
    for suggestion in suggestions[:remaining_slots]:
        try:
            item = await store.create(
                kind=suggestion.kind,
                content=suggestion.content,
                scope=suggestion.scope,
                source="suggested",
                status="pending",
                replaces_memory_id=suggestion.replaces_memory_id,
            )
            created.append(item)
        except Exception as exc:
            log.warning("owner_memory.extractor: failed to save pending suggestion (%s)", exc)
    if created:
        log.info("owner_memory.extractor: saved %d pending suggestion(s)", len(created))
    return created
