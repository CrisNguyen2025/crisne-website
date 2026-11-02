"""Visitors say "lộ trình" for a Topic, and an empty roadmap is said to be empty, not "try another keyword"."""

from __future__ import annotations

import asyncio

import pytest

from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.retrieval.engine import rag_engine
from rag_service.domains.roadmap.retrieval.ingestion import KnowledgeDocument
from rag_service.domains.roadmap.router.grounding import empty_roadmap_reply, no_match_reply
from rag_service.domains.roadmap.router.understanding import is_plain_listing


@pytest.mark.parametrize(
    "text",
    [
        "Có những lộ trình nào trên website?",
        "website có lộ trình gì",
        "hiện tại website đang có những lộ trình nào vậy",
        "có bao nhiêu topic",
        "danh sách các lộ trình",
        "Có những roadmap nào?",
        "list all roadmaps",
        "liệt kê topic",
    ],
)
def test_asking_which_topics_exist_is_a_listing(text):
    assert is_plain_listing(text)


@pytest.mark.parametrize(
    "text",
    [
        "lộ trình nào phù hợp cho người mới học AI?",  # a recommendation: answered from the lessons
        "có những lộ trình nào về Docker",  # a search
        "những lộ trình nào nên học trước",
        "tạo lộ trình AI Engineering",  # a change
        "xóa lộ trình AI",
        "lộ trình AI có bài Docker không",
    ],
)
def test_questions_about_a_topic_are_not_a_listing(text):
    assert not is_plain_listing(text)


def _reply(text: str, thread_id: str) -> tuple[str, list[str]]:
    agent = NextGenRoadmapAgent(llm_model=None)

    async def run():
        return [ev async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": text}], "fast": True},
            config={"configurable": {"thread_id": thread_id}},
        )]

    events = asyncio.run(run())
    reply = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
    return reply, [e["name"] for e in events if e.get("type") == "tool_start"]


def test_the_listing_question_lists_topics(mock_adapter):
    reply, tools = _reply("Có những lộ trình nào trên website?", "empty-list-filled")
    assert tools == ["list_topics"]
    assert "Test Topic" in reply


def test_the_listing_question_says_when_there_is_none(mock_adapter):
    mock_adapter.list_topics.return_value = []
    reply, tools = _reply("Có những lộ trình nào trên website?", "empty-list")
    assert tools == ["list_topics"]
    assert "chưa có lộ trình" in reply
    assert "Docker" not in reply  # no search suggestion that cannot find anything


@pytest.fixture
def empty_index(monkeypatch):
    monkeypatch.setattr(rag_engine, "_is_synced", True)
    monkeypatch.setattr(rag_engine._vector_store, "_docs_map", {})


def test_a_search_on_an_empty_roadmap_says_it_is_empty(empty_index, monkeypatch):
    async def fresh():
        return None

    monkeypatch.setattr(rag_engine, "ensure_fresh", fresh)
    reply, _ = _reply("Docker là gì?", "empty-search")
    assert reply.startswith("Hiện website chưa có lộ trình nào")
    assert "tìm bài học về Docker" not in reply


def test_empty_roadmap_reply_offers_creating_only_to_the_owner():
    assert "tạo topic" in empty_roadmap_reply(owner=True)
    assert "tạo topic" not in empty_roadmap_reply(owner=False)


def test_a_filled_roadmap_keeps_the_no_match_reply(monkeypatch):
    from rag_service.domains.roadmap.agent import _unless_empty

    monkeypatch.setattr(rag_engine, "_is_synced", True)
    monkeypatch.setattr(rag_engine._vector_store, "_docs_map", {"d": KnowledgeDocument(
        id="d", doc_type="item", title="Hybrid Search", topic_slug="ai", topic_title="AI", searchable_text="Hybrid Search",
    )})
    assert _unless_empty(no_match_reply)(False) == no_match_reply(False)
    monkeypatch.setattr(rag_engine, "_is_synced", False)  # not indexed yet: unknown, not empty
    monkeypatch.setattr(rag_engine._vector_store, "_docs_map", {})
    assert _unless_empty(no_match_reply)(False) == no_match_reply(False)
