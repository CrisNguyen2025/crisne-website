"""Roadmap on-topic gate: lessons that share no content word with the question are dropped before the LLM."""

from __future__ import annotations

from types import SimpleNamespace

from rag_service.domains.roadmap.retrieval.relevance import content_words, filter_on_topic


def _doc(title: str, description: str = "", content: str = ""):
    return SimpleNamespace(title=title, description=description, content_text=content, searchable_text=title)


def test_question_about_an_uncovered_topic_keeps_nothing():
    matches = [(_doc("Prompt Versioning & Registry"), 0.6), (_doc("Production Readiness Checklist"), 0.6)]
    assert filter_on_topic("Có bài nào về Kubernetes và Helm chart không?", matches) == []


def test_on_topic_question_keeps_the_matching_lesson():
    hybrid = (_doc("Hybrid Search", "Kết hợp BM25 và vector"), 0.9)
    other = (_doc("Chunking Strategy"), 0.8)
    assert filter_on_topic("Bài Hybrid Search là gì?", [hybrid, other]) == [hybrid]


def test_question_words_alone_do_not_count_as_a_match():
    assert "có" not in content_words("Có bài nào không?")
    assert content_words("Có bài nào không?") == set()


def test_query_without_content_words_is_left_to_the_search():
    matches = [(_doc("Hybrid Search"), 0.9)]
    assert filter_on_topic("bài nào?", matches) == matches
