"""KNOWLEDGE_QUERY sub-intents (design: docs/knowledge-sub-intents-design.md): which downstream answers a question.

The decision table sets `sub_intent`; the LLM router never does. Lesson Status (ADR-0010) questions are read-only:
a status change ("đánh dấu bài X là đang học") is handled by parse_status_change_request, never by a sub-intent.
"""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.lesson_status import (
    asks_next_learning,
    asks_review,
    asks_what_i_know,
    parse_status_change_request,
)
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentClassificationResult, IntentType, KnowledgeSubIntent

SEARCH, CATALOG, STATUS = KnowledgeSubIntent.SEARCH, KnowledgeSubIntent.CATALOG, KnowledgeSubIntent.LESSON_STATUS


def _decide(text: str):
    return IntentRouter().decide(text)


@pytest.mark.parametrize(
    "text",
    [
        "Liệt kê tất cả các topic hiện có trên website",  # cat-01
        "Topic AI Engineering có bao nhiêu bài học",  # cat-02
        "Topic này có mấy bài",  # cat-03
        "Cho mình xem danh sách các section trong topic DevOps",  # cat-04
        "Bài Semantic Caching nằm ở đâu vậy",  # cat-05
        "Lộ trình Backend gồm những mục nào",  # cat-06
        "cho xem danh sach topic",  # cat-07
        "which sections are included in Frontend roadmap",  # cat-08
    ],
)
def test_structure_questions_are_catalog(text):
    d = _decide(text)
    assert (d.intent, d.sub_intent) == (IntentType.KNOWLEDGE_QUERY, CATALOG)


@pytest.mark.parametrize(
    "text",
    [
        "Tôi đang biết những gì về AI Engineering?",  # ls-01
        "Tôi đã nắm được những bài học nào rồi",  # ls-02
        "Tiến độ học tập của tôi đến đâu rồi",  # ls-03
        "Hôm nay nên học bài gì tiếp",  # ls-04
        "Bài nào đang học dở",  # ls-05
        "Gợi ý bài tiếp theo trong topic Docker",  # ls-06
        "Bài nào cần ôn lại",  # ls-07
        "Những bài đã nắm lâu rồi chưa xem lại",  # ls-08
        "Cho tôi danh sách bài cần ôn trong phần RAG",  # ls-09
        "Sau bài Docker Compose thì nên học bài nào",  # ls-10
        "Bài Docker đã nắm chưa",
        "nên học gì tiếp",  # no lesson noun: only filler around the cue
        "tiếp theo nên học gì",
        "gợi ý học tiếp",
    ],
)
def test_lesson_status_questions_are_lesson_status(text):
    d = _decide(text)
    assert (d.intent, d.sub_intent, d.row) == (IntentType.KNOWLEDGE_QUERY, STATUS, "lesson_status_query")


@pytest.mark.parametrize(
    "text",
    [
        "Tôi đang học RAG, hãy giải thích chunking",  # bound-01
        "Semantic Caching hoạt động thế nào",  # bound-03
        "Tìm giúp mấy bài về authentication và JWT",  # bound-07: "mấy bài" with a search verb
        "bài tiếp theo của series này nói về gì",  # bound-08: asks what a lesson says
        "Học gì tiếp theo sau khi tốt nghiệp cấp 3",  # bound-09: no lesson named
        "Tiến độ giải ngân vốn đầu tư công hiện nay thế nào",  # bound-10: "tiến độ" alone
        "nếu xóa topic AI thì có mất bài không",  # a hypothetical change is a question about content
        "ai đã xóa bài Redis k",
    ],
)
def test_look_alikes_are_not_lesson_status_or_catalog(text):
    d = _decide(text)
    assert d.sub_intent not in (STATUS, CATALOG)


def test_content_questions_about_the_roadmap_are_search():
    d = _decide("nếu xóa topic AI thì có mất bài không")
    assert (d.intent, d.sub_intent, d.row) == (IntentType.KNOWLEDGE_QUERY, SEARCH, "roadmap_content_query")


@pytest.mark.parametrize("text", ["Đánh dấu bài Docker Compose là đang học", "Chuyển bài Kafka sang đã nắm"])
def test_status_changes_are_not_status_questions(text):
    """bound-04, bound-05: a change never becomes a sub-intent; parse_status_change_request handles it before the router."""
    assert _decide(text).sub_intent is None
    assert parse_status_change_request(text) is not None
    assert not (asks_review(text) or asks_next_learning(text) or asks_what_i_know(text))


def test_handler_cues_agree_with_the_router():
    for text in ["bài nào cần ôn lại", "nên học gì tiếp", "tôi đã nắm những gì về RAG"]:
        assert asks_review(text) or asks_next_learning(text) or asks_what_i_know(text)
        assert _decide(text).sub_intent == STATUS
    for text in ["Học gì tiếp theo sau khi tốt nghiệp cấp 3", "Tiến độ giải ngân vốn đầu tư công hiện nay thế nào"]:
        assert not (asks_review(text) or asks_next_learning(text) or asks_what_i_know(text))


def test_sub_intent_only_on_knowledge_query():
    res = IntentClassificationResult(intent=IntentType.CHITCHAT, confidence=0.9, sub_intent=SEARCH)
    assert res.sub_intent is None and res.sub_intent_value is None
    res = IntentClassificationResult(intent=IntentType.KNOWLEDGE_QUERY, confidence=0.9, sub_intent=CATALOG)
    assert res.sub_intent_value == "catalog"


def test_snapshot_and_result_carry_the_sub_intent():
    d = _decide("Bài nào cần ôn lại")
    assert d.snapshot()["sub_intent"] == "lesson_status"
    assert d.to_result().sub_intent == STATUS
    assert "sub_intent" not in _decide("xin chào").snapshot()


def test_llm_router_cannot_set_the_sub_intent():
    import asyncio
    from unittest.mock import patch

    llm_result = IntentClassificationResult(intent=IntentType.KNOWLEDGE_QUERY, confidence=0.9, sub_intent=STATUS)

    async def fake(*_a, **_k):
        return llm_result

    router = IntentRouter(llm_model=object())
    with patch("rag_service.domains.roadmap.router.intent_router.invoke_structured", fake):
        res, method = asyncio.run(router.aroute("asdf qwer zxcv"))
    assert method == "llm" and res.intent == IntentType.KNOWLEDGE_QUERY and res.sub_intent is None


def test_sub_intent_accuracy_meets_the_threshold(capsys):
    """Labels live in evals/datasets/_routing/samples.jsonl (metadata.sub_intent); see evals/router/sub_intent_check.py."""
    from evals.router.sub_intent_check import main

    assert main([]) == 0, capsys.readouterr().out[-2000:]
