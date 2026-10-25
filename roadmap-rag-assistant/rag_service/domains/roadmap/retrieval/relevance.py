"""Roadmap on-topic gate: a retrieved lesson must share a content word with the question.

The hybrid scores have no fixed scale, so a question about something the roadmap does not cover
still gets nearest neighbours. Those are dropped here, before the LLM is called, so the answer
becomes the "no lesson found" reply instead of a made-up match.

A shared word is not enough when the question names techniques the roadmap never mentions
("fine-tuning bằng LoRA" shares only "mô hình" with every lesson): with the corpus vocabulary
passed in, a question whose technical terms are all unknown is dropped as a whole.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from typing import Any, Iterable, List, Optional, Set, Tuple

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


def corpus_vocabulary(docs: Iterable[Any]) -> Set[str]:
    """Content words of every document, the vocabulary `filter_on_topic` checks technical terms against."""
    words: Set[str] = set()
    for doc in docs:
        words |= content_words(_doc_text(doc))
    return words


# Typos ("retreival", "hybird") still name a known term; one wrong letter in four ("lora") does not
TERM_MATCH_CUTOFF = 0.8


def technical_terms(query: str) -> Set[str]:
    """ASCII words of 4+ letters or acronyms ("RLHF"), folded; Vietnamese syllables are left out."""
    return {
        fold(w)
        for w in WORD.findall(query)
        if w.isascii() and w.isalpha() and (len(w) >= 4 or (len(w) >= 2 and w.isupper()))
        and fold(w) not in FOLDED_QUESTION_WORDS
    }


def _known_term(term: str, vocabulary: Set[str], long_words: List[str]) -> bool:
    if term in vocabulary or any(w.startswith(term) or term.startswith(w) for w in long_words):
        return True
    # A typo keeps the length within one letter; "tuning" is not "tung" (folded "từng")
    similar = [w for w in long_words if abs(len(w) - len(term)) <= 1]
    return bool(difflib.get_close_matches(term, similar, n=1, cutoff=TERM_MATCH_CUTOFF))


def names_unknown_topic(query: str, vocabulary: Set[str]) -> bool:
    """True when the query has technical terms and none of them appears in the corpus."""
    terms = technical_terms(query)
    if not terms:
        return False
    long_words = [w for w in vocabulary if len(w) >= 4]
    return not any(_known_term(t, vocabulary, long_words) for t in terms)


def filter_on_topic(
    query: str, matches: List[Tuple[Any, float]], vocabulary: Optional[Set[str]] = None
) -> List[Tuple[Any, float]]:
    """Keep the matches that share a content word with the query. A query with no content words is left as is.

    With `vocabulary`, a query whose technical terms are all unknown to the corpus keeps nothing.
    """
    words = content_words(query)
    if not words:
        return matches
    if vocabulary and names_unknown_topic(query, vocabulary):
        return []
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
