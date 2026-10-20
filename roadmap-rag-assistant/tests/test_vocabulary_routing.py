"""Statements that name a known title are knowledge questions, decided before the LLM router."""

from __future__ import annotations

import asyncio

import pytest

from rag_service.domains.roadmap.retrieval.relevance import title_terms
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType

TITLES = ["LLM-as-a-Judge", "Chunking Strategy", "01. Tầng Dữ liệu & Tri thức (Knowledge Base)", "Đánh giá & Benchmark"]
VOCAB = set().union(*(title_terms(t) for t in TITLES))
router = IntentRouter(None, vocabulary=lambda: VOCAB)


def test_title_terms_keep_acronyms_and_long_words_only():
    assert {"llm", "judge", "chunking", "strategy", "knowledge", "base"} <= VOCAB
    # Vietnamese syllables that happen to be ASCII ("Tri") and short words are not terms
    assert "tri" not in VOCAB and "as" not in VOCAB


@pytest.mark.parametrize(
    "text,intent,method",
    [
        ("LLM chấm điểm câu trả lời của chính nó", IntentType.KNOWLEDGE_QUERY, "vocabulary"),
        ("chunking tài liệu dài", IntentType.KNOWLEDGE_QUERY, "vocabulary"),
        # Nothing in common with a title: left to the LLM router (here: no LLM, so the default)
        ("giá USD hiện tại", IntentType.CHITCHAT, "default"),
        ("viết CV xin việc cho vị trí kế toán", IntentType.CHITCHAT, "default"),
    ],
)
def test_statement_routing(text, intent, method):
    result, how = asyncio.run(router.aroute(text))
    assert (result.intent, how) == (intent, method)


def test_router_without_vocabulary_behaves_as_before():
    _, how = asyncio.run(IntentRouter(None).aroute("LLM chấm điểm câu trả lời của chính nó"))
    assert how == "default"
