"""The agent asks back instead of writing when a create's target layer/topic is unknown or ambiguous."""

from __future__ import annotations

import uuid

import pytest

from rag_service.agent import FallbackAgent
from rag_service.tools import ALL_TOOLS
from rag_service.tools.layer_resolver import resolve_layer

TOPICS = {
    "be": {
        "slug": "be",
        "title": "Backend",
        "layers": [
            {"id": "be-general", "shortTag": "01-GEN", "title": "General"},
            {"id": "be-db", "shortTag": "02-DB", "title": "Database"},
        ],
    },
    "fe": {
        "slug": "fe",
        "title": "Frontend",
        "layers": [
            {"id": "fe-general", "shortTag": "01-GEN", "title": "General"},
            {"id": "fe-training", "shortTag": "02-TRN", "title": "Training"},
        ],
    },
    "empty": {"slug": "empty", "title": "Empty", "layers": []},
}


@pytest.fixture
def adapter(mock_adapter):
    mock_adapter.list_topics.return_value = [{"slug": s, "title": t["title"]} for s, t in TOPICS.items()]
    mock_adapter.get_topic.side_effect = lambda slug: TOPICS.get(slug)
    return mock_adapter


async def _chat(agent, text: str, thread_id: str) -> str:
    res = await agent.ainvoke(
        {"messages": [{"role": "user", "content": text}], "fast": True},
        config={"configurable": {"thread_id": thread_id}},
    )
    return res["messages"][-1].content


# ── Resolver ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "identifier, layer_id",
    [("be-db", "be-db"), ("02-DB", "be-db"), ("database", "be-db"), ("DB", "be-db"), ("layer Database", "be-db")],
)
async def test_resolve_found(adapter, identifier, layer_id):
    res = await resolve_layer(identifier)
    assert res.status == "found"
    assert res.layer_id == layer_id


@pytest.mark.asyncio
async def test_resolve_ambiguous_title(adapter):
    res = await resolve_layer("General")
    assert res.status == "ambiguous"
    assert {c["id"] for c in res.candidates} == {"be-general", "fe-general"}


@pytest.mark.asyncio
async def test_resolve_ambiguous_narrowed_by_page_topic(adapter):
    res = await resolve_layer("General", topic_slug="fe")
    assert res.status == "found"
    assert res.layer_id == "fe-general"


@pytest.mark.asyncio
async def test_resolve_topic(adapter):
    res = await resolve_layer("be topic")
    assert res.status == "topic"
    assert res.topic_slug == "be"
    assert [c["id"] for c in res.candidates] == ["be-general", "be-db"]


@pytest.mark.asyncio
async def test_resolve_not_found_does_not_match_inside_words(adapter):
    # "ai" must not match "Tr-ai-ning"
    res = await resolve_layer("ai")
    assert res.status == "not_found"
    assert res.layer_id is None


@pytest.mark.asyncio
async def test_resolve_unavailable_when_lookup_fails(adapter):
    adapter.list_topics.side_effect = RuntimeError("connection refused")
    res = await resolve_layer("Database")
    assert res.status == "unavailable"


# ── Agent ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unknown_topic_asks_back_without_writing(adapter):
    agent = FallbackAgent(tools=ALL_TOOLS)
    reply = await _chat(agent, "tạo giúp tôi 1 bài về xây dựng ai cơ bản trong ai topic", str(uuid.uuid4()))
    adapter.create_item.assert_not_called()
    adapter.create_group.assert_not_called()
    assert "Không tìm thấy" in reply
    assert "`ai`" in reply


@pytest.mark.asyncio
async def test_pick_offered_layer_by_number(adapter):
    agent = FallbackAgent(tools=ALL_TOOLS)
    thread = str(uuid.uuid4())
    reply = await _chat(agent, "tạo item Docker trong layer General", thread)
    adapter.create_item.assert_not_called()
    assert "khớp nhiều layer" in reply

    await _chat(agent, "2", thread)
    adapter.create_item.assert_called_once()
    assert adapter.create_item.call_args.kwargs["layer_id"] == "fe-general"


@pytest.mark.asyncio
async def test_pick_offered_layer_by_name(adapter):
    agent = FallbackAgent(tools=ALL_TOOLS)
    thread = str(uuid.uuid4())
    reply = await _chat(agent, "tạo item Docker trong be topic", thread)
    adapter.create_item.assert_not_called()
    assert "Database" in reply

    await _chat(agent, "database", thread)
    adapter.create_item.assert_called_once()
    assert adapter.create_item.call_args.kwargs["layer_id"] == "be-db"


@pytest.mark.asyncio
async def test_topic_without_layers_offers_to_create_one(adapter):
    agent = FallbackAgent(tools=ALL_TOOLS)
    reply = await _chat(agent, "tạo item Docker trong empty topic", str(uuid.uuid4()))
    adapter.create_item.assert_not_called()
    assert "tạo layer mặc định" in reply


@pytest.mark.asyncio
async def test_known_layer_is_written_with_its_real_id(adapter):
    agent = FallbackAgent(tools=ALL_TOOLS)
    thread = str(uuid.uuid4())
    await _chat(agent, "tạo item Docker trong layer 02-DB", thread)
    # Without System 2 (no LLM in tests) the change is previewed; the layer is resolved before the card
    adapter.create_item.assert_not_called()
    await _chat(agent, "ok", thread)
    adapter.create_item.assert_called_once()
    assert adapter.create_item.call_args.kwargs["layer_id"] == "be-db"


@pytest.mark.asyncio
async def test_layer_in_unknown_topic_asks_back(adapter):
    agent = FallbackAgent(tools=ALL_TOOLS)
    reply = await _chat(agent, "tạo layer Tools trong xyz topic", str(uuid.uuid4()))
    adapter.create_layer.assert_not_called()
    assert "Không tìm thấy topic `xyz`" in reply
    assert "`be`" in reply
