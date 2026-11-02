"""Topic and lesson resolver — maps what the user wrote to a real topic or lesson (ADR-0009).

A topic is named by slug, title or a word of its title; a lesson by id or title, narrowed to the topic when
the message names one. Several matches are never guessed: the caller asks the user.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

ResolutionStatus = Literal["found", "ambiguous", "not_found", "unavailable"]

# Words the extractor often leaves around a name, e.g. "ai topic" or "bài học Docker"
_TOPIC_HINT = re.compile(r"^(?:topic|lộ trình|roadmap|chủ đề)\s+|\s+(?:topic|lộ trình|roadmap|chủ đề)$", re.IGNORECASE)
_LESSON_HINT = re.compile(r"^(?:bài học|bài|lesson|item)\s+", re.IGNORECASE)

# "… của topic Machine Learning", "in roadmap fe": the phrase after it names a topic
_TOPIC_MENTION = re.compile(
    r"(?:của|trong|thuộc|ở|on|in|of)\s+(?:topic|lộ\s+trình|chủ\s+đề|roadmap)\s+([^.,;:\n]+)", re.IGNORECASE
)


def _contains_word(haystack: str, needle: str) -> bool:
    return bool(needle) and re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", haystack) is not None


@dataclass
class TopicResolution:
    status: ResolutionStatus
    slug: str | None = None
    title: str | None = None
    candidates: list[dict] = field(default_factory=list)


@dataclass
class LessonResolution:
    status: ResolutionStatus
    lesson_id: str | None = None
    title: str | None = None
    candidates: list[dict] = field(default_factory=list)


def topic_named_in(text: str, topics: list[dict]) -> str | None:
    """Slug of the topic the message names explicitly, matched on slug or title.

    The phrase may run on ("Machine Learning tiêu đề …"), so a name only has to start it; the longest name wins.
    """
    for m in _TOPIC_MENTION.finditer(text or ""):
        phrase = re.sub(r"\s+", " ", m.group(1)).strip().casefold()
        best: tuple[int, str] | None = None
        for topic in topics:
            for name in (topic.get("slug"), topic.get("title")):
                n = re.sub(r"\s+", " ", (name or "")).strip().casefold()
                if n and (phrase == n or phrase.startswith(n + " ")) and (best is None or len(n) > best[0]):
                    best = (len(n), topic["slug"])
        if best:
            return best[1]
    return None


async def topic_named_in_message(text: str) -> str | None:
    """topic_named_in against the live topics; None when they cannot be loaded."""
    from rag_service.tools import get_adapter

    try:
        return topic_named_in(text, await get_adapter().list_topics())
    except Exception as exc:
        print(f"[resolve_topic] Could not load topics: {exc}")
        return None


async def resolve_topic(identifier: str | None) -> TopicResolution:
    """The topic an identifier names: exact slug → exact title → whole-word title match."""
    from rag_service.tools import get_adapter

    raw = (identifier or "").strip()
    if not raw:
        return TopicResolution("not_found")
    try:
        topics = await get_adapter().list_topics()
    except Exception as exc:
        print(f"[resolve_topic] Could not load topics for '{raw}': {exc}")
        return TopicResolution("unavailable")

    for t in topics:
        if t.get("slug") == raw:
            return TopicResolution("found", slug=t["slug"], title=t.get("title"))

    wanted = _TOPIC_HINT.sub("", raw).strip().lower()
    rows = [{"slug": t["slug"], "title": (t.get("title") or "").strip()} for t in topics if t.get("slug")]
    for matches in (
        [t for t in rows if t["title"].lower() == wanted or t["slug"] == wanted],
        [t for t in rows if _contains_word(t["title"].lower(), wanted)],
    ):
        if len(matches) == 1:
            return TopicResolution("found", slug=matches[0]["slug"], title=matches[0]["title"])
        if len(matches) > 1:
            return TopicResolution("ambiguous", candidates=matches)
    return TopicResolution("not_found", candidates=rows)


async def resolve_lesson(name: str | None, topic_slug: str | None = None) -> LessonResolution:
    """The lesson a change names: exact id → exact title → whole-word title match.

    A tier with several matches is ambiguous (narrowed to `topic_slug` first), never a guess.
    """
    from rag_service.tools import get_adapter

    raw = (name or "").strip()
    if not raw:
        return LessonResolution("not_found")
    try:
        lessons: list[dict] = []
        for topic in await get_adapter().list_topics():
            slug = topic.get("slug")
            if not slug:
                continue
            detail = await get_adapter().get_topic(slug) or {}
            for item in detail.get("items") or []:
                lessons.append({
                    "id": item.get("id", ""),
                    "title": (item.get("title") or "").strip(),
                    "section": item.get("section"),
                    "topic_slug": slug,
                })
    except Exception as exc:
        print(f"[resolve_lesson] Could not load lessons for '{raw}': {exc}")
        return LessonResolution("unavailable")

    for lesson in lessons:
        if lesson["id"] == raw:
            return LessonResolution("found", lesson_id=lesson["id"], title=lesson["title"])

    wanted = _LESSON_HINT.sub("", raw).strip().lower()
    for matches in (
        [e for e in lessons if e["title"].lower() == wanted],
        [e for e in lessons if _contains_word(e["title"].lower(), wanted)],
    ):
        in_topic = [m for m in matches if topic_slug and m["topic_slug"] == topic_slug]
        matches = in_topic if len(matches) > 1 and in_topic else matches
        if len(matches) == 1:
            return LessonResolution("found", lesson_id=matches[0]["id"], title=matches[0]["title"])
        if len(matches) > 1:
            return LessonResolution("ambiguous", candidates=matches)
    return LessonResolution("not_found")


def describe_unresolved_topic(identifier: str, res: TopicResolution) -> str:
    """Message for tools that cannot ask back: why the topic was not used."""
    if res.status == "ambiguous":
        names = ", ".join(f"'{c['title']}' ({c['slug']})" for c in res.candidates[:5])
        return f"⚠️ '{identifier}' khớp nhiều topic: {names}. Hãy chỉ rõ topic."
    return f"⚠️ Không tìm thấy topic '{identifier}'. Hãy kiểm tra lại tên topic."
