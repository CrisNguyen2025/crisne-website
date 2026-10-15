"""Tests for CUD tools — verify each tool calls the adapter correctly."""

from __future__ import annotations

import pytest

from rag_service.tools.topic_tools import (
    create_topic,
    create_topics_batch,
    delete_topic,
    list_topics,
)
from rag_service.tools.layer_tools import create_layer, delete_layer, update_layer
from rag_service.tools.group_tools import create_group, delete_group, update_group
from rag_service.tools.item_tools import (
    create_item,
    create_items_batch,
    delete_item,
    update_item,
)


# ── Topic Tools ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_topic(mock_adapter):
    result = await create_topic.ainvoke(
        {"title": "AI Engineering", "short_code": "AI"}
    )
    assert "✅" in result
    assert "New Topic" in result
    mock_adapter.create_topic.assert_called_once()


@pytest.mark.asyncio
async def test_create_topics_batch(mock_adapter):
    result = await create_topics_batch.ainvoke(
        {
            "topics": [
                {"title": "A", "short_code": "A"},
                {"title": "B", "short_code": "B"},
                {"title": "C", "short_code": "C"},
            ]
        }
    )
    assert "✅" in result
    assert "3" in result
    assert mock_adapter.create_topic.call_count == 3


@pytest.mark.asyncio
async def test_list_topics(mock_adapter):
    result = await list_topics.ainvoke({})
    assert "📋" in result
    assert "Test Topic" in result


@pytest.mark.asyncio
async def test_list_topics_empty(mock_adapter):
    mock_adapter.list_topics.return_value = []
    result = await list_topics.ainvoke({})
    assert "Chưa có topic" in result


@pytest.mark.asyncio
async def test_delete_topic(mock_adapter):
    result = await delete_topic.ainvoke({"slug": "test-topic"})
    assert "🗑️" in result
    mock_adapter.delete_topic.assert_called_once_with("test-topic")


@pytest.mark.asyncio
async def test_delete_topic_not_found(mock_adapter):
    mock_adapter.delete_topic.return_value = False
    result = await delete_topic.ainvoke({"slug": "nonexistent"})
    assert "❌" in result


# ── Layer Tools ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_layer(mock_adapter):
    result = await create_layer.ainvoke(
        {
            "topic_slug": "ai-engineering",
            "title": "Database",
            "short_tag": "01-DB",
        }
    )
    assert "✅" in result
    mock_adapter.create_layer.assert_called_once()


@pytest.mark.asyncio
async def test_update_layer(mock_adapter):
    result = await update_layer.ainvoke(
        {"layer_id": "layer-1", "title": "Updated DB"}
    )
    assert "✅" in result
    mock_adapter.update_layer.assert_called_once()


@pytest.mark.asyncio
async def test_delete_layer(mock_adapter):
    result = await delete_layer.ainvoke({"layer_id": "layer-1"})
    assert "🗑️" in result


# ── Group Tools ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_group(mock_adapter):
    result = await create_group.ainvoke(
        {"layer_id": "layer-id", "title": "Core", "level": "core"}
    )
    assert "✅" in result
    mock_adapter.create_group.assert_called_once()


@pytest.mark.asyncio
async def test_update_group(mock_adapter):
    result = await update_group.ainvoke(
        {"group_id": "group-1", "title": "Fundamentals"}
    )
    assert "✅" in result


@pytest.mark.asyncio
async def test_delete_group(mock_adapter):
    result = await delete_group.ainvoke({"group_id": "group-1"})
    assert "🗑️" in result


# ── Item Tools ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_item(mock_adapter):
    result = await create_item.ainvoke(
        {
            "layer_id": "layer-id",
            "level": "core",
            "title": "Prompt Engineering",
        }
    )
    assert "✅" in result
    mock_adapter.create_item.assert_called_once()


@pytest.mark.asyncio
async def test_create_items_batch(mock_adapter):
    result = await create_items_batch.ainvoke(
        {
            "layer_id": "layer-id",
            "level": "core",
            "items": [
                {"title": "Vector DB"},
                {"title": "Embeddings"},
                {"title": "RAG Pipeline"},
            ],
        }
    )
    assert "✅" in result
    assert "3" in result
    assert mock_adapter.create_item.call_count == 3


@pytest.mark.asyncio
async def test_update_item(mock_adapter):
    result = await update_item.ainvoke(
        {"item_id": "item-1", "title": "Updated Item"}
    )
    assert "✅" in result


@pytest.mark.asyncio
async def test_delete_item(mock_adapter):
    result = await delete_item.ainvoke({"item_id": "item-1"})
    assert "🗑️" in result
