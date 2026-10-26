"""Change review: the rows an executed action wrote, sent to the UI only when something changed."""

from __future__ import annotations

import asyncio
import json
import sqlite3

import httpx

from tests.conftest import stream_confirmed
import pytest

from rag_service.adapters.sqlite_adapter import SqliteAdapter
from rag_service.api.server import app
from rag_service.auth import set_actor
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
from rag_service.execution.changes import MAX_CHILDREN, ChangeSet
from rag_service.execution.executor import ActionExecutor
from tests.test_duplicates import SCHEMA


@pytest.fixture
def adapter(tmp_path, monkeypatch):
    async def no_sync():
        return None

    monkeypatch.setattr("rag_service.execution.executor.rag_engine.sync_live_database", no_sync)
    db = tmp_path / "test.db"
    with sqlite3.connect(db) as conn:
        conn.executescript(SCHEMA)
    set_actor("owner")
    return SqliteAdapter(str(db))


def _action(act: ActionType, level: EntityLevel, parent: str | None, *titles: str) -> StructuredRoadmapAction:
    return StructuredRoadmapAction(
        action=act,
        entity_level=level,
        target_parent_identifier=parent,
        entities=[SingleEntity(title=t) for t in titles],
    )


def _run(adapter, action, session_id="change-review"):
    changes = ChangeSet.of(action)
    ok, _ = asyncio.run(ActionExecutor(adapter).aexecute(action, session_id=session_id, changes=changes))
    return ok, changes


@pytest.mark.usefixtures("write_grant")
def test_create_records_each_new_row_and_skips_existing(adapter):
    asyncio.run(adapter.create_topic("Backend", "BE"))
    ok, changes = _run(adapter, _action(ActionType.CREATE, EntityLevel.TOPIC, None, "Backend", "Frontend"))

    data = changes.to_dict()
    assert ok and changes
    assert data["added"] == 1 and data["removed"] == 0
    assert [(e["op"], e["level"], e["title"]) for e in data["entries"]] == [("create", "topic", "Frontend")]
    assert data["entries"][0]["id"]
    assert data["skipped"] == ["Backend"]


@pytest.mark.usefixtures("write_grant")
def test_create_with_every_entity_existing_changes_nothing(adapter):
    asyncio.run(adapter.create_topic("Backend", "BE"))
    ok, changes = _run(adapter, _action(ActionType.CREATE, EntityLevel.TOPIC, None, "backend"))

    assert ok and not changes


@pytest.mark.usefixtures("write_grant")
def test_delete_topic_lists_the_rows_removed_with_it(adapter):
    topic = asyncio.run(adapter.create_topic("Backend", "BE"))
    layer = asyncio.run(adapter.create_layer(topic["slug"], "Docker", "01-DOC"))
    asyncio.run(adapter.create_item(layer["id"], "core", "Docker Basics"))

    ok, changes = _run(adapter, _action(ActionType.DELETE, EntityLevel.TOPIC, topic["slug"], topic["slug"]))

    data = changes.to_dict()
    assert ok
    [entry] = data["entries"]
    assert entry["op"] == "delete" and entry["title"] == "Backend"
    assert [c["level"] for c in entry["children"]] == ["layer", "group", "item"]
    assert entry["children"][-1]["title"] == "Docker Basics"
    assert data["removed"] == 4


@pytest.mark.usefixtures("write_grant")
def test_delete_layer_snapshots_it_by_id(adapter):
    topic = asyncio.run(adapter.create_topic("Backend", "BE"))
    layer = asyncio.run(adapter.create_layer(topic["slug"], "Docker", "01-DOC"))

    ok, changes = _run(adapter, _action(ActionType.DELETE, EntityLevel.LAYER, layer["id"], "Docker"))

    [entry] = changes.to_dict()["entries"]
    assert ok and entry["title"] == "Docker" and entry["id"] == layer["id"]


def test_delete_that_finds_nothing_changes_nothing(adapter):
    ok, changes = _run(adapter, _action(ActionType.DELETE, EntityLevel.TOPIC, "missing", "missing"))

    assert not ok and not changes


def test_children_are_cut_at_the_limit():
    changes = ChangeSet("delete", "group")
    changes.deleted("g1", {"id": "g1", "title": "Core", "items": [{"title": f"i{n}"} for n in range(MAX_CHILDREN + 5)]})

    data = changes.to_dict()
    assert len(data["entries"][0]["children"]) == MAX_CHILDREN
    assert data["truncated"] is True
    # The count still covers every row removed
    assert data["removed"] == MAX_CHILDREN + 6


@pytest.mark.asyncio
async def test_stream_sends_change_review_and_repeats_it_on_done(mock_adapter, owner_headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        body = await stream_confirmed(client, "tạo cho tôi 3 topic A, B và C", "change-review-stream")
    assert "event: change_review" in body
    # The card arrives right after the tool finishes, before the reply text
    assert body.index("event: tool_end") < body.index("event: change_review") < body.index("event: token")

    done = json.loads(body.split("event: done\ndata: ")[1].split("\n")[0])
    [change] = done["changes"]
    assert change["action"] == "create" and change["level"] == "topic" and change["added"] == 3


@pytest.mark.asyncio
async def test_read_only_turn_sends_no_change_review(mock_adapter, owner_headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        resp = await client.post("/chat/stream", json={"message": "/plan tạo lộ trình AI", "thread_id": "change-review-ro"})
    body = resp.text
    assert "event: change_review" not in body
    assert '"changes"' not in body


@pytest.mark.asyncio
async def test_confirm_returns_the_changes(mock_adapter, owner_headers):
    from rag_service.state.session_store import session_store

    thread_id = "change-review-confirm"
    session_store.set_pending_confirmation(
        thread_id, _action(ActionType.DELETE, EntityLevel.TOPIC, "test-topic", "test-topic")
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        data = (await client.post("/chat/confirm", json={"thread_id": thread_id})).json()

    assert data["success"] is True
    [entry] = data["changes"]["entries"]
    assert entry["op"] == "delete" and entry["title"] == "Test Topic"
    assert [c["title"] for c in entry["children"]] == ["New Layer"]


# ── Writes outside the executor: bulk import and template generation ────────


@pytest.mark.asyncio
async def test_import_records_new_items_and_skips_existing(mock_adapter):
    from rag_service.adapters.errors import DuplicateEntityError
    from rag_service.tools.item_tools import import_items_from_text

    async def create_item(layer_id, level, title, description="", content=""):
        if title == "Docker":
            raise DuplicateEntityError("item", "Docker", {"id": "i0"})
        return {"id": f"id-{title}", "title": title}

    mock_adapter.create_item.side_effect = create_item
    changes = ChangeSet("create", "item", "layer-id")
    await import_items_from_text.coroutine(
        layer_id="layer-id", level="core", text="- Docker\n- Kubernetes\n- Helm", changes=changes
    )

    data = changes.to_dict()
    assert [(e["level"], e["title"], e["id"]) for e in data["entries"]] == [
        ("item", "Kubernetes", "id-Kubernetes"),
        ("item", "Helm", "id-Helm"),
    ]
    assert data["added"] == 2 and data["skipped"] == ["Docker"]


@pytest.mark.asyncio
async def test_template_records_topic_layers_and_items(mock_adapter):
    from rag_service.tools.rag_tools import generate_roadmap_from_template

    mock_adapter.create_topic.return_value = {"id": "t1", "slug": "ai-test", "title": "AI Test"}
    mock_adapter.get_topic.return_value = {
        "slug": "ai-test",
        "layers": [
            {"id": "layer-1", "shortTag": "01-LLM", "title": "LLM"},
            {"id": "layer-2", "shortTag": "02-RAG", "title": "RAG"},
        ],
    }
    changes = ChangeSet("create", "topic")
    await generate_roadmap_from_template.coroutine(template_id="ai-engineering", custom_title="AI Test", changes=changes)

    data = changes.to_dict()
    levels = [e["level"] for e in data["entries"]]
    assert data["entries"][0]["level"] == "topic"
    assert data["entries"][0]["title"] == "AI Test" and data["entries"][0]["id"] == "t1"
    assert levels.count("layer") == 2
    assert levels.count("item") == mock_adapter.create_item.call_count >= 3
    assert data["added"] == len(levels)


def test_hidden_changes_param_is_not_offered_to_the_llm():
    from rag_service.tools.item_tools import create_items_batch, import_items_from_text
    from rag_service.tools.rag_tools import generate_roadmap_from_template

    for t in (create_items_batch, import_items_from_text, generate_roadmap_from_template):
        assert "changes" not in t.args


@pytest.mark.asyncio
async def test_goal_stream_sends_change_review(mock_adapter, owner_headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        resp = await client.post(
            "/chat/stream", json={"message": "/goal template ai-engineering", "thread_id": "change-review-goal"}
        )
    body = resp.text
    assert "event: change_review" in body
    done = json.loads(body.split("event: done\ndata: ")[1].split("\n")[0])
    [change] = done["changes"]
    assert change["entries"][0]["level"] == "topic"
