"""Outcome verification for roadmap changes: after /chat/confirm, the database holds what the reply claims.

Other tests check the reply or the change review (the transcript). These read the rows back, so a confirm that
reports success without writing, or writes without reporting it, fails here.
"""

from __future__ import annotations

import sqlite3

import httpx
import pytest

import rag_service.tools as tools
from rag_service.adapters.sqlite_adapter import SqliteAdapter
from rag_service.api.server import app
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
from rag_service.state.session_store import session_store
from tests.test_duplicates import SCHEMA


@pytest.fixture
def db(tmp_path, monkeypatch):
    async def no_sync():
        return None

    monkeypatch.setattr("rag_service.execution.executor.rag_engine.sync_live_database", no_sync)
    path = tmp_path / "outcome.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)
    previous = tools._adapter
    tools.init_adapter(SqliteAdapter(str(path)))
    yield path
    tools._adapter = previous


def _rows(db, sql: str, *params) -> list[tuple]:
    with sqlite3.connect(db) as conn:
        return conn.execute(sql, params).fetchall()


def _action(act: ActionType, level: EntityLevel, parent: str | None, *titles: str) -> StructuredRoadmapAction:
    return StructuredRoadmapAction(
        action=act, entity_level=level, target_parent_identifier=parent, entities=[SingleEntity(title=t) for t in titles]
    )


async def _confirm(headers: dict, thread_id: str, action: StructuredRoadmapAction) -> dict:
    session_store.set_pending_confirmation(thread_id, action)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=headers) as client:
        return (await client.post("/chat/confirm", json={"thread_id": thread_id})).json()


@pytest.mark.asyncio
async def test_confirmed_create_writes_the_rows_it_reports(db, owner_headers):
    topic = await _confirm(owner_headers, "outcome-topic", _action(ActionType.CREATE, EntityLevel.TOPIC, None, "Frontend"))
    assert topic["success"] is True
    [(slug,)] = _rows(db, "SELECT slug FROM Roadmap WHERE title = ?", "Frontend")

    item = await _confirm(owner_headers, "outcome-item", _action(ActionType.CREATE, EntityLevel.ITEM, slug, "React Hooks"))
    assert item["success"] is True
    assert _rows(db, "SELECT i.title FROM RoadmapItem i JOIN Roadmap r ON r.id = i.roadmapId WHERE r.slug = ?", slug) == [
        ("React Hooks",)
    ]
    # Every row the change review names exists in the database
    reported = {e["title"] for e in item["changes"]["entries"]}
    assert reported == {t for (t,) in _rows(db, "SELECT title FROM RoadmapItem")}


@pytest.mark.asyncio
async def test_confirmed_delete_removes_the_rows_it_reports(db, owner_headers):
    await _confirm(owner_headers, "outcome-setup", _action(ActionType.CREATE, EntityLevel.TOPIC, None, "Backend"))
    [(slug,)] = _rows(db, "SELECT slug FROM Roadmap WHERE title = ?", "Backend")

    result = await _confirm(owner_headers, "outcome-delete", _action(ActionType.DELETE, EntityLevel.TOPIC, slug, slug))
    assert result["success"] is True
    assert _rows(db, "SELECT id FROM Roadmap WHERE slug = ?", slug) == []


@pytest.mark.asyncio
async def test_failed_confirm_leaves_the_database_unchanged(db, owner_headers):
    before = _rows(db, "SELECT count(*) FROM RoadmapItem")
    result = await _confirm(
        owner_headers, "outcome-missing", _action(ActionType.CREATE, EntityLevel.ITEM, "no-such-topic", "Orphan Lesson")
    )
    assert result["success"] is False
    assert _rows(db, "SELECT count(*) FROM RoadmapItem") == before


@pytest.mark.asyncio
async def test_chat_stream_preview_and_confirm_writes_lesson_to_database(db, owner_headers, catalog_topics):
    topic = await _confirm(owner_headers, "outcome-e2e-topic", _action(ActionType.CREATE, EntityLevel.TOPIC, None, "Frontend"))
    assert topic["success"] is True
    catalog_topics("frontend")

    thread_id = "outcome-e2e-lesson"
    session_store.clear(thread_id)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        stream_res = await client.post(
            "/chat/stream",
            json={"message": "thêm bài React Hooks vào topic Frontend", "thread_id": thread_id},
        )
        assert stream_res.status_code == 200
        pending = session_store.get_or_create(thread_id).pending_confirmation
        assert pending is not None
        assert pending.action == ActionType.CREATE
        assert pending.entity_level == EntityLevel.ITEM
        assert pending.target_parent_identifier == "frontend"
        assert [e.title for e in pending.entities] == ["React Hooks"]
        assert _rows(db, "SELECT title FROM RoadmapItem") == []

        confirm_res = (await client.post("/chat/confirm", json={"thread_id": thread_id})).json()
    assert confirm_res["success"] is True
    assert _rows(
        db, "SELECT i.title FROM RoadmapItem i JOIN Roadmap r ON r.id = i.roadmapId WHERE r.slug = ?", "frontend"
    ) == [("React Hooks",)]
