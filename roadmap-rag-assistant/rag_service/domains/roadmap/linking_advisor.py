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


def _collect_concept_matches(
    raw_matches: Sequence[tuple[Any, float]],
    *,
    title: str,
    signal_text: str,
    preferred_topic_slug: str | None,
    capped_limit: int,
) -> dict[str, Any]:
    suggested_topic_slug: str | None = preferred_topic_slug.strip() if preferred_topic_slug else None
    suggested_topic_title: str | None = None
    suggested_section: str | None = None
    matches: list[dict[str, Any]] = []

    for doc, score in raw_matches:
        doc_type = getattr(doc, "doc_type", "")
        topic_slug = getattr(doc, "topic_slug", None)
        topic_title = getattr(doc, "topic_title", None) or getattr(doc, "title", None)
        if doc_type == "topic":
            if topic_slug and (suggested_topic_slug is None or (topic_slug == suggested_topic_slug and not suggested_topic_title)):
                suggested_topic_slug = topic_slug
                suggested_topic_title = getattr(doc, "title", topic_slug)
            continue
        if doc_type != "item":
            continue

        section = getattr(doc, "section", None)
        if topic_slug and (suggested_topic_slug is None or (topic_slug == suggested_topic_slug and not suggested_topic_title)):
            suggested_topic_slug = topic_slug
            suggested_topic_title = topic_title
            if suggested_section is None:
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
                "version_update_hint": _has_version_update_signal(signal_text, lesson_title),
            }
        )

    return {
        "suggested_topic_slug": suggested_topic_slug,
        "suggested_topic_title": suggested_topic_title or suggested_topic_slug,
        "suggested_section": suggested_section,
        "matches": matches,
    }


async def match_concept_to_lessons(
    *,
    title: str,
    summary: str = "",
    keywords: Sequence[str] = (),
    preferred_topic_slug: str | None = None,
    limit: int = 5,
    engine: Any = None,
) -> dict[str, Any]:
    """Match a standalone concept or news payload against live roadmap topics and lessons."""
    active_engine = engine if engine is not None else rag_engine
    clean_keywords = [str(k).strip() for k in keywords if str(k).strip()][:10]
    parts = [title.strip(), summary.strip(), *clean_keywords]
    query = " ".join(p for p in parts if p).strip()[:1000]
    if not query:
        return {
            "suggested_topic_slug": preferred_topic_slug or None,
            "suggested_topic_title": None,
            "suggested_section": None,
            "matches": [],
        }

    capped_limit = max(1, min(int(limit), 10))
    raw_matches = await active_engine.search_live_knowledge(query, limit=max(capped_limit * 2, 8))
    return _collect_concept_matches(
        raw_matches,
        title=title,
        signal_text=f"{title} {summary}",
        preferred_topic_slug=preferred_topic_slug,
        capped_limit=capped_limit,
    )


async def match_news_to_lessons(
    *,
    title: str,
    tldr: str = "",
    takeaways: Sequence[str] = (),
    tags: Sequence[str] = (),
    limit: int = 5,
    engine: Any = None,
) -> dict[str, Any]:
    """Match a news item against live lessons; delegates to match_concept_to_lessons."""
    return await match_concept_to_lessons(
        title=title,
        summary=tldr,
        keywords=(*takeaways[:5], *tags[:5]),
        limit=limit,
        engine=engine,
    )


async def advise_concept_promotion(
    *,
    title: str,
    summary: str = "",
    keywords: Sequence[str] = (),
    preferred_topic_slug: str | None = None,
    duplicate_threshold: float = 0.85,
    limit: int = 5,
    engine: Any = None,
) -> dict[str, Any]:
    """Decide whether a concept should append to an existing lesson or create a target lesson + relations."""
    matched = await match_concept_to_lessons(
        title=title,
        summary=summary,
        keywords=keywords,
        preferred_topic_slug=preferred_topic_slug,
        limit=limit,
        engine=engine,
    )
    matches: list[dict[str, Any]] = matched["matches"]
    duplicate_match = next(
        (m for m in matches if m.get("duplicate_warning") or float(m.get("score", 0.0)) >= duplicate_threshold),
        None,
    )
    if duplicate_match is not None:
        related = [m for m in matches if m["lesson_id"] != duplicate_match["lesson_id"]][:3]
        return {
            "mode": "append",
            "target_lesson": duplicate_match,
            "target_topic_slug": duplicate_match["topic_slug"] or matched["suggested_topic_slug"],
            "target_topic_title": duplicate_match["topic_title"] or matched["suggested_topic_title"],
            "target_section": duplicate_match["section"] or matched["suggested_section"],
            "related_lessons": related,
            "matches": matches,
        }

    target_topic_slug = preferred_topic_slug or matched["suggested_topic_slug"]
    target_topic_title = (
        matched["suggested_topic_title"]
        if (not preferred_topic_slug or preferred_topic_slug == matched["suggested_topic_slug"])
        else preferred_topic_slug
    )
    return {
        "mode": "create",
        "target_lesson": None,
        "target_topic_slug": target_topic_slug,
        "target_topic_title": target_topic_title,
        "target_section": matched["suggested_section"],
        "related_lessons": matches[:3],
        "matches": matches,
    }
