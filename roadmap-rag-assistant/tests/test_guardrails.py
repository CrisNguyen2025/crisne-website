"""Scope guardrail (OUT_OF_SCOPE) and page-context grounding tests."""

import asyncio

from rag_service.agent import NextGenRoadmapAgent
from rag_service.api.schemas import ChatRequest
from rag_service.router.grounding import OUT_OF_SCOPE_REPLY, build_grounding, with_grounding
from rag_service.router.intent_router import IntentRouter
from rag_service.router.schemas import IntentType


def test_off_topic_is_out_of_scope():
    router = IntentRouter()
    for text in ["thời tiết hôm nay ở Hà Nội thế nào?", "giá bitcoin hôm nay bao nhiêu", "what is the weather today"]:
        res = router.classify_heuristics(text)
        assert res is not None and res.intent == IntentType.OUT_OF_SCOPE, text


def test_roadmap_terms_are_not_out_of_scope():
    router = IntentRouter()
    # Mentions both an off-topic word and a roadmap entity: must stay in roadmap flow.
    res = router.classify_heuristics("tạo topic thời tiết")
    assert res is None or res.intent != IntentType.OUT_OF_SCOPE


def test_roadmap_question_is_not_refused():
    router = IntentRouter()
    res = router.classify_heuristics("tìm bài học về Docker")
    assert res is not None and res.intent == IntentType.KNOWLEDGE_QUERY


def test_agent_refuses_out_of_scope_without_tools():
    agent = NextGenRoadmapAgent(llm_model=None)

    async def run():
        out = []
        async for ev in agent.astream_events({"messages": [{"role": "user", "content": "thời tiết hôm nay thế nào?"}]}):
            out.append(ev)
        return out

    events = asyncio.run(run())
    assert not [e for e in events if e.get("type") == "tool_start"]
    text = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
    assert text.strip().startswith("Xin lỗi")
    assert "lộ trình" in text


def test_build_grounding_empty_and_filled():
    assert build_grounding(None) == ""
    assert build_grounding({"roadmapSlug": "  "}) == ""
    hint = build_grounding({"roadmapSlug": "fe", "layerId": "L1"})
    assert "roadmap='fe'" in hint and "layerId='L1'" in hint


def test_with_grounding_keeps_message_when_no_context():
    assert with_grounding("thêm item", None) == "thêm item"
    assert with_grounding("thêm item", {"layerId": "L1"}).endswith("\nthêm item")


def test_chat_request_accepts_context():
    req = ChatRequest(message="thêm item", context={"roadmapSlug": "fe", "layerId": "L1"})
    assert req.context["layerId"] == "L1"
    assert ChatRequest(message="hi").context is None


def test_sanitize_title_strips_page_context_hint():
    from rag_service.router.entity_extractor import StructuredEntityExtractor

    extractor = StructuredEntityExtractor(llm_model=None)
    title = extractor._sanitize_title("Frontend Basics [Ngữ cảnh trang hiện tại: roadmap='kkkk'. Khi người dùng nói 'này']")
    assert "[" not in title and "Ngữ cảnh" not in title and "roadmap=" not in title
    assert "Frontend Basics" in title
