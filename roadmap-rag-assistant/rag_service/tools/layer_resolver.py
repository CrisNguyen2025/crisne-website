"""Layer resolver — maps human-readable identifiers (id, shortTag, title, topic) to a real layer.

The result says whether the identifier matched one layer, several, a topic, or nothing, so callers
can ask the user instead of writing to a layer id that does not exist.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

ResolutionStatus = Literal["found", "topic", "ambiguous", "not_found", "unavailable"]

# Words the extractor often leaves around the name, e.g. "ai topic" or "layer mock 1".
_HINT_WORDS = re.compile(r"^(?:topic|layer|chủ đề|mảng)\s+|\s+(?:topic|layer|chủ đề|mảng)$", re.IGNORECASE)


@dataclass
class LayerResolution:
    status: ResolutionStatus
    layer_id: str | None = None
    layer_title: str | None = None
    topic_slug: str | None = None
    # Layers to offer the user: the matches when ambiguous, the topic's layers for "topic",
    # every known layer for "not_found". Each: {"id", "title", "shortTag", "topic_slug", "topic_title"}.
    candidates: list[dict] = field(default_factory=list)


def _contains_word(haystack: str, needle: str) -> bool:
    return bool(needle) and re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", haystack) is not None


def _pick(matches: list[dict]) -> LayerResolution | None:
    if len(matches) == 1:
        m = matches[0]
        return LayerResolution("found", layer_id=m["id"], layer_title=m["title"], topic_slug=m["topic_slug"])
    if len(matches) > 1:
        return LayerResolution("ambiguous", candidates=matches)
    return None


async def _load_layers() -> tuple[list[dict], list[dict]]:
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    topics = await adapter.list_topics()
    layers: list[dict] = []
    for topic in topics:
        slug = topic.get("slug")
        if not slug:
            continue
        detail = await adapter.get_topic(slug) or {}
        for layer in detail.get("layers") or []:
            layers.append({
                "id": layer.get("id", ""),
                "title": (layer.get("title") or "").strip(),
                "shortTag": (layer.get("shortTag") or "").strip(),
                "topic_slug": slug,
                "topic_title": topic.get("title") or slug,
            })
    return topics, layers


async def resolve_layer(identifier: str | None, topic_slug: str | None = None) -> LayerResolution:
    """Resolve a layer identifier, preferring layers of `topic_slug` (the page's topic) on ties.

    Matching order: exact id → exact shortTag/title → shortTag suffix ('aaa' → '02-AAA')
    → whole-word title match. A tier with several matches is ambiguous, never a guess.
    If no layer matches but a topic does, returns status "topic" with that topic's layers.
    """
    raw = (identifier or "").strip()
    if not raw:
        return LayerResolution("not_found")

    try:
        topics, layers = await _load_layers()
    except Exception as exc:
        print(f"[resolve_layer] Could not load layers for '{raw}': {exc}")
        return LayerResolution("unavailable")

    for layer in layers:
        if layer["id"] == raw:
            return LayerResolution("found", layer_id=layer["id"], layer_title=layer["title"], topic_slug=layer["topic_slug"])

    names = [raw.lower()]
    stripped = _HINT_WORDS.sub("", raw).strip().lower()
    if stripped and stripped != names[0]:
        names.append(stripped)

    def narrow(matches: list[dict]) -> list[dict]:
        in_topic = [m for m in matches if topic_slug and m["topic_slug"] == topic_slug]
        return in_topic if len(matches) > 1 and in_topic else matches

    for name in names:
        tiers = [
            [l for l in layers if l["shortTag"].lower() == name or l["title"].lower() == name],
            [l for l in layers if "-" in l["shortTag"] and l["shortTag"].split("-", 1)[1].lower() == name],
            [
                l for l in layers
                if _contains_word(l["title"].lower(), name)
                or (len(l["title"]) >= 3 and _contains_word(name, l["title"].lower()))
            ],
        ]
        for matches in tiers:
            if (res := _pick(narrow(matches))) is not None:
                return res

    for name in names:
        for topic in topics:
            slug = topic.get("slug") or ""
            if name in (slug.lower(), (topic.get("title") or "").strip().lower()):
                return LayerResolution(
                    "topic",
                    topic_slug=slug,
                    candidates=[l for l in layers if l["topic_slug"] == slug],
                )

    return LayerResolution("not_found", candidates=layers)


def describe_unresolved(identifier: str, res: LayerResolution) -> str:
    """Message for tools that cannot ask back: why the layer was not used."""
    if res.status == "ambiguous":
        names = ", ".join(f"'{c['title']}' ({c['topic_slug']})" for c in res.candidates[:5])
        return f"⚠️ '{identifier}' khớp nhiều layer: {names}. Hãy chỉ rõ layer."
    if res.status == "topic":
        return f"⚠️ '{identifier}' là một topic, không phải layer. Hãy chỉ rõ layer trong topic `{res.topic_slug}`."
    return f"⚠️ Không tìm thấy layer '{identifier}'. Hãy kiểm tra lại tên layer."


async def resolve_layer_id(layer_identifier: str) -> str:
    """Backward-compatible wrapper: the matched layer id, or the identifier unchanged."""
    res = await resolve_layer(layer_identifier)
    return res.layer_id if res.status == "found" and res.layer_id else (layer_identifier or "").strip()
