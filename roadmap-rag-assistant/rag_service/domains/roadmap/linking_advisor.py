from __future__ import annotations

import re
from typing import Any, Sequence

from rag_service.domains.roadmap.retrieval.engine import rag_engine
from rag_service.domains.roadmap.retrieval.relevance import fold

_VERSION_RE = re.compile(r"\b(?:v?\d+\.\d+(?:\.\d+)?|release|changelog|breaking\s+change|deprecat\w*)\b", re.IGNORECASE)
_STOPWORDS = {
    "va",
    "cua",
    "trong",
    "cho",
    "voi",
    "the",
    "and",
    "for",
    "with",
    "from",
    "how",
    "what",
    "bai",
    "hoc",
    "huong",
    "dan",
    "tong",
    "quan",
}


def _tokens(text: str) -> set[str]:
    return {
        tok
        for tok in re.findall(r"[a-z0-9.+#-]{2,}", fold(text))
        if tok not in _STOPWORDS and not tok.isdigit()
    }


def _is_duplicate_candidate(news_title: str, lesson_title: str) -> bool:
    folded_news = fold(news_title).strip()
    folded_lesson = fold(lesson_title).strip()
    if not folded_news or not folded_lesson:
        return False
    if folded_news == folded_lesson or folded_lesson in folded_news or folded_news in folded_lesson:
        return True
    news_tokens = _tokens(news_title)
    lesson_tokens = _tokens(lesson_title)
    if not news_tokens or not lesson_tokens:
        return False
    overlap = len(news_tokens & lesson_tokens) / max(1, min(len(news_tokens), len(lesson_tokens)))
    return overlap >= 0.75


def _has_version_update_signal(news_text: str, lesson_title: str) -> bool:
    if not _VERSION_RE.search(news_text):
        return False
    lesson_tokens = _tokens(lesson_title)
    news_tokens = _tokens(news_text)
    return bool(lesson_tokens and (lesson_tokens & news_tokens))


async def match_news_to_lessons(
    *,
    title: str,
    tldr: str = "",
    takeaways: Sequence[str] = (),
    tags: Sequence[str] = (),
    limit: int = 5,
    engine: Any = None,
) -> dict[str, Any]:
    active_engine = engine if engine is not None else rag_engine
    parts = [title.strip(), tldr.strip(), *takeaways[:5], *tags[:5]]
    query = " ".join(p for p in parts if p).strip()[:1000]
    if not query:
        return {
            "suggested_topic_slug": None,
            "suggested_topic_title": None,
            "suggested_section": None,
            "matches": [],
        }

    capped_limit = max(1, min(int(limit), 10))
    raw_matches = await active_engine.search_live_knowledge(query, limit=max(capped_limit * 2, 8))

    suggested_topic_slug: str | None = None
    suggested_topic_title: str | None = None
    suggested_section: str | None = None
    matches: list[dict[str, Any]] = []
    news_signal_text = f"{title} {tldr}"

    for doc, score in raw_matches:
        doc_type = getattr(doc, "doc_type", "")
        topic_slug = getattr(doc, "topic_slug", None)
        topic_title = getattr(doc, "topic_title", None) or getattr(doc, "title", None)
        if doc_type == "topic":
            if suggested_topic_slug is None and topic_slug:
                suggested_topic_slug = topic_slug
                suggested_topic_title = getattr(doc, "title", topic_slug)
            continue
        if doc_type != "item":
            continue

        section = getattr(doc, "section", None)
        if suggested_topic_slug is None and topic_slug:
            suggested_topic_slug = topic_slug
            suggested_topic_title = topic_title
            suggested_section = section
        elif suggested_topic_slug == topic_slug and suggested_section is None and section:
            suggested_section = section

        if len(matches) >= capped_limit:
            continue

        lesson_title = str(getattr(doc, "title", ""))
        lesson_slug = str(getattr(doc, "item_slug", None) or getattr(doc, "id", ""))
        matches.append(
            {
                "lesson_id": str(getattr(doc, "id", "")),
                "lesson_slug": lesson_slug,
                "title": lesson_title,
                "topic_slug": str(topic_slug or ""),
                "topic_title": str(topic_title or topic_slug or ""),
                "section": section,
                "score": round(float(score), 4),
                "duplicate_warning": _is_duplicate_candidate(title, lesson_title),
                "version_update_hint": _has_version_update_signal(news_signal_text, lesson_title),
            }
        )

    return {
        "suggested_topic_slug": suggested_topic_slug,
        "suggested_topic_title": suggested_topic_title,
        "suggested_section": suggested_section,
        "matches": matches,
    }
