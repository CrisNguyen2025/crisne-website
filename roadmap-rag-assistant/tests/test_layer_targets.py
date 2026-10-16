"""Layer delete/create target parsing and the topic gate in the agent (no LLM, no network)."""

from __future__ import annotations

import asyncio

import pytest

from rag_service.agent import NextGenRoadmapAgent
from rag_service.auth import set_actor
from rag_service.router.schemas import ActionType, EntityLevel
from rag_service.router.entity_extractor import StructuredEntityExtractor
from rag_service.tools.layer_resolver import LayerResolution


def _parse(text: str):
    return StructuredEntityExtractor()._deterministic_extract(text)


def test_trong_topic_is_the_parent_not_a_name():
    action = _parse("xóa layer mock 1 luôn trong topic SS")
    assert action.action == ActionType.DELETE and action.entity_level == EntityLevel.LAYER
    assert action.target_parent_identifier == "SS"
    assert [e.title for e in action.entities] == ["mock 1"]


def test_prefix_topic_is_the_parent():
    action = _parse("xóa layer mock 1 luôn topic ai")
    assert action.target_parent_identifier == "ai"
    assert [e.title for e in action.entities] == ["mock 1"]


def test_urgency_word_alone_is_not_a_parent():
    action = _parse("xóa layer mock 1 ngay")
    assert action.target_parent_identifier is None
    assert [e.title for e in action.entities] == ["mock 1"]


def test_topic_create_keeps_its_name():
    action = _parse("tạo topic AI")
    assert action.entity_level == EntityLevel.TOPIC
    assert [e.title for e in action.entities] == ["AI"]


def test_suffix_topic_still_works_for_layer_enumeration():
    action = _parse("tạo 2 layer mock 1 và 2 trong be topic")
    assert action.target_parent_identifier == "be"
    assert [e.title for e in action.entities] == ["mock 1", "mock 2"]


class _FakeAdapter:
    def __init__(self, topics: dict[str, str]):
        self.topics = topics

    async def list_topics(self):
        return [{"slug": s, "title": t} for s, t in self.topics.items()]

    async def get_topic(self, slug):
        return {"slug": slug} if slug in self.topics else None


@pytest.fixture
def adapter(monkeypatch):
    fake = _FakeAdapter({"ai": "AI", "fe": "Frontend"})
    monkeypatch.setattr("rag_service.agent.get_adapter", lambda: fake)
    return fake


def _run(text: str, thread_id: str):
    agent = NextGenRoadmapAgent(llm_model=None)

    async def run():
        out = []
        async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": text}], "fast": True},
            config={"configurable": {"thread_id": thread_id}},
        ):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


def _kinds(events: list[dict]) -> set[str]:
    return {e.get("type") for e in events}


def test_layer_delete_without_topic_asks_back_with_topics(adapter):
    set_actor("owner")
    text, events = _run("xóa layer mock 1", "lt-no-topic")
    assert "Chưa xác định được topic" in text
    assert "`ai`" in text and "`fe`" in text
    assert "tool_start" not in _kinds(events) and "action_preview" not in _kinds(events)


def test_layer_delete_with_unknown_topic_asks_back(adapter):
    set_actor("owner")
    text, events = _run("xóa layer mock 1 luôn trong topic SS", "lt-unknown-topic")
    assert "Không tìm thấy topic `SS`" in text
    assert "tool_start" not in _kinds(events) and "action_preview" not in _kinds(events)


def test_layer_delete_resolves_layer_before_preview(adapter, monkeypatch):
    async def found(identifier, topic_slug=None):
        return LayerResolution("found", layer_id="L1", layer_title="mock 1", topic_slug="ai")

    monkeypatch.setattr("rag_service.agent.resolve_layer", found)
    set_actor("owner")
    _, events = _run("xóa layer mock 1 topic ai", "lt-preview")
    previews = [e for e in events if e.get("type") == "action_preview"]
    assert previews and "mock 1" in previews[0]["preview"]


def test_layer_delete_missing_layer_is_not_run(adapter, monkeypatch):
    async def missing(identifier, topic_slug=None):
        return LayerResolution("not_found", candidates=[
            {"id": "L2", "title": "Git", "shortTag": "01-GIT", "topic_slug": "ai", "topic_title": "AI"},
        ])

    monkeypatch.setattr("rag_service.agent.resolve_layer", missing)
    set_actor("owner")
    text, events = _run("xóa layer mock 9 trong topic ai", "lt-missing-layer")
    assert "Không tìm thấy layer `mock 9` trong topic `ai`" in text
    assert "01-GIT" in text
    assert "tool_start" not in _kinds(events) and "action_preview" not in _kinds(events)
