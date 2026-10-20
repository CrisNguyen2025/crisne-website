"""Suggestions shown to readers must route to read-only handling; only the owner's example writes."""

import pytest

from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType

READER_SUGGESTIONS = [
    "Topic backend có những layer nào?",
    "Có những lộ trình nào trên website?",
    "Website có bài nào về Docker hoặc Database không?",
]


@pytest.mark.parametrize("text", READER_SUGGESTIONS)
def test_reader_suggestions_are_knowledge_queries(text):
    result = IntentRouter().classify_heuristics(text)
    assert result is not None and result.intent == IntentType.KNOWLEDGE_QUERY


def test_owner_create_example_is_a_cud_intent():
    result = IntentRouter().classify_heuristics("tạo 2 layer Mock 1 và Mock 2 trong topic backend")
    assert result is not None and result.intent == IntentType.ROADMAP_CUD
