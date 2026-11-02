"""Natural Language text cleaners and entity extractors for Vietnamese & English roadmap prompts."""

from __future__ import annotations

import re

VIETNAMESE_FILLERS = [
    "cho tôi",
    "giúp tôi",
    "hộ tôi",
    "giúp mình",
    "hộ mình",
    "cho mình",
    "với nhé",
    "với nha",
    "với",
    "nhé",
    "nha",
    "ạ",
    "đi",
    "được không",
    "nhé bạn",
]

ENGLISH_FILLERS = [
    "please",
    "for me",
    "can you",
    "could you",
    "would you",
    "kindly",
    "help me",
]


def clean_conversational_text(text: str) -> str:
    """Strip conversational filler words and pleasantries in Vietnamese and English."""
    cleaned = text.strip()
    for filler in VIETNAMESE_FILLERS + ENGLISH_FILLERS:
        pattern = r"(?:\s+|^)" + re.escape(filler) + r"[\.\?!,]*$"
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
        pattern_start = r"^(?:" + re.escape(filler) + r")[\s,]+"
        cleaned = re.sub(pattern_start, "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def expand_contracted_titles(titles: list[str]) -> list[str]:
    """Expand contracted enumerations like ["mock 1", "2"] -> ["mock 1", "mock 2"].

    Handles:
      - ["mock 1", "2"] -> ["mock 1", "mock 2"]
      - ["mock 1", "2", "3"] -> ["mock 1", "mock 2", "mock 3"]
      - ["layer A", "B"] -> ["layer A", "layer B"]
      - ["part 1", "2"] -> ["part 1", "part 2"]
      - ["mock 1", "mock 2"] -> ["mock 1", "mock 2"]
      - ["Frontend", "Backend"] -> ["Frontend", "Backend"]
    """
    if len(titles) <= 1:
        return titles

    expanded = [titles[0]]
    for i in range(1, len(titles)):
        curr = titles[i].strip()
        prev = expanded[i - 1].strip()

        # Check if curr is just a number or single letter (e.g. "2", "3", "B", "C")
        if re.match(r"^(\d+|[a-zA-Z])$", curr):
            # Check if prev has a word prefix followed by a number/letter: e.g. "mock 1" or "layer A"
            m = re.match(r"^(.+?[\s_-]+)(\d+|[a-zA-Z])$", prev)
            if m:
                prefix = m.group(1)
                expanded.append(f"{prefix}{curr}")
                continue
        expanded.append(curr)

    return expanded


def clean_single_entity_name(name: str) -> str:
    """Clean entity name from leftover command words, quotes, fillers, and entity keywords."""
    n = name.strip(" \t\n\r.\"':;`“”‘’")
    n = clean_conversational_text(n)
    # Strip leading command words and entity keywords
    n = re.sub(
        r"^(?:(?:hãy\s+|vui lòng\s+|please\s+)?(?:tạo|thêm|create|add|new|make)\s+)?"
        r"(?:cho\s+(?:tôi|mình)\s+|for\s+me\s+)?"
        r"(?:giúp\s+(?:tôi|mình)\s+)?"
        r"(?:các\s+|những\s+)?(?:\d+\s+)?"
        r"(?:topic|chủ đề|roadmap|lộ trình|layer|mảng kiến thức|group|nhóm|item|bài học|mục)s?[:\s]*",
        "",
        n,
        flags=re.IGNORECASE,
    )
    # Strip trailing entity keywords
    n = re.sub(
        r"[:\s]*(?:topics?|chủ đề|roadmaps?|lộ trình|layers?|mảng kiến thức|groups?|nhóm|items?|bài học|mục)s?[\.\?!]*$",
        "",
        n,
        flags=re.IGNORECASE,
    )
    return n.strip(" \t\n\r.\"':;`“”‘’")


def extract_topic_names(content: str) -> list[str]:
    """Extract clean list of topic titles from user prompt (VN + EN).

    Handles prompts like:
      - 'tạo ABC topic' -> ['ABC']
      - 'create ABC topic' -> ['ABC']
      - 'tạo topic ABC' -> ['ABC']
      - 'create topic AI Engineering' -> ['AI Engineering']
      - 'tạo cho tôi 2 topic: A, B cho tôi' -> ['A', 'B']
      - 'create 2 topics Frontend and Backend' -> ['Frontend', 'Backend']
      - 'tạo 3 topic A, B và C' -> ['A', 'B', 'C']
      - 'tạo A và B topic' -> ['A', 'B']
      - 'create A and B topics' -> ['A', 'B']
    """
    text = clean_conversational_text(content.strip().rstrip(" \t\n\r.?!"))

    # 1. Prefix pattern: e.g. "create topic ABC", "tạo topic ABC", "create 2 topics A and B"
    prefix_pattern = (
        r"^(?:hãy\s+|vui lòng\s+|please\s+)?"
        r"(?:tạo|thêm|create|add|new|make|lập|dựng)\s+"
        r"(?:cho\s+(?:tôi|mình)\s+|for\s+me\s+)?"
        r"(?:giúp\s+(?:tôi|mình)\s+)?"
        r"(?:các\s+|những\s+)?"
        r"(?:\d+\s+)?"
        r"(?:topic|chủ đề|roadmap|lộ trình)s?[:\s]+"
    )
    m = re.search(prefix_pattern, text, re.IGNORECASE)
    if m:
        raw_body = text[m.end():]
    else:
        # 2. Suffix pattern: e.g. "tạo ABC topic", "create ABC topic", "create A and B topics"
        suffix_pattern = (
            r"^(?:hãy\s+|vui lòng\s+|please\s+)?"
            r"(?:tạo|thêm|create|add|new|make|lập|dựng)\s+"
            r"(?:cho\s+(?:tôi|mình)\s+|for\s+me\s+)?"
            r"(?:giúp\s+(?:tôi|mình)\s+)?"
            r"(?:các\s+|những\s+)?"
            r"(?:\d+\s+)?"
            r"(.+?)\s+"
            r"(?:topics?|chủ đề|roadmaps?|lộ trình)s?[\.\?!]*$"
        )
        s_m = re.match(suffix_pattern, text, re.IGNORECASE)
        if s_m:
            raw_body = s_m.group(1)
        else:
            # 3. Middle search with colon: e.g. "topic: ABC"
            mid_m = re.search(r"(?:topic|chủ đề|roadmap|lộ trình)[:\s]+(.+)", text, re.IGNORECASE)
            if mid_m:
                raw_body = mid_m.group(1)
            else:
                # 4. Fallback verb stripping: e.g. "tạo ABC"
                verb_m = re.match(
                    r"^(?:hãy\s+|vui lòng\s+|please\s+)?(?:tạo|thêm|create|add|new|make)\s+"
                    r"(?:cho\s+(?:tôi|mình)\s+|for\s+me\s+)?"
                    r"(?:giúp\s+(?:tôi|mình)\s+)?"
                    r"(?:\d+\s+)?(.+)",
                    text,
                    re.IGNORECASE,
                )
                raw_body = verb_m.group(1) if verb_m else text

    raw_body = clean_conversational_text(raw_body)
    raw_body = re.sub(r"\s+(?:topics?|chủ đề|roadmaps?|lộ trình)s?[\.\?!]*$", "", raw_body, flags=re.IGNORECASE)
    raw_body = re.sub(r"\s+(?:và|and|&)\s+", ", ", raw_body, flags=re.IGNORECASE)

    parts = [clean_single_entity_name(p) for p in raw_body.split(",") if clean_single_entity_name(p)]
    expanded = expand_contracted_titles(parts)
    return expanded or ["Chủ đề mới"]


# ── LAYER EXTRACTOR ──────────────────────────────────────────────────────
# ── ITEM EXTRACTOR ───────────────────────────────────────────────────────
def extract_item_creation_params(content: str) -> tuple[list[str], str] | None:
    """Extract list of lesson titles and the topic identifier they go to (VN + EN, ADR-0009).

    Handles prompts like:
      - 'tạo item Prompt Engineering trong layer 01-LLM'
      - 'create item Prompt Engineering in layer 01-LLM'
      - 'thêm 3 item: Vector DB, Embeddings, RAG Pipeline vào layer 01-LLM'
      - 'add 3 items: Vector DB, Embeddings, RAG Pipeline to layer 01-LLM'
      - 'tạo 2 item mock 1 và 2 trong layer aaa'
      - 'create items A, B and C in layer aaa'
      - 'thêm bài học Docker Basics vào layer devops'
    """
    text = clean_conversational_text(content.strip().rstrip(" \t\n\r.?!"))
    remaining = text

    topic_identifier = ""
    m = re.search(
        r"(?:on|in|trong|vào|cho|trên|thuộc|của|ở|to|inside|at)\s+(?:topic|chủ đề|lộ trình)\s+([a-zA-Z0-9_ -]+?)$",
        remaining,
        re.IGNORECASE,
    )
    if m:
        topic_identifier = clean_single_entity_name(m.group(1))
        remaining = remaining[:m.start()].strip()

    if not topic_identifier:
        return None

    # Strip command verbs, quantities and entity keywords from remaining
    body = remaining.strip()
    body = re.sub(
        r"^(?:hãy\s+|vui lòng\s+|please\s+)?(?:tạo|thêm|create|add|new|make)\s+"
        r"(?:cho\s+(?:tôi|mình)\s+|for\s+me\s+)?"
        r"(?:giúp\s+(?:tôi|mình)\s+)?"
        r"(?:(?:các\s+|những\s+)?(?:\d+\s+)?(?:item|items|bài học|bài)s?[:\s]*)?",
        "",
        body,
        flags=re.IGNORECASE,
    )
    body = re.sub(r"[:\s]*(?:items?|bài học|bài)s?$", "", body, flags=re.IGNORECASE).strip()

    if not body:
        return None

    body = re.sub(r"\s+(?:và|and|&)\s+", ", ", body, flags=re.IGNORECASE)
    parts = [clean_single_entity_name(p) for p in body.split(",") if clean_single_entity_name(p)]

    if not parts:
        return None

    return expand_contracted_titles(parts), topic_identifier
