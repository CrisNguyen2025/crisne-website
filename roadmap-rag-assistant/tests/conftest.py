"""Pytest fixtures for Roadmap RAG Assistant tests."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from rag_service.auth import current_actor
from rag_service.config import settings
from rag_service.llm_breaker import llm_breaker
from rag_service.tools import init_adapter

TEST_INTERNAL_KEY = "test-internal-key"


@pytest.fixture(autouse=True)
def closed_llm_breaker():
    """The LLM circuit breaker is process-wide: a 429 in one test must not skip the LLM in the next."""
    llm_breaker.reset()
    yield
    llm_breaker.reset()


@pytest.fixture(autouse=True)
def owner_access(monkeypatch):
    """Tests act as the site owner behind the Next.js proxy unless they opt out.

    Access control itself is covered in test_auth.py, which switches to a visitor.
    """
    monkeypatch.setattr(settings, "internal_api_key", TEST_INTERNAL_KEY)
    token = current_actor.set("owner")
    yield
    current_actor.reset(token)


@pytest.fixture
def owner_headers() -> dict[str, str]:
    """Headers the Next.js proxy sends for the signed-in owner."""
    return {"x-internal-key": TEST_INTERNAL_KEY, "x-actor": "owner"}


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
