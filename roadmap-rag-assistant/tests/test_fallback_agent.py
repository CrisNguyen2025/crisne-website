"""End-to-end tests for FallbackAgent multilingual CUD handling across all 4 entity levels."""

from __future__ import annotations

import pytest
from rag_service.agent import FallbackAgent
from rag_service.tools import ALL_TOOLS


@pytest.fixture
def fallback_agent(mock_adapter):
    # Layers the prompts below refer to; unknown layers are covered in test_target_clarification.py
    mock_adapter.get_topic.return_value = {
        "id": "test-id-1",
        "slug": "test-topic",
        "title": "Test Topic",
        "layers": [
            {"id": "layer-aaa", "shortTag": "02-AAA", "title": "aaa"},
            {"id": "layer-mock-1", "shortTag": "03-MO1", "title": "mock 1"},
            {"id": "layer-llm", "shortTag": "01-LLM", "title": "LLM Application"},
        ],
    }
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
async def test_fallback_layer_creation_vn(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "tạo 2 layer mock 1 và 2 trong be topic", "fb-3")
    msgs = res.get("messages", [])
    # a confirmed batch reports the tool by its singular name
    assert any(m.type == "tool" and m.name in ("create_layers_batch", "create_layer") for m in msgs)
    assert mock_adapter.create_layer.call_count == 2
    assert "mock 1" in msgs[-1].content
    assert "mock 2" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_layer_creation_en(fallback_agent, mock_adapter):
    # "aaa" is lowercase: nothing in the message says it is a name, so the change is previewed first
    config = {"configurable": {"thread_id": "layer-en"}}
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "create aaa layer on fe"}]}, config=config)
    msgs = res.get("messages", [])
    assert not any(m.type == "tool" and m.name == "create_layer" for m in msgs)
    mock_adapter.create_layer.assert_not_called()
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "ok"}]}, config=config)
    mock_adapter.create_layer.assert_called_once()
    assert "aaa" in res.get("messages", [])[-1].content


@pytest.mark.asyncio
async def test_fallback_group_creation_vn(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "tạo group Core trong layer aaa", "fb-4")
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_group" for m in msgs)
    assert "Core" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_group_creation_en(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "create 2 groups Core and Advanced in layer mock 1", "fb-5")
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_group" for m in msgs)
    assert "Core" in msgs[-1].content
    assert "Advanced" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_item_creation_vn(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "tạo item Prompt Engineering trong layer 01-LLM level core", "fb-6")
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_item" for m in msgs)
    assert "Prompt Engineering" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_item_creation_en(fallback_agent, mock_adapter):
    res = await send_confirmed(fallback_agent, "add 3 items: Vector DB, Embeddings, RAG Pipeline to layer 01-LLM level core", "fb-7")
    msgs = res.get("messages", [])
    # a confirmed batch reports the tool by its singular name
    assert any(m.type == "tool" and m.name in ("create_items_batch", "create_item") for m in msgs)
    assert mock_adapter.create_item.call_count == 3
    assert "Vector DB" in msgs[-1].content
    assert "Embeddings" in msgs[-1].content
    assert "RAG Pipeline" in msgs[-1].content
