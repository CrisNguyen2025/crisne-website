"""Example searches come from the roadmap as it is: lessons that exist, never the search that just failed."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from rag_service.domains.roadmap.agent_actions import EMPTY_ROADMAP_NOTE, RoadmapAgentActions
from rag_service.domains.roadmap.retrieval.engine import rag_engine
from rag_service.domains.roadmap.retrieval.ingestion import KnowledgeDocument
from rag_service.domains.roadmap.router.grounding import (
    CREATE_TOPIC_EXAMPLE,
    LIST_EXAMPLE,
    UNCLEAR_REPLY,
    browse_examples,
    no_match_reply,
    plan_examples,
    search_examples,
    topic_examples,
    unclear_reply,
)


def _doc(kind: str, title: str) -> KnowledgeDocument:
    return KnowledgeDocument(id=f"{kind}-{title}", doc_type=kind, title=title, topic_slug="ai",
                             topic_title="AI Engineering", searchable_text=title)


LESSONS = ["Hybrid Search", "Chunking Strategy"]


@pytest.fixture
def roadmap(monkeypatch):
    """Index the given documents; returns a setter so a test can empty the roadmap."""
    def index(docs):
        monkeypatch.setattr(rag_engine, "_is_synced", True)
        monkeypatch.setattr(rag_engine._vector_store, "_docs_map", {d.id: d for d in docs})

    index([*(_doc("item", t) for t in LESSONS), _doc("topic", "AI Engineering"), _doc("item", "2")])
    return index


def test_search_examples_name_lessons_that_exist(roadmap):
    for _ in range(20):
        [example] = search_examples()
        assert example in {f"tìm bài học về {t}" for t in LESSONS}  # never the thin item "2"
    assert topic_examples() == ["topic AI Engineering có những bài gì"]
    assert plan_examples() == ["Mình muốn học AI Engineering, nên đọc bài nào trước?"]


def test_no_match_never_suggests_the_search_that_just_failed(roadmap):
    for _ in range(20):
        reply = no_match_reply(False, "chunking strategy là gì?")
        assert "tìm bài học về Hybrid Search" in reply
        assert "Chunking" not in reply
    reply = no_match_reply(False, "Docker là gì?")
    assert "Docker" not in reply and LIST_EXAMPLE in reply


def test_an_empty_roadmap_suggests_no_search(roadmap):
    roadmap([])
    assert browse_examples() == [] and search_examples() == [] and plan_examples() == []
    assert unclear_reply(False) == UNCLEAR_REPLY  # nothing to try that would find anything
    assert CREATE_TOPIC_EXAMPLE in unclear_reply(True)
    assert "tìm bài" not in no_match_reply(False, "Docker là gì?")


def test_create_example_does_not_pick_a_subject_for_the_owner():
    assert CREATE_TOPIC_EXAMPLE == "tạo topic <tên topic>"


def _help(monkeypatch) -> str:
    adapter = AsyncMock()
    adapter.list_topics.return_value = []
    monkeypatch.setattr("rag_service.domains.roadmap.agent_actions.get_adapter", lambda: adapter)
    return asyncio.run(RoadmapAgentActions._help_reply(None))


def test_help_reply_searches_the_roadmap_it_has(roadmap, monkeypatch):
    text = _help(monkeypatch)
    assert "topic AI Engineering có những bài gì" in text
    assert any(f"tìm bài học về {t}" in text for t in LESSONS)
    assert "Docker" not in text and "DevOps" not in text


def test_help_reply_on_an_empty_roadmap_says_so_instead(roadmap, monkeypatch):
    roadmap([])
    text = _help(monkeypatch)
    assert EMPTY_ROADMAP_NOTE in text and "tìm bài" not in text
