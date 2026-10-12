"""Pytest fixtures for Roadmap RAG Assistant tests."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from rag_service.tools import init_adapter


@pytest.fixture
def mock_adapter():
    """Create a mock adapter with all methods as AsyncMock."""
    adapter = AsyncMock()

    # Default return values for common operations
    adapter.list_topics.return_value = [
        {
            "id": "test-id-1",
            "slug": "test-topic",
            "title": "Test Topic",
            "shortCode": "TT",
            "description": "",
            "icon": "Layers",
            "order": 1,
            "isLocked": False,
            "_count": {"layers": 1},
        }
    ]
    adapter.get_topic.return_value = {
        "id": "test-id-1",
        "slug": "test-topic",
        "title": "Test Topic",
        "layers": [
            {
                "id": "layer-id",
                "shortTag": "01-NL",
                "title": "New Layer",
            }
        ],
    }
    adapter.create_topic.return_value = {
        "id": "new-id",
        "slug": "new-topic",
        "title": "New Topic",
        "shortCode": "NT",
    }
    adapter.delete_topic.return_value = True
    adapter.create_layer.return_value = {
        "id": "layer-id",
        "title": "New Layer",
        "shortTag": "01-NL",
        "order": 1,
    }
    adapter.update_layer.return_value = {
        "id": "layer-id",
        "title": "Updated Layer",
    }
    adapter.delete_layer.return_value = True
    adapter.create_group.return_value = {
        "id": "group-id",
        "title": "New Group",
        "level": "core",
        "order": 1,
    }
    adapter.update_group.return_value = {
        "id": "group-id",
        "title": "Updated Group",
    }
    adapter.delete_group.return_value = True
    adapter.create_item.return_value = {
        "id": "item-id",
        "title": "New Item",
        "description": "",
        "level": "core",
        "layerId": "layer-id",
    }
    adapter.update_item.return_value = {
        "id": "item-id",
        "title": "Updated Item",
    }
    adapter.delete_item.return_value = True

    # Register mock adapter globally
    init_adapter(adapter)

    return adapter


@pytest.fixture
def event_loop():
    """Create an event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
