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


# A learning plan in plain words: a goal plus a plan noun
LEARNING_PLANS = [
    "Mình muốn học để trở thành DevOps engineer trong 6 tháng, lên giúp mình một lộ trình từ đầu với",
    "e muon di lam frontend dev thi nen hoc theo lo trinh nhu the nao len plan giup e",
    "Can you draft a comprehensive study plan for AWS Solutions Architect Associate certification?",
    "mình đang làm tester muốn chuyển sang automation test, hãy gợi ý và thiết kế toàn bộ lộ trình học phù hợp",
]

# Not plans: a create of a roadmap entity, and a question about the roadmap being studied
NOT_PLANS = [
    ("tạo lộ trình Docker từ căn bản", IntentType.ROADMAP_CUD),
    ("create a new roadmap called System Design from scratch", IntentType.ROADMAP_CUD),
]

CHITCHAT = [
    "cảm ơn bạn nhiều nhé, giải thích chi tiết và nhiệt tình ghê",
    "dạ em cảm ơn anh bot nhiều ạ, mãi đỉnh",
    "bạn có phải là AI của OpenAI không?",
    "bạn do ai tạo ra thế?",
    "hồi nãy tui nói tui tên gì bạn còn nhớ hông?",
    "Tôi vừa bảo tôi muốn học công nghệ gì nhỉ, nhắc lại giúp với",
]


@pytest.mark.parametrize("text", LEARNING_PLANS)
def test_learning_plan_in_plain_words_is_a_plan(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == IntentType.PLAN_GOAL


@pytest.mark.parametrize("text,intent", NOT_PLANS)
def test_creating_a_roadmap_is_not_a_plan_request(text, intent):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == intent


def test_roadmap_question_without_a_goal_is_not_a_plan():
    res = IntentRouter().classify_heuristics("cho mình xem lại toàn bộ cấu trúc các layer của roadmap đang học")
    assert res is None or res.intent != IntentType.PLAN_GOAL


@pytest.mark.parametrize("text", CHITCHAT)
def test_thanks_identity_and_recall_are_chitchat(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == IntentType.CHITCHAT


def test_thanks_followed_by_a_question_still_searches():
    res = IntentRouter().classify_heuristics("cảm ơn, giờ giải thích RAG là gì giúp mình")
    assert res is not None and res.intent == IntentType.KNOWLEDGE_QUERY
