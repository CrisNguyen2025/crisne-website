"""End-to-end tests for FallbackAgent multilingual CUD handling of topics and lessons (ADR-0009)."""

from __future__ import annotations

import pytest
from rag_service.agent import FallbackAgent
from rag_service.tools import ALL_TOOLS


@pytest.fixture
def fallback_agent(mock_adapter):
    return FallbackAgent(tools=ALL_TOOLS)



async def send_confirmed(agent, text: str, thread: str) -> dict:
    """Send a change; without System 2 (no LLM here) it is previewed, so confirm it as the user would."""
    from rag_service.state import session_store

    config = {"configurable": {"thread_id": thread}}
    first = await agent.ainvoke({"messages": [{"role": "user", "content": text}]}, config=config)
    if not session_store.get_or_create(thread).pending_confirmation:
        return first
    second = await agent.ainvoke({"messages": [{"role": "user", "content": "ok"}]}, config=config)
    return {"messages": first.get("messages", []) + second.get("messages", [])}

@pytest.mark.asyncio
async def test_fallback_topic_creation_vn(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "tạo ABC topic", "fb-1")
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_topic" for m in msgs)
    assert "ABC" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_topic_creation_en(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "create 2 topics Frontend and Backend", "fb-2")
    msgs = res.get("messages", [])
    # a confirmed batch reports the tool by its singular name
    assert any(m.type == "tool" and m.name in ("create_topics_batch", "create_topic") for m in msgs)
    assert mock_adapter.create_topic.call_count == 2
    assert "Frontend" in msgs[-1].content
    assert "Backend" in msgs[-1].content


@pytest.mark.asyncio
@pytest.mark.parametrize("text", ["tạo 2 layer mock 1 và 2 trong be topic", "tạo group Core trong layer aaa của topic be", "add group Advanced to layer 02-AAA in topic be"])
async def test_fallback_layer_or_group_is_asked_back_and_writes_nothing(fallback_agent, mock_adapter, text):
    from rag_service.domains.roadmap.router.grounding import legacy_level_reply

    res = await send_confirmed(fallback_agent, text, f"legacy-{text}")
    msgs = res.get("messages", [])
    assert not any(m.type == "tool" for m in msgs)
    assert msgs[-1].content == legacy_level_reply(text)
    mock_adapter.create_item.assert_not_called()
    mock_adapter.create_topic.assert_not_called()


@pytest.mark.asyncio
async def test_fallback_layer_after_its_name_writes_nothing(fallback_agent, mock_adapter):
    # "layer" after the name is not read as the removed level (a title may end in "Layer"); still never a write
    res = await send_confirmed(fallback_agent, "create aaa layer on fe", "legacy-suffix")
    assert not any(m.type == "tool" for m in res.get("messages", []))
    mock_adapter.create_item.assert_not_called()


@pytest.mark.asyncio
async def test_fallback_item_creation_vn(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "tạo item Prompt Engineering trong topic test-topic", "fb-6")
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_item" for m in msgs)
    assert "Prompt Engineering" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_item_creation_en(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "add 3 items: Vector DB, Embeddings, RAG Pipeline to topic test-topic", "fb-7")
    msgs = res.get("messages", [])
    # a confirmed batch reports the tool by its singular name
    assert any(m.type == "tool" and m.name in ("create_items_batch", "create_item") for m in msgs)
    assert mock_adapter.create_item.call_count == 3
    assert "Vector DB" in msgs[-1].content
    assert "Embeddings" in msgs[-1].content
    assert "RAG Pipeline" in msgs[-1].content
