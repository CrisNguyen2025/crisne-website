"""Regression cases for the intent router: unaccented keywords, change verbs without an object,
and newline-separated search plus change requests."""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType

UNACCENTED = [
    ("xoa bai kafka", IntentType.ROADMAP_CUD),
    ("sua lai ten bai so 4 thanh Asynchronous Programming", IntentType.ROADMAP_CUD),
    ("tim bai ve websocket", IntentType.KNOWLEDGE_QUERY),
    ("cho xem danh sach cac topic trong phan frontend", IntentType.KNOWLEDGE_QUERY),
    ("chuyen bai RAG sang layer AI", IntentType.ROADMAP_CUD),
    ("Chuyển topic Docker lên đầu", IntentType.ROADMAP_CUD),
]

# A change verb with no roadmap object is not a change request; the LLM router decides these
NO_OBJECT = ["Xóa.", "xóa nó đi", "sửa lại cho chuẩn đi"]


@pytest.mark.parametrize("text,intent", UNACCENTED)
def test_unaccented_and_move_requests_route_correctly(text, intent):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == intent


@pytest.mark.parametrize("text", NO_OBJECT)
def test_change_verb_without_object_is_left_undecided(text):
    assert IntentRouter().classify_heuristics(text) is None


def test_newline_separates_search_and_change():
    assert IntentRouter().has_mixed_intents("tìm bài về docker\n\nxóa topic cũ")
