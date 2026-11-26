"""End-to-end tests for Tier 2 concept promotion, SQLite status/relations, reindex symmetry, and actor isolation."""

from __future__ import annotations

import asyncio
import sqlite3
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from rag_service.adapters.sqlite_adapter import SqliteAdapter
from rag_service.auth import OWNER_ONLY_MESSAGE, current_actor, set_actor
from rag_service.config import settings
from rag_service.domains.roadmap import linking_advisor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.execution import executor as executor_mod
from rag_service.state import session_store
from rag_service.tools.item_tools import (
    create_item,
    create_items_batch,
    delete_item,
    import_items_from_text,
    rename_section,
    update_item,
    update_item_content,
)
from rag_service.write_grant import WriteNotGranted, write_granted

SCHEMA_PATH = Path(__file__).resolve().parent / "fixtures" / "schema.sql"


def _seed_sqlite_db(tmp_path: Path) -> SqliteAdapter:
    db_path = tmp_path / "concept_test.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.commit()
    conn.close()
    return SqliteAdapter(str(db_path))


@pytest.mark.asyncio
async def test_sqlite_create_item_status_and_create_relation_enforce_owner_and_grant(tmp_path: Path):
    adapter = _seed_sqlite_db(tmp_path)

    with write_granted("seed topic"):
        tok = current_actor.set("owner")
        try:
            await adapter.create_topic("AI Architecture")
            known_lesson = await adapter.create_item("ai-architecture", "RAG", "Hybrid Search")
            target_lesson = await adapter.create_item(
                "ai-architecture",
                "RAG",
                "GraphRAG",
                description="Graph-backed retrieval",
                content="<h2>Tổng quan</h2><p>GraphRAG</p>",
                status="target",
            )
        finally:
            current_actor.reset(tok)

    assert known_lesson["status"] == "known"
    assert target_lesson["status"] == "target"

    # Visitor & missing write grant must be refused before any DB mutation
    tok_visitor = current_actor.set("visitor")
    try:
        with pytest.raises(PermissionError):
            await adapter.create_relation(target_lesson["id"], known_lesson["id"])
    finally:
        current_actor.reset(tok_visitor)

    tok_owner = current_actor.set("owner")
    try:
        with pytest.raises(WriteNotGranted):
            await adapter.create_relation(target_lesson["id"], known_lesson["id"])

        with write_granted("create relation"):
            rel1 = await adapter.create_relation(target_lesson["id"], known_lesson["id"])
            rel2 = await adapter.create_relation(known_lesson["id"], target_lesson["id"])
        assert rel1["created"] is True and rel2["created"] is True
    finally:
        current_actor.reset(tok_owner)

    conn = sqlite3.connect(str(tmp_path / "concept_test.db"))
    rows = conn.execute('SELECT "fromLessonId", "toLessonId" FROM "KnowledgeRelation"').fetchall()
    conn.close()
    assert len(rows) == 1
    assert rows[0] == tuple(sorted((known_lesson["id"], target_lesson["id"])))


@pytest.mark.asyncio
async def test_local_rag_sync_symmetry_sqlite_vs_http_across_item_tools(mock_adapter, monkeypatch):
    mock_adapter.list_topics.return_value = [{"id": "t-ai", "slug": "ai-architecture", "title": "AI Architecture"}]
    mock_adapter.get_topic.return_value = {
        "id": "t-ai",
        "slug": "ai-architecture",
        "title": "AI Architecture",
        "items": [{"id": "i-1", "title": "RAG", "section": "Core", "content": ""}],
        "sections": ["Core"],
    }
    mock_adapter.create_item.side_effect = lambda slug, section, title, *a, **kw: {
        "id": f"id-{title}",
        "slug": title.lower().replace(" ", "-"),
        "title": title,
        "section": section or None,
    }
    mock_adapter.update_item.return_value = {"id": "i-1", "title": "RAG Renamed", "section": "Core"}
    mock_adapter.update_section.return_value = {"section": "Retrieval", "renamed": 1}
    mock_adapter.update_item_content.return_value = {"id": "i-1"}
    mock_adapter.delete_item.return_value = True

    sync_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(executor_mod.rag_engine, "sync_live_database", sync_mock)

    tok = current_actor.set("owner")
    try:
        monkeypatch.setattr(settings, "rag_adapter_mode", "http")
        with write_granted("http mode skips local rag sync"):
            await create_item.coroutine(topic="ai-architecture", title="Concept A")
            await update_item_content.coroutine(topic="ai-architecture", item_id="i-1", html="<h2>A</h2><p>B</p>")
        await asyncio.sleep(0)
        assert sync_mock.await_count == 0

        monkeypatch.setattr(settings, "rag_adapter_mode", "sqlite")
        with write_granted("sqlite mode syncs all local writes"):
            await create_item.coroutine(topic="ai-architecture", title="Concept B", status="target")
            await create_items_batch.coroutine(topic="ai-architecture", items=[{"title": "Concept C"}])
            await import_items_from_text.coroutine(topic="ai-architecture", text="- Concept D\n- Concept E")
            await rename_section.coroutine(topic="ai-architecture", from_name="Core", to_name="Retrieval")
            await update_item_content.coroutine(topic="ai-architecture", item_id="i-1", html="<h2>A</h2><p>B</p>")
            await update_item.coroutine(item_id="i-1", title="RAG Renamed")
            await delete_item.coroutine(item_id="i-1")
        await asyncio.sleep(0)
        assert sync_mock.await_count == 7
    finally:
        current_actor.reset(tok)


@pytest.mark.asyncio
async def test_concept_promotion_creates_related_lessons_and_blocks_visitor(mock_adapter, monkeypatch):
    mock_adapter.get_topic.return_value = {
        "id": "t-ai",
        "slug": "ai-architecture",
        "title": "AI Architecture",
        "items": [{"id": "existing-1", "title": "Hybrid Search", "section": "RAG", "content": "<p>HS</p>"}],
        "sections": ["RAG"],
    }
    mock_adapter.create_item.return_value = {
        "id": "new-graphrag",
        "slug": "graphrag",
        "title": "GraphRAG",
        "section": "RAG",
        "status": "target",
    }
    mock_adapter.create_relation.return_value = {"fromLessonId": "existing-1", "toLessonId": "new-graphrag"}

    class FakeSyncEngine:
        _is_synced = True

        async def search_live_knowledge(self, query: str, limit: int = 5):
            return [
                (
                    type(
                        "Doc",
                        (),
                        {
                            "id": "existing-1",
                            "doc_type": "item",
                            "title": "Hybrid Search",
                            "item_slug": "hybrid-search",
                            "topic_slug": "ai-architecture",
                            "topic_title": "AI Architecture",
                            "section": "RAG",
                        },
                    )(),
                    0.55,
                )
            ]

    monkeypatch.setattr(linking_advisor, "rag_engine", FakeSyncEngine())
    agent = NextGenRoadmapAgent(llm_model=None)

    set_actor("visitor")
    vis_tid = f"visitor:{uuid.uuid4()}"
    vis_events = [
        ev
        async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": "lưu khái niệm GraphRAG thành bài học"}], "fast": True},
            config={"configurable": {"thread_id": vis_tid}},
        )
    ]
    vis_text = "".join(ev.get("delta", "") for ev in vis_events if ev.get("type") == "token")
    assert OWNER_ONLY_MESSAGE in vis_text
    assert not any(ev.get("type") == "action_preview" for ev in vis_events)
    assert session_store.get_or_create(vis_tid).pending_concept_promotion is None
    mock_adapter.create_item.assert_not_awaited()

    set_actor("owner")
    own_tid = f"owner:{uuid.uuid4()}"
    prev_events = [
        ev
        async for ev in agent.astream_events(
            {
                "messages": [{"role": "user", "content": "lưu khái niệm GraphRAG thành bài học: Kết hợp Knowledge Graph với RAG."}],
                "fast": True,
                "context": {"roadmapSlug": "ai-architecture"},
            },
            config={"configurable": {"thread_id": own_tid}},
        )
    ]
    assert any(ev.get("type") == "action_preview" for ev in prev_events)
    assert not any(ev.get("type") == "tool_start" and ev.get("name") == "promote_concept_to_lesson" for ev in prev_events)
    mock_adapter.create_item.assert_not_awaited()

    conf_events = [
        ev
        async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": "ok"}], "fast": True},
            config={"configurable": {"thread_id": own_tid}},
        )
    ]
    tool_starts = [ev.get("name") for ev in conf_events if ev.get("type") == "tool_start"]
    tool_ends = [ev.get("name") for ev in conf_events if ev.get("type") == "tool_end"]
    assert "promote_concept_to_lesson" in tool_starts
    assert "promote_concept_to_lesson" in tool_ends
    mock_adapter.create_item.assert_awaited_once()
    assert mock_adapter.create_item.await_args.kwargs["status"] == "target"
    mock_adapter.create_relation.assert_awaited_once_with("new-graphrag", "existing-1")
