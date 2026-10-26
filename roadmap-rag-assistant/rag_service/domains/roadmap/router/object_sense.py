"""P3, target: does a roadmap noun ("topic", "layer", "bài", "nhóm", "mục", "item") name this roadmap's object?

The same nouns name things in other systems: "layer mask trong Figma", "nhóm chat trên Messenger", "item khỏi
giỏ hàng", `DELETE FROM topics`. Listing those systems never ends, so the sense is read from the sentence:

1. A noun inside an identifier or code is not an object: `…` spans, and tokens joined by - _ . / ( such as
   "topic-controller", "create_topic.py", "list.remove(item)".
2. A place phrase says where the object lives: a place preposition (trong, trên, ở, vào, sang, khỏi, in, on,
   into) and what follows it, in a clause with a roadmap noun. When some place phrase after the noun
   names somewhere that is not the roadmap (no roadmap or roadmap-part noun, not a pronoun, a position or a
   time) and none names the roadmap, the noun belongs to that other place: "tạo layer mới trong Docker image"
   is not a roadmap change, "thêm bài X vào layer 2" is. "cho" (for), "tại" (tại sao, hiện tại) and English
   "to" (rename X to Y, to become) and "from" (from scratch) are not place words. A new name ("… thành X in JS", "called …") is not
   read for places.

A layer or topic named without its noun ("layer trong fe", "chuyển bài X sang Machine Learning") is told
from another system by the roadmap's data: `known_place` asks the catalog. Without a catalog it reads as
another place, and the message goes to the LLM router and System 2 instead of the keyword route.
"""

from __future__ import annotations

import re
from typing import Callable, Optional

from rag_service.domains.roadmap.retrieval.relevance import fold

CODE_SPAN = re.compile(r"`[^`]*`")
# A token holding - _ . / between letters or digits, or a call "(": not a word followed by punctuation ("Xóa.")
IDENTIFIER = re.compile(r"\S*\w(?:[-_./]\w|\()\S*")

PREPOSITIONS = {"trong", "trên", "ở", "vào", "sang", "khỏi", "in", "on", "into"}
# Typed without diacritics; "sang" (sáng) and "o" (ô, ơ) only count on unaccented text
PREPOSITIONS_FOLDED = {"trong", "tren", "o", "vao", "sang", "khoi"}
# What may follow a preposition without naming another place
PRONOUNS = {
    "minh", "toi", "em", "e", "anh", "a", "ban", "tui", "to", "chi", "day", "do", "no", "me", "us", "you", "it",
    "my", "your", "our", "his", "her", "their", "this", "that",
}
POSITION_OR_TIME = {
    "dau", "cuoi", "giua", "sau", "truoc", "tren", "duoi", "ngay", "tuan", "thang", "nam", "hom", "luc", "sang",
    "chieu", "toi", "dem", "the", "top", "bottom", "end", "start",
}
# The roadmap's objects, and the words people use for its parts ("phần frontend", "phase 3", "chương 2")
OBJECT_NOUN = re.compile(
    r"\b(?:topics?|chu\s+de|lo\s+trinh|roadmaps?|layers?|mang(?:\s+kien\s+thuc)?|groups?|nhom|items?|bai(?:\s+hoc)?"
    r"|muc|lessons?)\b"
)
PART_NOUN = re.compile(r"\b(?:phan|phases?|chuong|chapters?|modules?|sections?|tang|giai\s+doan)\b")
CLAUSE_END = re.compile(r"[,.;!?:]|\b(?:thi|nhung)\b")
# What follows is a name, not a place: "đổi tên bài X thành Async in JS", "a topic called …"
NAME_START = re.compile(r"\b(?:thanh|la|called|named|as)\b")


def strip_code(text: str) -> str:
    """The text without code spans and identifiers, whose nouns name no roadmap object."""
    return IDENTIFIER.sub(" ", CODE_SPAN.sub(" ", text))


def _places(lower: str) -> list[tuple[str, bool]]:
    """(folded complement, after the roadmap noun) for place phrases in clauses with a roadmap noun."""
    places = []
    accented = re.findall(r"\S+", strip_code(lower))
    clause: list[str] = []
    for word in accented + [","]:
        if CLAUSE_END.search(fold(word)) and not word.isalnum() or fold(word) in ("thi", "nhung"):
            places += _clause_places(clause)
            clause = []
        else:
            clause.append(word)
    return places


def _clause_places(words: list[str]) -> list[tuple[str, bool]]:
    folded = [fold(w) for w in words]
    nouns = [i for i in range(len(words)) if OBJECT_NOUN.match(" ".join(folded[i:i + 2]))]
    if not nouns:
        return []
    named = next((i for i, w in enumerate(folded) if NAME_START.fullmatch(w)), len(words))
    places = []
    for i in range(named):
        word = words[i]
        if word in PREPOSITIONS or (word == folded[i] and word in PREPOSITIONS_FOLDED):
            rest = folded[i + 1:min(i + 4, named)]
            if rest:
                places.append((" ".join(rest), i > nouns[0]))
    return places


def names_another_place(lower: str, known_place: Optional[Callable[[str], bool]] = None) -> bool:
    """A place phrase names somewhere other than the roadmap, and none names the roadmap."""
    roadmap = elsewhere = False
    for place, after_noun in _places(lower):
        words = place.split()
        first = words[0]
        named = known_place is not None and any(known_place(" ".join(words[:n])) for n in range(1, len(words) + 1))
        if OBJECT_NOUN.search(place) or PART_NOUN.search(place) or named:
            roadmap = True
        elif after_noun and first not in PRONOUNS and first not in POSITION_OR_TIME and not first.isdigit():
            elsewhere = True
    return elsewhere and not roadmap
