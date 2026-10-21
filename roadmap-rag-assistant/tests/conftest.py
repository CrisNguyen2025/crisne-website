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


class LiveApiBlocked(RuntimeError):
    """A test reached the roadmap adapter without choosing one: it would have used the running Next.js database."""


class OfflineAdapter:
    """Default adapter in tests: any call fails loudly instead of reading or writing the real roadmap.

    A test that needs roadmap data uses the `mock_adapter` fixture, or patches `get_adapter`.
    """

    def __getattr__(self, name: str):
        async def blocked(*args, **kwargs):
            raise LiveApiBlocked(f"adapter.{name}() reached the live roadmap API; use the mock_adapter fixture")

        return blocked


@pytest.fixture(autouse=True)
def no_live_roadmap_api():
    """Without this, get_adapter() builds an HttpApiAdapter to the running Next.js and tests write to its database.

    The adapter is process-wide, so it is also restored after each test: no test sees another test's adapter.
    """
    import rag_service.tools as tools

    previous = tools._adapter
    tools._adapter = OfflineAdapter()
    yield
    tools._adapter = previous


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
