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
      - ["level 1", "2"] -> ["level 1", "level 2"]
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


def generate_short_code(title: str) -> str:
    """Generate a 2-4 uppercase letter shortCode from a title.

    Examples:
      - 'ABC' -> 'ABC'
      - 'AI' -> 'AI'
      - 'AI Engineering' -> 'AI'
      - 'Cloud DevOps' -> 'CD'
      - 'Backend' -> 'BAC'
      - 'Frontend' -> 'FRO'
    """
    cleaned_title = clean_single_entity_name(title)
    if not cleaned_title:
        cleaned_title = title.strip()

    # If title is already an uppercase acronym (e.g. 'ABC', 'AI', 'AWS')
    if re.match(r"^[A-Z0-9]{2,5}$", cleaned_title):
        return cleaned_title

    words = cleaned_title.split()
    # If first word is an uppercase acronym (e.g. 'AI Engineering' -> 'AI')
    if len(words) >= 2 and re.match(r"^[A-Z0-9]{2,4}$", words[0]):
        return words[0]

    if len(words) >= 2:
        return "".join(w[0].upper() for w in words[:3] if w)

    cleaned = re.sub(r"[^A-Za-z0-9]", "", cleaned_title)
    return cleaned[:3].upper() if cleaned else "TP"


def normalize_level(level: str) -> str:
    """Normalize level keywords across English and Vietnamese to standard level codes."""
    lvl = level.strip().lower()
    mapping = {
        "core": "core",
        "cơ bản": "core",
        "co ban": "core",
        "basic": "core",
        "fundamentals": "core",
        "intermediate": "intermediate",
        "trung cấp": "intermediate",
        "trung cap": "intermediate",
        "medium": "intermediate",
        "mid": "intermediate",
        "advanced": "advanced",
        "nâng cao": "advanced",
        "nang cao": "advanced",
        "pro": "advanced",
        "expert": "advanced",
    }
    return mapping.get(lvl, lvl)


# ── TOPIC EXTRACTOR ──────────────────────────────────────────────────────
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
def extract_layer_creation_params(content: str) -> tuple[list[str], str] | None:
    """Extract list of layer titles and target topic slug from natural language prompts (VN + EN).

    Handles single and batch creations:
      - 'create aaa layer on fe' -> (['aaa'], 'fe')
      - 'create aaa layer on fe?' -> (['aaa'], 'fe')
      - 'create layer aaa on topic fe' -> (['aaa'], 'fe')
      - 'tạo layer aaa trong topic fe' -> (['aaa'], 'fe')
      - 'tạo 2 layer mock 1 và 2 trong be topic' -> (['mock 1', 'mock 2'], 'be')
      - 'create 2 layers mock 1 and 2 on be topic' -> (['mock 1', 'mock 2'], 'be')
      - 'thêm 3 layer A, B và C vào topic be' -> (['A', 'B', 'C'], 'be')
      - 'create mock 1 and 2 layers on be' -> (['mock 1', 'mock 2'], 'be')
    """
    text = clean_conversational_text(content.strip().rstrip(" \t\n\r.?!"))

    # Step 1: Extract target topic
    topic_slug = ""
    remaining = text

    # Suffix topic container: e.g. "in be topic", "on be topic", "trong be topic"
    m1 = re.search(
        r"(?:on|in|trong|vào|cho|trên|thuộc|của|ở|to|inside|at)\s+([a-zA-Z0-9_-]+)\s+(?:topic|roadmap|chủ đề)s?$",
        text,
        re.IGNORECASE,
    )
    if m1:
        topic_slug = m1.group(1).lower()
        remaining = text[:m1.start()].strip()
    else:
        # Prefix topic container: e.g. "in topic be", "trong topic be", "to topic be"
        m2 = re.search(
            r"(?:on|in|trong|vào|cho|trên|thuộc|của|ở|to|inside|at)\s+(?:topic|roadmap|chủ đề)\s+([a-zA-Z0-9_-]+)$",
            text,
            re.IGNORECASE,
        )
        if m2:
            topic_slug = m2.group(1).lower()
            remaining = text[:m2.start()].strip()
        else:
            # Short preposition: e.g. "on be", "in be", "trong be", "to be"
            m3 = re.search(
                r"(?:on|in|trong|vào|cho|trên|thuộc|của|ở|to|inside|at)\s+([a-zA-Z0-9_-]+)$",
                text,
                re.IGNORECASE,
            )
            if m3:
                topic_slug = m3.group(1).lower()
                remaining = text[:m3.start()].strip()

    if not topic_slug:
        return None

    # Step 2: Strip command verbs, quantities and entity keywords from remaining
    body = remaining.strip()
    body = re.sub(
        r"^(?:hãy\s+|vui lòng\s+|please\s+)?(?:tạo|thêm|create|add|new|make|lập|dựng)\s+"
        r"(?:cho\s+(?:tôi|mình)\s+|for\s+me\s+)?"
        r"(?:giúp\s+(?:tôi|mình)\s+)?"
        r"(?:(?:các\s+|những\s+)?(?:\d+\s+)?(?:layer|layers|mảng kiến thức)s?[:\s]*)?",
        "",
        body,
        flags=re.IGNORECASE,
    )
    body = re.sub(r"[:\s]*(?:layers?|mảng kiến thức)s?$", "", body, flags=re.IGNORECASE).strip()

    if not body:
        return None

    # Step 3: Normalize separators and split
    body = re.sub(r"\s+(?:và|and|&)\s+", ", ", body, flags=re.IGNORECASE)
    parts = [clean_single_entity_name(p) for p in body.split(",") if clean_single_entity_name(p)]

    if not parts:
        return None

    # Step 4: Expand contracted titles like ["mock 1", "2"] -> ["mock 1", "mock 2"]
    return expand_contracted_titles(parts), topic_slug


# ── GROUP EXTRACTOR ──────────────────────────────────────────────────────
def extract_group_creation_params(content: str) -> tuple[list[str], str, str] | None:
    """Extract list of group titles, target layer identifier, and optional level (VN + EN).

    Handles prompts like:
      - 'tạo group Core trong layer aaa' -> (['Core'], 'aaa', '')
      - 'create group Core in layer aaa' -> (['Core'], 'aaa', '')
      - 'thêm nhóm Advanced vào layer 02-AAA' -> (['Advanced'], '02-AAA', '')
      - 'add group Advanced to layer 02-AAA' -> (['Advanced'], '02-AAA', '')
      - 'tạo 2 group Core và Advanced trong layer mock 1' -> (['Core', 'Advanced'], 'mock 1', '')
      - 'create 2 groups Core and Advanced in layer mock 1' -> (['Core', 'Advanced'], 'mock 1', '')
    """
    text = clean_conversational_text(content.strip().rstrip(" \t\n\r.?!"))

    # Extract target layer: e.g. "in layer 02-AAA", "trong layer aaa", "to layer mock 1"
    level = ""
    remaining = text

    # Extract level if present (e.g. "level core", "level advanced", "mức cơ bản")
    level_m = re.search(r"(?:level|mức|cấp độ)\s+([a-zA-Z0-9_-]+)", text, re.IGNORECASE)
    if level_m:
        level = normalize_level(level_m.group(1))
        remaining = re.sub(r"(?:level|mức|cấp độ)\s+[a-zA-Z0-9_-]+", "", remaining, flags=re.IGNORECASE).strip()

    layer_identifier = ""
    m = re.search(
        r"(?:on|in|trong|vào|cho|trên|thuộc|của|ở|to|inside|at)\s+(?:layer|mảng kiến thức)\s+(.+?)$",
        remaining,
        re.IGNORECASE,
    )
    if m:
        layer_identifier = clean_single_entity_name(m.group(1))
        remaining = remaining[:m.start()].strip()

    if not layer_identifier:
        return None

    # Strip command verbs, quantities and entity keywords from remaining
    body = remaining.strip()
    body = re.sub(
        r"^(?:hãy\s+|vui lòng\s+|please\s+)?(?:tạo|thêm|create|add|new|make)\s+"
        r"(?:cho\s+(?:tôi|mình)\s+|for\s+me\s+)?"
        r"(?:giúp\s+(?:tôi|mình)\s+)?"
        r"(?:(?:các\s+|những\s+)?(?:\d+\s+)?(?:group|groups|nhóm)s?[:\s]*)?",
        "",
        body,
        flags=re.IGNORECASE,
    )
    body = re.sub(r"[:\s]*(?:groups?|nhóm)s?$", "", body, flags=re.IGNORECASE).strip()

    if not body:
        return None

    body = re.sub(r"\s+(?:và|and|&)\s+", ", ", body, flags=re.IGNORECASE)
    parts = [clean_single_entity_name(p) for p in body.split(",") if clean_single_entity_name(p)]

    if not parts:
        return None

    return expand_contracted_titles(parts), layer_identifier, level


# ── ITEM EXTRACTOR ───────────────────────────────────────────────────────
def extract_item_creation_params(content: str) -> tuple[list[str], str, str] | None:
    """Extract list of item titles, target layer identifier, and level (VN + EN).

    Handles prompts like:
      - 'tạo item Prompt Engineering trong layer 01-LLM level core'
      - 'create item Prompt Engineering in layer 01-LLM level core'
      - 'thêm 3 item: Vector DB, Embeddings, RAG Pipeline vào layer 01-LLM level core'
      - 'add 3 items: Vector DB, Embeddings, RAG Pipeline to layer 01-LLM level core'
      - 'tạo 2 item mock 1 và 2 trong layer aaa level core'
      - 'create items A, B and C in layer aaa'
      - 'thêm bài học Docker Basics vào layer devops'
    """
    text = clean_conversational_text(content.strip().rstrip(" \t\n\r.?!"))

    # Extract level if present (e.g. "level core", "level advanced", "mức nâng cao"); none is never guessed
    level = ""
    level_m = re.search(r"(?:level|mức|cấp độ)\s+([\w\-]+)", text, re.IGNORECASE)
    remaining = text
    if level_m:
        level = normalize_level(level_m.group(1))
        remaining = re.sub(r"(?:level|mức|cấp độ)\s+[^\s]+", "", remaining, flags=re.IGNORECASE).strip()

    layer_identifier = ""
    m = re.search(
        r"(?:on|in|trong|vào|cho|trên|thuộc|của|ở|to|inside|at)\s+(?:layer|mảng kiến thức)\s+([a-zA-Z0-9_ -]+?)(?:\s+(?:level|mức)|$)",
        remaining,
        re.IGNORECASE,
    )
    if m:
        layer_identifier = clean_single_entity_name(m.group(1))
        remaining = remaining[:m.start()].strip()

    if not layer_identifier:
        return None

    # Strip command verbs, quantities and entity keywords from remaining
    body = remaining.strip()
    body = re.sub(
        r"^(?:hãy\s+|vui lòng\s+|please\s+)?(?:tạo|thêm|create|add|new|make)\s+"
        r"(?:cho\s+(?:tôi|mình)\s+|for\s+me\s+)?"
        r"(?:giúp\s+(?:tôi|mình)\s+)?"
        r"(?:(?:các\s+|những\s+)?(?:\d+\s+)?(?:item|items|bài học|chủ đề con|mục)s?[:\s]*)?",
        "",
        body,
        flags=re.IGNORECASE,
    )
    body = re.sub(r"[:\s]*(?:items?|bài học|chủ đề con|mục)s?$", "", body, flags=re.IGNORECASE).strip()

    if not body:
        return None

    body = re.sub(r"\s+(?:và|and|&)\s+", ", ", body, flags=re.IGNORECASE)
    parts = [clean_single_entity_name(p) for p in body.split(",") if clean_single_entity_name(p)]

    if not parts:
        return None

    return expand_contracted_titles(parts), layer_identifier, level
