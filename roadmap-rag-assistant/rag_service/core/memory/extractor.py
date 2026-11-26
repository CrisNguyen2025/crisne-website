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
DEDUPE_JACCARD_THRESHOLD = 0.72

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

_QUESTION_SELF_CUES = (
    "minh dang", "toi dang", "minh dung", "toi dung", "minh la", "toi la",
    "hay nham", "thuong nham", "hay quen", "thuong quen", "kho nho",
    "muc tieu", "du an cua minh", "he thong cua minh", "team minh",
)

_SELF_DECISION_OR_STRUGGLE_RE = re.compile(
    r"\b(?:"
    r"(?:tu gio|tu nay|sau nay|bat dau tu|ke tu nay|moi khi|luon nho|nho rang|dung quen)\b"
    r"|(?:minh|toi|team minh|du an nay)\s+(?:vua|moi|se|da chon|quyet dinh|chuyen sang|dung|lam|phu trach|chiu trach nhiem|hay bi|cu bi|bi nham|bi lan|van vuong|chua hieu|hay quen|muon tap trung|chi on)"
    r"|(?:y minh la|chinh xac la|thuc ra minh|truoc gio minh|cu nghi la|hay bi lan giua|nham giua)"
    r"|(?:going forward|from now on|always keep|remember that i|i work on|i decided to|i switched to|i keep confusing|i often forget)"
    r")\b"
)

_LOOKUP_PREFIX_RE = re.compile(
    r"^(?:giai thich|so sanh|cho vi du|neu su khac biet|tai sao|vi sao|lam sao|la gi|how does|how do|what is|explain|compare)\b"
)

_REPLY_INSIGHT_RE = re.compile(
    r"(?<!cac )(?<!nhieu )\b(?:"
    r"ban dang (?:nham|lan|hieu nham|mac loi)"
    r"|ban (?:da chon|vua xac nhan|vua chuyen|hay nham|thuong quen)"
    r"|diem ban hay nham|ghi nhan quy uoc|luu y rieng cho ban"
    r"|you might be confusing|noted your|i will keep in mind"
    r")\b"
)

_VERSION_TOKEN_RE = re.compile(r"\b(?:v?\d+(?:\.\d+)*|q[1-4]|20\d{2})\b")
_WORD_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[._-][a-z0-9]+)*")
_DEDUPE_STOP_WORDS = frozenset({
    "la", "va", "voi", "cua", "cho", "trong", "khi", "den", "tu", "thi", "ma", "de",
    "minh", "toi", "ban", "dang", "da", "se", "hay", "nen", "can", "muon", "duoc",
    "cac", "nhung", "mot", "nhieu", "hon", "rat", "ve", "tren", "duoi", "nay", "kia",
    "do", "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "with",
    "is", "are", "was", "were", "be", "my", "i", "we", "our",
})


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


def _content_tokens(text: str) -> set[str]:
    raw_tokens = _WORD_TOKEN_RE.findall(_fold_ascii(text))
    filtered = {tok for tok in raw_tokens if len(tok) > 1 and tok not in _DEDUPE_STOP_WORDS}
    return filtered or set(raw_tokens)


def _version_tokens(text: str) -> set[str]:
    return set(_VERSION_TOKEN_RE.findall(_fold_ascii(text)))


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    union = left | right
    return len(left & right) / len(union)


def _has_question_signal(flat_user: str, flat_reply: str) -> bool:
    if any(cue in flat_user for cue in _QUESTION_SELF_CUES) or _SELF_DECISION_OR_STRUGGLE_RE.search(flat_user):
        return True
    return bool(flat_reply and _REPLY_INSIGHT_RE.search(flat_reply))


def has_memory_signal(user_message: str, assistant_reply: str = "") -> bool:
    """Cheap pre-filter: True only when the turn plausibly contains a durable Owner fact."""
    cleaned = (user_message or "").strip()
    if len(cleaned) < MIN_MESSAGE_CHARS:
        return False
    flat = _fold_ascii(cleaned)
    if flat in _TRIVIAL_MESSAGES:
        return False
    flat_reply = _fold_ascii(assistant_reply)
    if cleaned.endswith("?"):
        return _has_question_signal(flat, flat_reply)
    if _SELF_DECISION_OR_STRUGGLE_RE.search(flat):
        return True
    if _LOOKUP_PREFIX_RE.search(flat) and not any(cue in flat for cue in _QUESTION_SELF_CUES):
        return False
    if any(cue in flat for cue in _SIGNAL_CUES):
        return True
    return bool(flat_reply and _REPLY_INSIGHT_RE.search(flat_reply))


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


def _is_paraphrase_match(
    cand_tokens: set[str],
    cand_versions: set[str],
    other_tokens: set[str],
    other_versions: set[str],
) -> bool:
    return _jaccard(cand_tokens, other_tokens) >= DEDUPE_JACCARD_THRESHOLD and cand_versions == other_versions


def _resolve_dedupe_and_replaces(
    *,
    content: str,
    kind: str,
    explicit_replaces_id: Optional[str],
    existing_active: Sequence[OwnerMemoryItem],
    existing_pending: Sequence[OwnerMemoryItem],
    seen_entries: Sequence[tuple[str, set[str], set[str]]],
) -> tuple[bool, Optional[str]]:
    folded = _fold_ascii(content)
    cand_tokens = _content_tokens(content)
    cand_versions = _version_tokens(content)

    for s_fold, s_tokens, s_versions in seen_entries:
        if folded == s_fold or _is_paraphrase_match(cand_tokens, cand_versions, s_tokens, s_versions):
            return True, None

    for item in existing_pending:
        if folded == _fold_ascii(item.content) or _is_paraphrase_match(
            cand_tokens, cand_versions, _content_tokens(item.content), _version_tokens(item.content)
        ):
            return True, None

    auto_replaces = explicit_replaces_id
    best_overlap = 0.0
    for item in existing_active:
        item_fold = _fold_ascii(item.content)
        item_tokens = _content_tokens(item.content)
        item_versions = _version_tokens(item.content)
        if folded == item_fold or _is_paraphrase_match(cand_tokens, cand_versions, item_tokens, item_versions):
            return True, None
        if auto_replaces is None and item.kind == kind:
            sim = _jaccard(cand_tokens, item_tokens)
            if sim >= 0.45 and item_versions != cand_versions and sim > best_overlap:
                best_overlap = sim
                auto_replaces = item.id
    return False, auto_replaces


def _parse_row_confidence(row: dict[str, Any]) -> Optional[float]:
    try:
        confidence = float(row.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None
    return confidence if confidence >= MIN_CONFIDENCE else None


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
    out: List[MemorySuggestion] = []
    seen_entries: list[tuple[str, set[str], set[str]]] = []
    clean_scope = scope.strip().lower() if isinstance(scope, str) and scope.strip() else None

    for row in rows:
        if len(out) >= MAX_SUGGESTIONS_PER_TURN:
            break
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "").strip()
        content = " ".join(str(row.get("content") or "").split()).strip()[:300]
        confidence = _parse_row_confidence(row)
        if kind not in OWNER_MEMORY_KINDS or len(content) < 5 or confidence is None:
            continue

        raw_replaces = row.get("replaces_memory_id") or row.get("replacesMemoryId")
        replaces_id = str(raw_replaces).strip() if isinstance(raw_replaces, str) else None
        if replaces_id not in active_ids:
            replaces_id = None

        is_dup, replaces_id = _resolve_dedupe_and_replaces(
            content=content,
            kind=kind,
            explicit_replaces_id=replaces_id,
            existing_active=existing_active,
            existing_pending=existing_pending,
            seen_entries=seen_entries,
        )
        if is_dup:
            continue
        seen_entries.append((_fold_ascii(content), _content_tokens(content), _version_tokens(content)))

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
    if not bypass_prefilter and not has_memory_signal(user_message, assistant_reply):
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
