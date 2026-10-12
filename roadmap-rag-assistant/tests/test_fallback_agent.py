"""End-to-end tests for FallbackAgent multilingual CUD handling across all 4 entity levels."""

from __future__ import annotations

import pytest
from rag_service.agent import FallbackAgent
from rag_service.tools import ALL_TOOLS


@pytest.fixture
def fallback_agent(mock_adapter):
    return FallbackAgent(tools=ALL_TOOLS)


@pytest.mark.asyncio
async def test_fallback_topic_creation_vn(fallback_agent, mock_adapter):
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "tạo ABC topic"}]})
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_topic" for m in msgs)
    assert "ABC" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_topic_creation_en(fallback_agent, mock_adapter):
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "create 2 topics Frontend and Backend"}]})
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_topics_batch" for m in msgs)
    assert "Frontend" in msgs[-1].content
    assert "Backend" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_layer_creation_vn(fallback_agent, mock_adapter):
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "tạo 2 layer mock 1 và 2 trong be topic"}]})
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_layers_batch" for m in msgs)
    assert "mock 1" in msgs[-1].content
    assert "mock 2" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_layer_creation_en(fallback_agent, mock_adapter):
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "create aaa layer on fe"}]})
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_layer" for m in msgs)
    assert "aaa" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_group_creation_vn(fallback_agent, mock_adapter):
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "tạo group Core trong layer aaa"}]})
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_group" for m in msgs)
    assert "Core" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_group_creation_en(fallback_agent, mock_adapter):
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "create 2 groups Core and Advanced in layer mock 1"}]})
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_group" for m in msgs)
    assert "Core" in msgs[-1].content
    assert "Advanced" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_item_creation_vn(fallback_agent, mock_adapter):
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "tạo item Prompt Engineering trong layer 01-LLM level core"}]})
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_item" for m in msgs)
    assert "Prompt Engineering" in msgs[-1].content


@pytest.mark.asyncio
async def test_fallback_item_creation_en(fallback_agent, mock_adapter):
    res = await fallback_agent.ainvoke({"messages": [{"role": "user", "content": "add 3 items: Vector DB, Embeddings, RAG Pipeline to layer 01-LLM level core"}]})
    msgs = res.get("messages", [])
    assert any(m.type == "tool" and m.name == "create_items_batch" for m in msgs)
    assert "Vector DB" in msgs[-1].content
    assert "Embeddings" in msgs[-1].content
    assert "RAG Pipeline" in msgs[-1].content
