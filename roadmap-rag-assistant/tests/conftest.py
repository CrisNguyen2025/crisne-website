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
def no_live_llm(monkeypatch):
    """Tests never call a real model: build_agent() runs offline unless a test injects its own LLM.

    The API keys in .env would otherwise make HTTP-level tests depend on a provider's answer and quota.
    Evals (evals/) are where live models are measured.
    """
    import rag_service.api.routes as routes

    monkeypatch.setattr(settings, "llm_provider", "offline")
    monkeypatch.setattr(settings, "llm_fallback_provider", "")
    monkeypatch.setattr(settings, "llm_model_router", "")
    monkeypatch.setattr(routes, "_agent", None)
    yield
    routes._agent = None


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
def write_grant():
    """A write grant for tests of the write logic itself (executor, adapters, write tools).

    Not autouse: every other test runs without one, so a path that writes without passing a decision point fails.
    """
    from rag_service.write_grant import write_granted

    with write_granted("test of the write logic"):
        yield


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


async def stream_confirmed(client, message: str, thread_id: str) -> str:
    """POST a change to /chat/stream; tests run without System 2, so it is previewed: confirm it with "ok".

    Returns the body of the turn that ran the change (the first one when nothing was previewed).
    """
    from rag_service.state import session_store

    first = await client.post("/chat/stream", json={"message": message, "thread_id": thread_id})
    assert first.status_code == 200
    if not session_store.get_or_create(thread_id).pending_confirmation:
        return first.text
    second = await client.post("/chat/stream", json={"message": "ok", "thread_id": thread_id})
    assert second.status_code == 200
    return second.text



@pytest.fixture
def catalog_topics(monkeypatch):
    """Add topic names to the roadmap catalog, for tests whose mock adapter has topics the index does not.

    In production the catalog and the adapter read the same database; P3 asks the catalog whether a place
    named without its noun ("layer trong fe") is a topic of the roadmap (router/object_sense.py).
    """
    from rag_service.domains.roadmap.retrieval.engine import rag_engine

    real = rag_engine.catalog

    def add(*names: str) -> None:
        async def catalog():
            found = await real()
            found.topics |= set(names)
            return found

        monkeypatch.setattr(rag_engine, "catalog", catalog)

    return add
