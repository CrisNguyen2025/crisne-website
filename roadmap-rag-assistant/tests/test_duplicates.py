"""Creating an entry that already exists under the same parent is refused, not copied."""

from __future__ import annotations

import asyncio
import sqlite3

import pytest

from rag_service.adapters.errors import DuplicateEntityError, normalize_title
from rag_service.adapters.sqlite_adapter import SqliteAdapter
from rag_service.auth import set_actor
from rag_service.execution.executor import ActionExecutor
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
from rag_service.state.session_store import session_store

SCHEMA = """
CREATE TABLE Roadmap (id TEXT PRIMARY KEY, slug TEXT UNIQUE, title TEXT, description TEXT,
  icon TEXT, "order" INT, isLocked INT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE RoadmapItem (id TEXT PRIMARY KEY, roadmapId TEXT, section TEXT, title TEXT, description TEXT,
  content TEXT, "order" INT, createdAt TEXT, updatedAt TEXT);
"""


@pytest.fixture
def adapter(tmp_path):
    db = tmp_path / "test.db"
    with sqlite3.connect(db) as conn:
        conn.executescript(SCHEMA)
    set_actor("owner")
    return SqliteAdapter(str(db))


def test_normalize_title_ignores_case_and_spacing_not_diacritics():
    assert normalize_title("  Mock   1 ") == normalize_title("mock 1")
    assert normalize_title("Cơ bản") != normalize_title("Co ban")


@pytest.mark.usefixtures("write_grant")
def test_sqlite_refuses_duplicates_at_every_level(adapter):
    async def run():
        topic = await adapter.create_topic("Backend")
        with pytest.raises(DuplicateEntityError) as exc:
            await adapter.create_topic("backend")
        assert exc.value.kind == "topic" and exc.value.existing["slug"] == topic["slug"]

        lesson = await adapter.create_item(topic["slug"], "Core", "Docker Basics")
        # A lesson is known by its title in its topic, whatever section it is asked for
        with pytest.raises(DuplicateEntityError) as exc:
            await adapter.create_item(topic["slug"], "Advanced", "docker basics")
        assert exc.value.existing["id"] == lesson["id"]

    asyncio.run(run())


class _DupItemAdapter:
    """Topic 'be' already has lesson 'Mock 1'; any other title is created."""

    async def create_item(self, topic_slug, section, title, description="", content=""):
        if normalize_title(title) == "mock 1":
            raise DuplicateEntityError("item", "Mock 1", {"id": "i1", "title": "Mock 1"})
        return {"id": "i2", "title": title, "section": section, "roadmapSlug": topic_slug}


def _create_lessons(*titles: str) -> StructuredRoadmapAction:
    return StructuredRoadmapAction(
        action=ActionType.CREATE,
        entity_level=EntityLevel.ITEM,
        target_parent_identifier="be",
        entities=[SingleEntity(title=t) for t in titles],
    )


def test_executor_skips_existing_lesson(monkeypatch):
    async def no_sync():
        return None

    monkeypatch.setattr("rag_service.execution.executor.rag_engine.sync_live_database", no_sync)
    ok, msg = asyncio.run(ActionExecutor(_DupItemAdapter()).aexecute(_create_lessons("mock 1"), session_id="dup-test"))

    assert ok and "không tạo thêm" in msg and "Đã thêm" not in msg


def test_executor_creates_new_and_reports_skipped(monkeypatch):
    async def no_sync():
        return None

    monkeypatch.setattr("rag_service.execution.executor.rag_engine.sync_live_database", no_sync)
    ok, msg = asyncio.run(
        ActionExecutor(_DupItemAdapter()).aexecute(_create_lessons("Mock 1", "Mock 2"), session_id="dup-test-2")
    )

    assert ok
    assert "Đã thêm thành công 1 bài học" in msg and "Mock 2" in msg
    assert "Đã có sẵn bài học **Mock 1**" in msg


class _GreetingAdapter:
    def __init__(self, topics):
        self._topics = topics

    async def list_topics(self):
        return self._topics

    async def get_topic(self, slug):
        return next((t for t in self._topics if t["slug"] == slug), None)


def test_greeting_examples_name_real_topic_and_section(monkeypatch):
    from rag_service.agent import NextGenRoadmapAgent

    adapter = _GreetingAdapter([{"slug": "ai-architecture", "sections": ["Database"]}])
    monkeypatch.setattr("rag_service.domains.roadmap.agent_actions.get_adapter", lambda: adapter)
    reply = asyncio.run(NextGenRoadmapAgent._greeting_reply(None))
    assert "vào topic ai-architecture mục Database" in reply


def test_greeting_examples_fall_back_to_placeholders_without_data(monkeypatch):
    from rag_service.agent import NextGenRoadmapAgent

    monkeypatch.setattr("rag_service.domains.roadmap.agent_actions.get_adapter", lambda: _GreetingAdapter([]))
    reply = asyncio.run(NextGenRoadmapAgent._greeting_reply(None))
    assert "vào topic <slug topic> mục <tên mục>" in reply
    # No invented names like "be", "fe" or "aaa"
    assert " be`" not in reply and " fe`" not in reply and "aaa" not in reply


@pytest.mark.usefixtures("write_grant")
def test_lessons_land_in_the_named_section_or_none(adapter):
    """A section is known by its name whatever its case or spacing; with no name, the lesson has none (ADR-0009)."""

    async def run():
        topic = await adapter.create_topic("Sections")
        await adapter.create_item(topic["slug"], "Fundamentals", "A")
        await adapter.create_item(topic["slug"], " fundamentals ", "B")
        await adapter.create_item(topic["slug"], "", "C")
        await adapter.create_item(topic["slug"], "Deep Dive", "D")
        items = (await adapter.get_topic(topic["slug"]))["items"]
        return {i["title"]: i["section"] for i in items}

    assert asyncio.run(run()) == {"A": "Fundamentals", "B": "Fundamentals", "C": None, "D": "Deep Dive"}
