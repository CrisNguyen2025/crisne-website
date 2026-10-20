"""A leading greeting must not turn a chitchat message into a knowledge search."""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType

router = IntentRouter(None)


@pytest.mark.parametrize(
    "text,intent",
    [
        ("Xin chào, bạn là ai?", IntentType.CHITCHAT),
        ("xin chào", IntentType.CHITCHAT),
        ("hi Abot!", IntentType.CHITCHAT),
        ("hello, bạn tên gì?", IntentType.CHITCHAT),
        # A greeting in front of a real request keeps the request's intent
        ("Xin chào, Hybrid Search là gì?", IntentType.KNOWLEDGE_QUERY),
        ("Chào, tạo topic Docker", IntentType.ROADMAP_CUD),
    ],
)
def test_greeting_prefix(text, intent):
    assert router.classify_heuristics(text).intent == intent
