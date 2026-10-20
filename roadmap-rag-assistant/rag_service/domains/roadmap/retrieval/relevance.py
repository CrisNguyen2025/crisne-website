"""Roadmap on-topic gate: a retrieved lesson must share a content word with the question.

The hybrid scores have no fixed scale, so a question about something the roadmap does not cover
still gets nearest neighbours. Those are dropped here, before the LLM is called, so the answer
becomes the "no lesson found" reply instead of a made-up match.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, List, Tuple

# Question words and filler that say nothing about the topic
QUESTION_WORDS = {
    "có", "không", "nào", "bài", "về", "là", "gì", "gi", "của", "và", "các", "những", "trong", "để",
    "thế", "nào", "sao", "hãy", "cho", "tôi", "bạn", "mình", "nói", "cách", "hướng", "dẫn", "như",
    "roadmap", "lộ", "trình", "học", "topic", "layer", "item", "the", "what", "is", "how", "any",
    "are", "there", "about", "of", "to", "in", "for", "a", "an", "do", "does",
}
WORD = re.compile(r"\w+", re.UNICODE)


def fold(text: str) -> str:
    """Lowercase without Vietnamese diacritics, so "chia nho" matches "chia nhỏ"."""
    text = text.casefold().replace("đ", "d")
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


FOLDED_QUESTION_WORDS = {fold(w) for w in QUESTION_WORDS}


def content_words(text: str) -> set[str]:
    return {w for w in WORD.findall(fold(text)) if len(w) >= 2 and w not in FOLDED_QUESTION_WORDS}


def _doc_text(doc: Any) -> str:
    return " ".join(str(getattr(doc, field, "") or "") for field in ("title", "description", "content_text", "searchable_text"))


def filter_on_topic(query: str, matches: List[Tuple[Any, float]]) -> List[Tuple[Any, float]]:
    """Keep the matches that share a content word with the query. A query with no content words is left as is."""
    words = content_words(query)
    if not words:
        return matches
    return [(doc, score) for doc, score in matches if words & content_words(_doc_text(doc))]


# English filler that appears in titles but names no technique
TITLE_STOPWORDS = {"and", "the", "for", "with", "from", "into", "via", "vs", "per", "cho", "model", "models"}


def title_terms(title: str) -> set[str]:
    """Technical terms of a title, lowercased: ASCII words of 4+ letters, or acronyms ("LLM", "RAG").

    Short lowercase ASCII words are often Vietnamese syllables ("Tri" in "Tri thức"), so they are skipped.
    """
    return {
        w.casefold()
        for w in WORD.findall(title)
        if w.isascii() and not w.isdigit() and (len(w) >= 4 or (len(w) >= 2 and w.isupper()))
        and w.casefold() not in TITLE_STOPWORDS
    }
