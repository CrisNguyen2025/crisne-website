"""Pytest fixtures for Roadmap RAG Assistant tests."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sqlite3
import time
from unittest.mock import AsyncMock

import pytest

from rag_service.auth import current_actor
from rag_service.config import settings
from rag_service.llm_breaker import llm_breaker
from rag_service.tools import init_adapter

TEST_INTERNAL_KEY = "test-internal-key"
SCHEMA_SQL_PATH = Path(__file__).resolve().parent / "fixtures" / "schema.sql"
DOCUMENTS_JSONL_PATH = Path(__file__).resolve().parent.parent / "evals" / "corpus" / "public" / "roadmap" / "documents.jsonl"


@pytest.fixture(scope="session")
def session_test_db(tmp_path_factory) -> Path:
    """Session-scoped SQLite database initialized from schema.sql and populated from documents.jsonl."""
    db_file = tmp_path_factory.mktemp("db") / "test.db"
    now_ms = int(time.time() * 1000)
    with sqlite3.connect(db_file) as conn:
        conn.executescript(SCHEMA_SQL_PATH.read_text(encoding="utf-8"))
        if DOCUMENTS_JSONL_PATH.exists():
            docs = [json.loads(line) for line in DOCUMENTS_JSONL_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
            topic_map: dict[str, str] = {}
            topic_order = 1
            for doc in docs:
                if doc.get("doc_type") == "topic":
                    topic_id = doc.get("source_id") or doc["doc_id"]
                    slug = doc.get("metadata", {}).get("topic") or doc["doc_id"]
                    title = doc["title"]
                    desc = doc["sections"][0]["text"] if doc.get("sections") else ""
                    conn.execute(
                        """INSERT INTO Roadmap (id, slug, title, description, icon, "order", isLocked, createdAt, updatedAt)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (topic_id, slug, title, desc, "Layers", topic_order, 0, now_ms, now_ms),
                    )
                    topic_map[slug] = topic_id
                    topic_order += 1

            item_order = 1
            for doc in docs:
                if doc.get("doc_type") == "item":
                    item_id = doc.get("source_id") or doc["doc_id"]
                    topic_slug = doc.get("metadata", {}).get("topic", "")
                    topic_id = topic_map.get(topic_slug)
                    section = doc.get("metadata", {}).get("section")
                    title = doc["title"]
                    text = doc["sections"][0]["text"] if doc.get("sections") else ""
                    conn.execute(
                        """INSERT INTO RoadmapItem (id, roadmapId, section, title, description, content, "order", status, statusUpdatedAt, createdAt, updatedAt)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (item_id, topic_id, section, title, text, text, item_order, "known", now_ms, now_ms, now_ms),
                    )
                    item_order += 1
        conn.commit()
    return db_file


@pytest.fixture(autouse=True)
def isolated_test_db(session_test_db, monkeypatch):
    """Ensure all tests and adapters use the temporary test DB instead of prisma/dev.db."""
    monkeypatch.setattr(settings, "sqlite_db_path", str(session_test_db))
    monkeypatch.setattr("evals.corpus_export.DEV_DB", session_test_db)
    monkeypatch.setattr("evals.target.DEV_DB", session_test_db)
    try:
        import evals.router.holdout as holdout

        monkeypatch.setattr(holdout, "_CATALOG", None)
        monkeypatch.setattr(holdout, "_SCOPE", None)
    except (ImportError, AttributeError):
        pass


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
def visitor_headers(owner_headers) -> dict[str, str]:
    """Headers the Next.js proxy sends for an anonymous visitor."""
    return {**owner_headers, "x-actor": "visitor"}


@pytest.fixture
def mock_adapter():
    """Create a mock adapter with all methods as AsyncMock."""
    adapter = AsyncMock()

    # Default return values for common operations (ADR-0009: a topic holds lessons, some in a section)
    adapter.list_topics.return_value = [
        {
            "id": "test-id-1",
            "slug": "test-topic",
            "title": "Test Topic",
            "description": "",
            "icon": "Layers",
            "order": 1,
            "isLocked": False,
            "_count": {"items": 1},
        }
    ]
    adapter.get_topic.return_value = {
        "id": "test-id-1",
        "slug": "test-topic",
        "title": "Test Topic",
        "items": [{"id": "item-id-1", "title": "Existing Lesson", "section": "New Section", "order": 1}],
        "sections": ["New Section"],
    }
    adapter.create_topic.return_value = {
        "id": "new-id",
        "slug": "new-topic",
        "title": "New Topic",
    }
    adapter.delete_topic.return_value = True
    adapter.create_item.return_value = {
        "id": "item-id",
        "title": "New Item",
        "description": "",
        "section": None,
        "roadmapSlug": "test-topic",
    }
    adapter.update_item.return_value = {
        "id": "item-id",
        "title": "Updated Item",
    }
    adapter.update_section.return_value = {"renamed": 1, "section": "Renamed"}
    adapter.update_item_order.return_value = True
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
