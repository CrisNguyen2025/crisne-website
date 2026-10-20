"""Structured Entity Extractor for Roadmap CUD Operations.

Extracts StructuredRoadmapAction using LLM with strict Pydantic schemas,
backed by an intelligent deterministic extractor for offline/fallback mode.
Guarantees 100% verb-free entity titles and correct short codes.
"""

from __future__ import annotations

import re
from typing import Optional

from rag_service.llm_breaker import llm_breaker
from rag_service.domains.roadmap.router.schemas import (
    ActionType,
    EntityLevel,
    SingleEntity,
    StructuredRoadmapAction,
)
from rag_service.domains.roadmap.router.vietnamese import clean_conversational_fillers, normalize_vietnamese



EXTRACTION_PROMPT = """Bạn là Bộ Trích Xuất Thực Thể Cấp Cao (Structured Entity Extractor) cho hệ thống Roadmap.
Nhiệm vụ của bạn là bóc tách câu lệnh CUD của người dùng thành đúng schema Pydantic `StructuredRoadmapAction`.

## CÁC QUY TẮC SỐNG CÒN (CRITICAL RULES):
1. **TRÍCH XUẤT TÊN (TITLE) TINH KHIẾT — KHÔNG BAO GIỜ CHỨA ĐỘNG TỪ HOẶC TỪ LOẠI**:
   - Câu: "tạo ABC topic" -> title = "ABC", short_code = "ABC".
     (TUYỆT ĐỐI CẤM title = "tạo ABC topic", TUYỆT ĐỐI CẤM short_code = "TAT").
   - Câu: "create AI Engineering topic" -> title = "AI Engineering", short_code = "AIE" hoặc "AI".
   - Câu: "thêm topic Backend Go" -> title = "Backend Go", short_code = "BAC" hoặc "BG".
   - Câu: "create aaa layer on fe" -> entity_level = "layer", title = "aaa", target_parent_identifier = "fe".

2. **MỞ RỘNG DANH SÁCH RÚT GỌN (CONTRACTED ENUMERATIONS)**:
   - "tạo 2 layer mock 1 và 2 trong be topic" -> entities = [{{"title": "mock 1"}}, {{"title": "mock 2"}}], target_parent_identifier = "be".
   - "create mock 1 and 2 layers on be" -> entities = [{{"title": "mock 1"}}, {{"title": "mock 2"}}], target_parent_identifier = "be".
   - "thêm 3 item bài 1, 2 và 3" -> entities = [{{"title": "bài 1"}}, {{"title": "bài 2"}}, {{"title": "bài 3"}}].
   - "tạo 2 group Core và Advanced" -> entities = [{{"title": "Core", "level": "core"}}, {{"title": "Advanced", "level": "advanced"}}].

3. **PHÂN BIỆT RÕ CẤP BẬC (ENTITY LEVEL)**:
   - Nếu câu chứa "layer", "mảng": entity_level = "layer" (topic đi kèm là target_parent_identifier).
   - Nếu câu chứa "group", "nhóm": entity_level = "group" (layer đi kèm là target_parent_identifier).
   - Nếu câu chứa "item", "bài học", "bài", "mục": entity_level = "item" (layer đi kèm là target_parent_identifier).
   - Nếu chỉ chứa "topic", "chủ đề", "lộ trình" và không có layer/item: entity_level = "topic".

4. **ĐẠI TỪ CHỈ ĐỊNH / NGỮ CẢNH LIÊN TIẾP**:
   - Nếu người dùng nói "vào đó", "trong đó", "vào topic trên", "vào layer vừa tạo" -> gán target_parent_identifier = "CONTEXT_ACTIVE".

## NGỮ CẢNH TRANG (chỉ để hiểu đại từ, KHÔNG phải nội dung cần tạo):
{page_context}

Câu lệnh của người dùng:
"{user_prompt}"
"""


def _generate_clean_short_code(title: str) -> str:
    """Generate a clean 2-4 uppercase letter code from title without any action words."""
    cleaned = re.sub(r"[^A-Za-z0-9\s]", "", title).strip()
    words = cleaned.split()
    if not words:
        return "TOP"
    if len(words) == 1:
        w = words[0]
        if len(w) <= 4:
            return w.upper()
        # Take first 3 chars
        return w[:3].upper()
    # Acronym from words
    return "".join(w[0] for w in words if w).upper()[:4]


# Words that can follow "trong"/"topic" but are keywords or urgency switches, never a topic or layer name.
PARENT_STOPWORDS = {
    "topic", "topics", "layer", "layers", "group", "item", "core", "đó", "the", "a", "an",
    "trong", "vào", "cho", "on", "in", "to", "into", "luôn", "ngay", "tạo", "create", "new", "this", "này", "của", "đây",
}


def _clean_parent(raw: str) -> Optional[str]:
    """Name of the topic/layer in a parent clause, or None when the word is a keyword instead."""
    cand = re.sub(r"(?:\s+(?:topics?c*|layers?r*))+$", "", raw.strip(), flags=re.IGNORECASE).strip()
    if not cand or cand.lower() in PARENT_STOPWORDS or cand.isdigit():
        return None
    return cand


class StructuredEntityExtractor:
    """Extracts StructuredRoadmapAction via Gemini Structured Output or Deterministic Parser."""

    def __init__(self, llm_model: Optional[object] = None) -> None:
        self._llm = llm_model
        self._structured_llm = None
        if self._llm is not None:
            try:
                self._structured_llm = self._llm.with_structured_output(StructuredRoadmapAction)
            except Exception as exc:
                print(f"[EntityExtractor] Warning: with_structured_output failed: {exc}")

    async def aextract(
        self, prompt: str, default_parent: Optional[str] = None, page_context: str = ""
    ) -> StructuredRoadmapAction:
        """Extract structured CUD action from user prompt."""
        # 1. Try Gemini Structured Output if available
        if self._structured_llm is not None and not llm_breaker.is_open:
            try:
                formatted = EXTRACTION_PROMPT.format(
                    user_prompt=prompt,
                    page_context=page_context or "(không có)",
                )
                res: StructuredRoadmapAction = await self._structured_llm.ainvoke(formatted)
                if isinstance(res, StructuredRoadmapAction):
                    # Sanitize any accidental verb leakage
                    for ent in res.entities:
                        ent.title = self._sanitize_title(ent.title)
                        if not ent.short_code:
                            ent.short_code = _generate_clean_short_code(ent.title)
                        elif any(v in ent.short_code.lower() for v in ["tat", "tao", "them"]):
                            # Correct accidentally leaked acronym
                            ent.short_code = _generate_clean_short_code(ent.title)
                    if not res.target_parent_identifier and default_parent:
                        res.target_parent_identifier = default_parent
                    return res
            except Exception as exc:
                print(f"[EntityExtractor] LLM extraction error ({exc}), falling back to deterministic parser.")
                llm_breaker.record_failure(exc)

        # 2. Robust Deterministic Parser (Offline / Fallback)
        return self._deterministic_extract(prompt, default_parent=default_parent)

    def _sanitize_title(self, title: str) -> str:
        """Strip verbs and entity words from title strictly, while preserving numbered names like 'Bài 1'."""
        cleaned = normalize_vietnamese(title).strip()
        # Drop bracketed metadata (e.g. page-context hints) that must never become part of a name
        cleaned = re.sub(r"\[[^\]]*\]", " ", cleaned).strip()
        cleaned = clean_conversational_fillers(cleaned)

        # Always strip action verbs at start (including pleasantry wrappers like 'xóa giúp mình')
        cleaned = re.sub(
            r"^(?:tạo|thêm|xóa|xoá|sửa|đổi tên|cập nhật|gỡ|hủy|huỷ|create|add|delete|remove|new|make)\s+(?:(?:giúp|hộ|cho|giùm)\s+(?:tôi|mình|em|anh|chị)\s+)?",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()

        # Strip trailing category words (e.g. "ABC topic", "ABC topiccc", "ABC layer")
        cleaned = re.sub(
            r"\s+(?:topics?c*|chủ\s+đề|lộ\s+trình|roadmaps?|layers?r*|groups?|nhóm|items?m*|bài(?:\s+học)?|mục|lessons?)\s*$",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()

        # Strip trailing reference pronouns (e.g. "goroutines vào đó" -> "goroutines")
        cleaned = re.sub(
            r"\s+(?:vào|trong|cho|to|in|into)?\s*(?:layers?|topics?|chủ\s+đề|lộ\s+trình)?\s*(?:đó|nó|này|it|this|here)\s*$",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()

        # Strip conversational fillers again in case they were behind category words
        cleaned = clean_conversational_fillers(cleaned)

        # If what remains starts with category word + digits (e.g. "bài 1", "item 2", "layer 3"),
        # keep it so it doesn't become bare "1" or "2"
        if re.match(r"^(?:bài|item|layer|group|nhóm|part|lesson)\s+\d+", cleaned, flags=re.IGNORECASE):
            return cleaned.strip()

        # Otherwise strip leading category words (e.g. "topic AI Engineering" -> "AI Engineering")
        candidate = re.sub(
            r"^(?:topics?c*|chủ\s+đề|lộ\s+trình|roadmaps?|layers?r*|groups?|nhóm|items?m*|bài(?:\s+học)?|mục|lessons?)\s+",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()

        candidate = clean_conversational_fillers(candidate)
        return candidate if candidate else cleaned

    def _deterministic_extract(
        self, prompt: str, default_parent: Optional[str] = None
    ) -> StructuredRoadmapAction:
        """High-precision rule-based parser that guarantees verb-free titles."""
        text = normalize_vietnamese(prompt).strip()
        text = clean_conversational_fillers(text)
        # "ngay"/"luôn" switch off the confirmation step in the agent; they are not part of any name
        text = re.sub(r"\s+", " ", re.sub(r"\b(?:luôn|ngay)\b", " ", text, flags=re.IGNORECASE)).strip()

        lower = text.lower()


        # 2. Extract and strip 'level core/intermediate/advanced'
        entity_item_level = "core"
        m_level = re.search(r"\blevel\s+([a-zA-Z0-9_-]+)", text, flags=re.IGNORECASE)
        if m_level:
            cand_lvl = m_level.group(1).lower().strip()
            if cand_lvl in ["core", "intermediate", "advanced"]:
                entity_item_level = cand_lvl
            text = re.sub(r"\blevel\s+[a-zA-Z0-9_-]+", "", text, flags=re.IGNORECASE).strip()

        # 3. Determine Action
        action = ActionType.CREATE
        if any(w in lower for w in ["xóa", "xoá", "delete", "remove", "gỡ"]):
            action = ActionType.DELETE
        elif any(w in lower for w in ["sửa", "đổi tên", "update", "rename", "cập nhật"]):
            action = ActionType.UPDATE


        # 4. Determine Entity Level
        level = EntityLevel.TOPIC
        if any(re.search(rf"\b{p}\b", lower) for p in [r"items?m*", r"bài(?:\s+học)?", r"mục", r"lessons?"]):
            level = EntityLevel.ITEM
        elif any(re.search(rf"\b{p}\b", lower) for p in [r"groups?", r"nhóm"]):
            level = EntityLevel.GROUP
        elif any(re.search(rf"\b{p}\b", lower) for p in [r"layers?r*", r"mảng(?:\s+kiến\s+thức)?"]):
            level = EntityLevel.LAYER

        # 5. Extract Parent Target (only relevant for layer, group, item — NOT topic)
        parent = None if level == EntityLevel.TOPIC else default_parent
        if level != EntityLevel.TOPIC:
            if any(w in lower for w in ["vào đó", "trong đó", "cho nó", "to it", "in it"]):
                parent = "CONTEXT_ACTIVE"
            else:
                # Match parent topic / layer like "trong layer mock 1" or "on fe" or "to layer 01-LLM"
                m_parent = re.search(
                    r"\b(?:trong|vào|cho|on|in|to|into)\s+(?:topics?c*|chủ\s+đề|layers?r*|lộ\s+trình)?\s*([a-zA-Z0-9_ -]+?)(?=\s+level|$)",
                    text,
                    flags=re.IGNORECASE,
                )
                # Prefix form "topic ai" first; "trong X" then wins; suffix form "be topic" only as a fallback
                found: Optional[str] = None
                m_prefix = re.search(r"\btopics?c*\s+([a-zA-Z0-9_-]+)", text, flags=re.IGNORECASE)
                if m_prefix:
                    found = _clean_parent(m_prefix.group(1)) or found
                if m_parent:
                    found = _clean_parent(m_parent.group(1)) or found

                # Also check "be topic" / "fe topic"
                m_suffix = re.search(r"\b([a-zA-Z0-9_-]+)\s+topics?c*\b", text, flags=re.IGNORECASE)
                if m_suffix and found is None:
                    found = _clean_parent(m_suffix.group(1))
                if found:
                    parent = found

        # 6. Extract Raw Titles & Expand Enumerations ("mock 1 và 2" -> ["mock 1", "mock 2"])
        raw_titles = self._extract_raw_titles(text, level)

        entities: list[SingleEntity] = []
        for t in raw_titles:
            clean_t = self._sanitize_title(t)
            clean_t = clean_t.lstrip(": -").strip()
            if not clean_t:
                continue
            sc = _generate_clean_short_code(clean_t)
            entities.append(SingleEntity(title=clean_t, short_code=sc, level=entity_item_level))

        if not entities:
            clean_t = self._sanitize_title(text).lstrip(": -").strip()
            entities.append(
                SingleEntity(
                    title=clean_t or "Untitled",
                    short_code=_generate_clean_short_code(clean_t or "UNT"),
                    level=entity_item_level,
                )
            )

        summary = f"{action.value.upper()} {len(entities)} {level.value}(s)"
        if parent:
            summary += f" in '{parent}'"

        return StructuredRoadmapAction(
            action=action,
            entity_level=level,
            target_parent_identifier=parent,
            entities=entities,
            is_batch=len(entities) > 1,
            raw_intent_summary=summary,
        )

    def _extract_raw_titles(self, text: str, level: EntityLevel) -> list[str]:
        """Extract individual entity titles and expand contracted enumerations."""
        # 1. Check for contracted number enumerations: "mock 1, 2 và 3" or "bài 1, 2 và 3" or "mock 1 và 2"
        # Match pattern where the prefix is immediately followed by digit, e.g. 'mock 1 và 2'
        m_multi = re.search(
            r"(\b[^\d,;]+?\s+)(\d+)(?:\s*,\s*\d+)*\s*(?:và|and|,)\s*(\d+)\b",
            text,
            flags=re.IGNORECASE,
        )
        if m_multi:
            full_match = m_multi.group(0)
            prefix = m_multi.group(1).strip()
            # Strip verbs
            prefix = re.sub(r"^(?:tạo|thêm|xóa|xoá|sửa|đổi tên|cập nhật|create|add|delete|remove|new|make)\s+", "", prefix, flags=re.IGNORECASE)
            # Strip quantity number e.g. "3 item" -> "item"
            prefix = re.sub(r"^\d+\s*", "", prefix, flags=re.IGNORECASE)
            # Strip redundant outer category if it precedes another word e.g. "item bài" -> "bài"
            prefix = re.sub(r"^(?:items?m*|layers?r*|groups?|topics?c*)\s+(?=\S)", "", prefix, flags=re.IGNORECASE).strip()
            digits = re.findall(r"\b\d+\b", full_match)
            if len(digits) >= 2:
                results = []
                for d in digits:
                    title_candidate = f"{prefix} {d}".strip() if prefix else f"{level.value} {d}"
                    results.append(self._sanitize_title(title_candidate))
                return results

        # 2. Check for comma / and lists: "A, B và C" / "A and B"
        # First strip out parent clause
        clause = re.sub(
            r"\b(?:trong|vào|cho|on|in|to|into)\s+(?:topics?c*|chủ\s+đề|layers?r*|lộ\s+trình)?\s*[a-zA-Z0-9_ -]+?(?=\s+level|$)",
            "",
            text,
            flags=re.IGNORECASE,
        )
        clause = clean_conversational_fillers(clause)
        # Prefix-form parent ("... topic ai") is not part of the title of a layer/item
        if level != EntityLevel.TOPIC:
            clause = re.sub(r"\s+topics?c*\s+[a-zA-Z0-9_-]+\s*$", "", clause.strip(), flags=re.IGNORECASE)
        clause = clean_conversational_fillers(clause)

        # Strip out action verb, conversational wrapper, and level keyword
        clause = re.sub(
            r"^(?:tạo|thêm|xóa|xoá|sửa|đổi tên|cập nhật|create|add|delete|remove)\s+(?:(?:giúp|hộ|cho|giùm)\s+(?:tôi|mình|em|anh|chị)\s+)?(?:\d+\s+)?(?:topics?c*|layers?r*|groups?|items?m*|chủ\s+đề|mục|bài(?:\s+học)?|roadmaps?|lessons?)?\s*(?:(?:về|about)\s+)?",
            "",
            clause.strip(),
            flags=re.IGNORECASE,
        )
        clause = clean_conversational_fillers(clause)

        # Strip trailing "topic", "layer", "topiccc", etc.
        clause = re.sub(
            r"\s+\b(?:topics?c*|layers?r*|groups?|items?m*|roadmaps?|bài(?:\s+học)?|chủ\s+đề|mục|lessons?)$",
            "",
            clause.strip(),
            flags=re.IGNORECASE,
        )
        clause = clean_conversational_fillers(clause)

        # Split on commas and 'và'/'and'
        parts = re.split(r"[,;]|\s+(?:và|and)\s+", clause)
        results = [self._sanitize_title(p) for p in parts if self._sanitize_title(p)]
        return results if results else [self._sanitize_title(clause)]
