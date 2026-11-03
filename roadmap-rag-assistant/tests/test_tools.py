"""Tests for CUD tools — verify each tool calls the adapter correctly."""

from __future__ import annotations

import pytest

from rag_service.tools.topic_tools import (
    create_topic,
    create_topics_batch,
    delete_topic,
    list_topics,
)
from rag_service.tools.item_tools import (
    create_item,
    create_items_batch,
    delete_item,
    rename_section,
    update_item,
)


# ── Topic Tools ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_topic(mock_adapter):
    result = await create_topic.ainvoke(
        {"title": "AI Engineering"}
    )
    assert "✅" in result
    assert "New Topic" in result
    mock_adapter.create_topic.assert_called_once()


@pytest.mark.asyncio
async def test_create_topics_batch(mock_adapter):
    result = await create_topics_batch.ainvoke(
        {
            "topics": [
                {"title": "A"},
                {"title": "B"},
                {"title": "C"},
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
    assert "chưa có lộ trình (topic) nào" in result


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


# ── Item Tools ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_item(mock_adapter):
    result = await create_item.ainvoke(
        {
            "topic": "test-topic",
            "section": "Core",
            "title": "Prompt Engineering",
        }
    )
    assert "✅" in result
    mock_adapter.create_item.assert_called_once()


@pytest.mark.asyncio
async def test_create_items_batch(mock_adapter):
    result = await create_items_batch.ainvoke(
        {
            "topic": "test-topic",
            "section": "Core",
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
async def test_rename_section(mock_adapter):
    mock_adapter.update_section.return_value = {"section": "Retrieval", "renamed": 2}
    result = await rename_section.ainvoke({"topic": "test-topic", "from_name": "RAG", "to_name": "Retrieval"})
    assert "✅" in result and "Retrieval" in result
    mock_adapter.update_section.assert_called_once_with("test-topic", "RAG", "Retrieval")


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
