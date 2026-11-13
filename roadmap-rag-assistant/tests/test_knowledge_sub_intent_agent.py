"""The agent's dispatch on a KNOWLEDGE_QUERY sub-intent (docs/knowledge-sub-intents-design.md, Phase 3).

CATALOG and LESSON_STATUS questions are answered from data after the router, with no scope read and no search;
anything their handler does not read falls back to the search. A change (section rename, lesson status) still
runs before the router, and a visitor never reaches lesson status.
"""

from __future__ import annotations

import asyncio

import pytest

import rag_service.domains.roadmap.agent as agent_module
from rag_service.auth import OWNER_ONLY_MESSAGE, set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router.scope import Scope, ScopeResult


@pytest.fixture
def probes(monkeypatch):
    """Record the searches and scope reads; a search answers "SEARCHED"."""
    seen = {"search": [], "scope": []}

    async def search(**kw):
        seen["search"].append(kw["query"])
        yield {"type": "token", "delta": "SEARCHED"}

    async def scope(text, engine, embed=None):
        seen["scope"].append(text)
        return ScopeResult(Scope.EXTERNAL, "x", "test")

    monkeypatch.setattr(agent_module, "answer_from_sources", search)
    monkeypatch.setattr(agent_module, "classify_for_routing", scope)
    return seen


def _turn(text: str, thread: str, actor: str = "owner", context: dict | None = None):
    async def run():
        set_actor(actor)
        payload = {"messages": [{"role": "user", "content": text}], "fast": True}
        if context:
            payload["context"] = context
        agent = NextGenRoadmapAgent(llm_model=None)
        return [ev async for ev in agent.astream_events(payload, config={"configurable": {"thread_id": thread}})]

    events = asyncio.run(run())
    reply = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
    return reply, [e["name"] for e in events if e.get("type") == "tool_start"], events


def _route_step(events):
    return next(e for e in events if e.get("type") == "step" and e.get("id") == "route" and e.get("status") == "done")


def test_topic_listing_is_answered_from_data_without_scope_or_search(mock_adapter, probes):
    reply, tools, events = _turn("Liệt kê tất cả các topic hiện có trên website", "ksi-list")
    assert tools == ["list_topics"] and "Test Topic" in reply
    assert probes == {"search": [], "scope": []}
    assert _route_step(events)["sub_intent"] == "catalog"


def test_a_count_has_no_handler_yet_and_falls_back_to_the_search(mock_adapter, probes):
    reply, tools, events = _turn("Topic AI Engineering có bao nhiêu bài học", "ksi-count")
    assert reply == "SEARCHED" and tools == []
    assert _route_step(events)["sub_intent"] == "catalog"


def test_a_lesson_status_question_is_answered_for_the_owner(mock_adapter, probes):
    mock_adapter.get_topic.return_value = {
        "id": "t1", "slug": "ai", "title": "AI",
        "items": [{"id": "i1", "title": "Mastered Lesson", "status": "known", "statusUpdatedAt": None}],
    }
    reply, tools, events = _turn("bài nào cần ôn lại", "ksi-review", context={"roadmapSlug": "ai"})
    assert "Mastered Lesson" in reply and tools == ["get_lesson_status"]
    assert probes == {"search": [], "scope": []}
    assert _route_step(events)["sub_intent"] == "lesson_status"


@pytest.mark.parametrize("text", ["Bài Docker đã nắm chưa", "Tôi đã nắm được những bài học nào rồi", "Tiến độ học tập của tôi đến đâu rồi"])
def test_a_visitor_never_reaches_lesson_status_or_the_search(mock_adapter, probes, text):
    """Phrasings the old handler did not read ("đã nắm chưa") now stop at the router for a visitor, not at the search."""
    reply, tools, _ = _turn(text, f"ksi-visitor-{abs(hash(text))}", actor="visitor")
    assert OWNER_ONLY_MESSAGE in reply
    assert tools == [] and probes == {"search": [], "scope": []}
    mock_adapter.get_topic.assert_not_called()


def test_the_owner_is_answered_for_a_phrasing_the_old_handler_missed(mock_adapter, probes):
    """"đã nắm chưa" reads as a statement: the router and the handler now share one cue, so both see it."""
    mock_adapter.get_topic.return_value = {
        "id": "t1", "slug": "ai", "title": "AI", "items": [{"id": "i1", "title": "Docker", "status": "known"}],
    }
    _, tools, events = _turn("Bài Docker đã nắm chưa", "ksi-owner-chua", context={"roadmapSlug": "ai"})
    assert _route_step(events)["sub_intent"] == "lesson_status" and tools == ["get_lesson_status"]
    assert probes["search"] == []


def test_progress_in_another_field_is_not_lesson_status(mock_adapter, probes):
    _, tools, events = _turn("Tiến độ giải ngân vốn đầu tư công hiện nay thế nào", "ksi-economy")
    assert "get_lesson_status" not in tools
    assert _route_step(events).get("sub_intent") != "lesson_status"


def test_a_status_change_still_runs_before_the_router(mock_adapter, probes):
    mock_adapter.get_topic.return_value = {
        "id": "t1", "slug": "ai", "title": "AI", "items": [{"id": "i1", "title": "Docker Compose", "status": "known"}],
    }
    reply, _, events = _turn("Đánh dấu bài Docker Compose là đang học", "ksi-change", context={"roadmapSlug": "ai"})
    assert "Đổi trạng thái bài học" in reply
    assert not any(e.get("type") == "step" and e.get("id") == "route" for e in events)  # no router step
    mock_adapter.update_item.assert_not_called()  # a preview only, until "ok"
