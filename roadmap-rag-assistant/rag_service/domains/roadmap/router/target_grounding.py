"""Grounding — does the change name something that exists in this roadmap?

Words cannot tell a roadmap layer from a Photoshop layer; the roadmap data can. A change is grounded when:
- update / delete: the entity it changes exists ("bài Semantic Caching", "layer 03-RAG", "layer 1")
- create: the layer or topic that will hold the new entity exists, or a layer is open on the page

A new topic has no container (topics are the top level), so it is "unverifiable": the write policy decides it
with the topic rule. Groups are not in the catalog, so a change to one is unverifiable too.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel

GROUNDED = "grounded"
UNGROUNDED = "ungrounded"
UNVERIFIABLE = "unverifiable"

# A name close to a title (typos, a missing word) still names it; below this it names something else
NAME_MATCH_CUTOFF = 0.85
LEADING_ENTITY_WORD = re.compile(r"^(?:topic|chu de|lo trinh|roadmap|layer|mang(?: kien thuc)?|group|nhom|item|bai(?: hoc)?|muc|lesson)\s+")
LAYER_NUMBER = re.compile(r"^(?:layer\s*|tang\s*)?(\d{1,2})$")


def _norm(name: str) -> str:
    text = fold(name or "").strip(" .,:;\"'“”‘’`")
    return re.sub(r"\s+", " ", LEADING_ENTITY_WORD.sub("", text)).strip()


@dataclass
class Catalog:
    """Names of the roadmap's topics, layers (title and tag) and lessons, folded for matching."""

    topics: set[str] = field(default_factory=set)
    layers: set[str] = field(default_factory=set)
    layer_tags: set[str] = field(default_factory=set)
    items: set[str] = field(default_factory=set)

    @classmethod
    def from_documents(cls, docs: Iterable[Any]) -> "Catalog":
        catalog = cls()
        for doc in docs:
            if doc.doc_type == "topic":
                catalog.topics |= {_norm(doc.title), _norm(getattr(doc, "topic_slug", "") or "").replace("-", " ")}
            elif doc.doc_type == "layer":
                catalog.layers.add(_norm(doc.title))
                if doc.layer_tag:
                    catalog.layer_tags.add(fold(doc.layer_tag))
            elif doc.doc_type == "item":
                catalog.items.add(_norm(doc.title))
        catalog.topics.discard("")
        return catalog

    def _match(self, name: str, names: set[str]) -> bool:
        n = _norm(name)
        if not n:
            return False
        if n in names:
            return True
        if len(n) >= 4 and any(n in t.split(" ") or (" " in n and n in t) for t in names):
            return True
        return bool(difflib.get_close_matches(n, list(names), n=1, cutoff=NAME_MATCH_CUTOFF))

    def has_layer(self, name: str) -> bool:
        n = _norm(name)
        number = LAYER_NUMBER.match(n)
        if number:
            return any(tag.startswith(f"{int(number.group(1)):02d}") for tag in self.layer_tags)
        if fold(name).strip() in self.layer_tags or n in self.layer_tags:
            return True
        return self._match(name, self.layers)

    def mentioned_in(self, text: str) -> bool:
        """The message contains the name of a lesson, layer or topic ("cái vector database ấy khác gì …").

        Whole phrases on the folded text. Only specific names count (two words or more, or six letters or
        more), and a parenthesised abbreviation ("(RAG)") is dropped: short names match everyday words.
        """
        flat = " " + re.sub(r"[^\w\s-]", " ", fold(text or "")) + " "
        flat = re.sub(r"\s+", " ", flat)
        for name in self.mention_names():
            if f" {name} " in flat:
                return True
        return False

    def mention_names(self) -> set[str]:
        cached = getattr(self, "_mention_names", None)
        if cached is None:
            cached = set()
            for raw in self.items | self.layers | self.topics:
                name = re.sub(r"\([^)]*\)", " ", raw)                 # "(rag)"
                name = re.sub(r"^\d+\.\s*", "", name)                  # "03. tang rag" -> "tang rag"
                full = re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", name)).strip()
                if len(full.split()) >= 2 or len(full) >= 6:
                    cached.add(full)
                # A title joining two ideas is mentioned by either ("data drift & hallucination rate"), but a part
                # must stay specific: two words or more, one of five letters or more. "danh gia" (đánh giá) or
                # "system" alone would match everyday messages.
                for part in re.split(r"\s*(?:&|/|\+|,|\bvs\b|\bva\b)\s*", name):
                    part = re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", part)).strip()
                    words = part.split()
                    if len(words) >= 2 and any(len(w) >= 5 for w in words):
                        cached.add(part)
            self._mention_names = cached
        return cached

    def has(self, level: Optional[EntityLevel], name: str) -> bool:
        if level == EntityLevel.TOPIC:
            return self._match(name, self.topics)
        if level == EntityLevel.LAYER:
            return self.has_layer(name)
        if level == EntityLevel.ITEM:
            return self._match(name, self.items)
        return False


@dataclass(frozen=True)
class Grounding:
    status: str          # grounded | ungrounded | unverifiable
    reason: str = ""

    @property
    def grounded(self) -> bool:
        return self.status == GROUNDED

    @property
    def ungrounded(self) -> bool:
        return self.status == UNGROUNDED


def ground_change(verdict: Any, catalog: Catalog, page_context: Optional[dict] = None) -> Grounding:
    """Check System 2's target / container against the roadmap catalog."""
    level, action = verdict.entity_level, verdict.action
    if level == EntityLevel.GROUP:
        return Grounding(UNVERIFIABLE, "groups are not in the catalog")
    if action in (ActionType.UPDATE, ActionType.DELETE):
        if not verdict.target_name:
            return Grounding(UNGROUNDED, "no target named")
        if catalog.has(level, verdict.target_name):
            return Grounding(GROUNDED, f"{level.value if level else '?'} '{verdict.target_name}' exists")
        return Grounding(UNGROUNDED, f"'{verdict.target_name}' is not in the roadmap")
    if action == ActionType.CREATE:
        if level == EntityLevel.TOPIC:
            return Grounding(UNVERIFIABLE, "a new topic has no container")
        if verdict.container_name:
            exists = catalog.has_layer(verdict.container_name) if level == EntityLevel.ITEM else catalog.has(
                EntityLevel.TOPIC, verdict.container_name
            )
            if exists:
                return Grounding(GROUNDED, f"container '{verdict.container_name}' exists")
            return Grounding(UNGROUNDED, f"container '{verdict.container_name}' is not in the roadmap")
        if (page_context or {}).get("layerId") and level == EntityLevel.ITEM:
            return Grounding(GROUNDED, "a layer is open on the page")
        return Grounding(UNVERIFIABLE, "no container named")
    return Grounding(UNGROUNDED, "no change action")
