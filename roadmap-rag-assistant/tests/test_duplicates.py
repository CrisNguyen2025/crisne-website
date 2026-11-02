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
CREATE TABLE Roadmap (id TEXT PRIMARY KEY, slug TEXT UNIQUE, title TEXT, shortCode TEXT, description TEXT,
  icon TEXT, "order" INT, isLocked INT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE RoadmapLayer (id TEXT PRIMARY KEY, roadmapId TEXT, "order" INT, shortTag TEXT, title TEXT,
  subtitle TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE RoadmapGroup (id TEXT PRIMARY KEY, layerId TEXT, title TEXT, "order" INT,
  createdAt TEXT, updatedAt TEXT);
CREATE TABLE RoadmapItem (id TEXT PRIMARY KEY, groupId TEXT, title TEXT, description TEXT, content TEXT,
  "order" INT, createdAt TEXT, updatedAt TEXT);
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
        topic = await adapter.create_topic("Backend", "BE")
        with pytest.raises(DuplicateEntityError) as exc:
            await adapter.create_topic("backend", "BE")
        assert exc.value.kind == "topic" and exc.value.existing["slug"] == topic["slug"]

        layer = await adapter.create_layer(topic["slug"], "Mock 1", "02-MOC")
        with pytest.raises(DuplicateEntityError) as exc:
            await adapter.create_layer(topic["slug"], "MOCK  1", "03-MOC")
        assert exc.value.existing["id"] == layer["id"]

        # create_layer adds no group: the first item names one (ADR-0008)
        new_layer = next(l for l in (await adapter.get_topic(topic["slug"]))["layers"] if l["id"] == layer["id"])
        assert new_layer["groups"] == []

        await adapter.create_item(layer["id"], "Core", "Docker Basics")
        # A group is known by its title: the same title again is a duplicate
        with pytest.raises(DuplicateEntityError):
            await adapter.create_group(layer["id"], " core ")
        with pytest.raises(DuplicateEntityError):
            await adapter.create_item(layer["id"], "Core", "docker basics")

    asyncio.run(run())


class _DupLayerAdapter:
    """Topic 'be' already has layer 'Mock 1'; any other title is created."""

    async def get_topic(self, slug):
        return {"slug": slug, "layers": [{"id": "l1", "title": "Mock 1"}]}

    async def create_layer(self, topic_slug, title, short_tag, subtitle=""):
        if normalize_title(title) == "mock 1":
            raise DuplicateEntityError("layer", "Mock 1", {"id": "l1", "title": "Mock 1"})
        return {"id": "l2", "title": title, "shortTag": short_tag}


def test_executor_skips_existing_layer_and_reuses_it(monkeypatch):
    async def no_sync():
        return None

    monkeypatch.setattr("rag_service.execution.executor.rag_engine.sync_live_database", no_sync)
    action = StructuredRoadmapAction(
        action=ActionType.CREATE,
        entity_level=EntityLevel.LAYER,
        target_parent_identifier="be",
        entities=[SingleEntity(title="mock 1")],
    )
    ok, msg = asyncio.run(ActionExecutor(_DupLayerAdapter()).aexecute(action, session_id="dup-test"))

    assert ok and "không tạo thêm" in msg and "Đã tạo" not in msg
    # A follow-up "add items" lands in the existing layer
    assert session_store.get_or_create("dup-test").active_layer_id == "l1"


def test_executor_creates_new_and_reports_skipped(monkeypatch):
    async def no_sync():
        return None

    monkeypatch.setattr("rag_service.execution.executor.rag_engine.sync_live_database", no_sync)
    action = StructuredRoadmapAction(
        action=ActionType.CREATE,
        entity_level=EntityLevel.LAYER,
        target_parent_identifier="be",
        entities=[SingleEntity(title="Mock 1"), SingleEntity(title="Mock 2")],
    )
    ok, msg = asyncio.run(ActionExecutor(_DupLayerAdapter()).aexecute(action, session_id="dup-test-2"))

    assert ok
    assert "Đã tạo 1 layer" in msg and "Mock 2" in msg
    assert "Đã có sẵn layer **Mock 1**" in msg
    # The new layer takes the next number, not one past the skipped title
    assert "`02-" in msg


class _GreetingAdapter:
    def __init__(self, topics):
        self._topics = topics

    async def list_topics(self):
        return self._topics

    async def get_topic(self, slug):
        return next((t for t in self._topics if t["slug"] == slug), None)


def test_greeting_examples_name_real_topic_and_layer(monkeypatch):
    from rag_service.agent import NextGenRoadmapAgent

    adapter = _GreetingAdapter([{"slug": "ai-architecture", "layers": [{"title": "Database"}]}])
    monkeypatch.setattr("rag_service.domains.roadmap.agent_actions.get_adapter", lambda: adapter)
    reply = asyncio.run(NextGenRoadmapAgent._greeting_reply(None))
    assert "trong topic ai-architecture" in reply and "vào layer Database" in reply


def test_greeting_examples_fall_back_to_placeholders_without_data(monkeypatch):
    from rag_service.agent import NextGenRoadmapAgent

    monkeypatch.setattr("rag_service.domains.roadmap.agent_actions.get_adapter", lambda: _GreetingAdapter([]))
    reply = asyncio.run(NextGenRoadmapAgent._greeting_reply(None))
    assert "trong topic <slug topic>" in reply and "vào layer <tên layer>" in reply
    # No invented names like "be", "fe" or "aaa"
    assert " be`" not in reply and " fe`" not in reply and "aaa" not in reply


@pytest.mark.usefixtures("write_grant")
def test_lessons_land_in_the_named_group_or_the_only_one(adapter):
    """A title names one group whatever its case; with no title, the layer's only group is used (ADR-0008)."""
    from rag_service.adapters.groups import GroupChoiceRequired

    async def run():
        topic = await adapter.create_topic("Groups", "GR")
        layer = await adapter.create_layer(topic["slug"], "Groups", "02-GRP")
        with pytest.raises(GroupChoiceRequired) as ask:
            await adapter.create_item(layer["id"], "", "A")  # no group yet: asked, nothing written
        assert ask.value.titles == []
        await adapter.create_item(layer["id"], "Fundamentals", "A")
        await adapter.create_item(layer["id"], " fundamentals ", "B")
        await adapter.create_item(layer["id"], "", "C")  # the only group
        await adapter.create_item(layer["id"], "Deep Dive", "D")
        with pytest.raises(GroupChoiceRequired) as ask:
            await adapter.create_item(layer["id"], "", "E")  # two groups now: asked
        assert ask.value.titles == ["Fundamentals", "Deep Dive"]
        groups = next(l for l in (await adapter.get_topic(topic["slug"]))["layers"] if l["id"] == layer["id"])["groups"]
        return {g["title"]: len(g["items"]) for g in groups}

    assert asyncio.run(run()) == {"Fundamentals": 3, "Deep Dive": 1}