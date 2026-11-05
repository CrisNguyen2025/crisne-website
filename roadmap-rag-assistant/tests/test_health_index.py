"""Test the index status block in GET /health."""

from __future__ import annotations

import httpx
import pytest

from rag_service.api.server import app
from rag_service.domains.roadmap.retrieval import engine as engine_module
from rag_service.domains.roadmap.retrieval.engine import MiniRagEngine
from rag_service.domains.roadmap.retrieval.ingestion import KnowledgeDocument


DOC = KnowledgeDocument(
    id="doc-1",
    doc_type="item",
    title="Docker Containerization",
    topic_slug="ops",
    topic_title="DevOps",
    searchable_text="Docker Containerization DevOps",
)


class _MockSource:
    def __init__(self, docs=None, fail_with=None):
        self.docs = docs if docs is not None else []
        self.fail_with = fail_with

    async def ingest_all(self):
        if self.fail_with:
            raise self.fail_with
        return list(self.docs)


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.asyncio
async def test_health_endpoint_includes_index_status(monkeypatch):
    engine = MiniRagEngine()
    engine._vector_store._get_embedder = lambda: None
    source = _MockSource([DOC])
    engine._ingestion_worker = source
    monkeypatch.setattr(engine_module, "rag_engine", engine)

    # 1. Before sync: not synced, not current, no age, 0 documents, no error
    async with _client() as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "ok"
    assert "index" in data
    idx = data["index"]
    assert idx["synced"] is False
    assert idx["current"] is False
    assert idx["documents"] == 0
    assert idx["age_seconds"] is None
    assert idx["last_error"] is None
    assert idx["vectors_pending"] == 0

    # 2. After sync: synced=True, current=True, documents=1, age_seconds is float >= 0, last_error=None
    await engine.sync_live_database()
    async with _client() as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    idx = resp.json()["index"]
    assert idx["synced"] is True
    assert idx["current"] is True
    assert idx["documents"] == 1
    assert isinstance(idx["age_seconds"], (int, float))
    assert idx["age_seconds"] >= 0
    assert idx["last_error"] is None
    assert idx["vectors_pending"] == 0

    # 3. Source fails: previous index kept, last_error holds exception type name (safe, no URLs/secrets)
    source.fail_with = httpx.ConnectError("https://user:secret@internal-db.local unreachable")
    engine.request_reindex()
    await engine._sync_task

    async with _client() as client:
        resp = await client.get("/health")
    idx = resp.json()["index"]
    assert idx["synced"] is True  # previous index kept
    assert idx["current"] is False  # not current because change was requested
    assert idx["documents"] == 1
    assert idx["last_error"] == "ConnectError"
    assert idx["vectors_pending"] == 0
    # Never leaks secrets or internal URLs
    assert "secret" not in (idx["last_error"] or "")
    assert "http" not in (idx["last_error"] or "")


@pytest.mark.asyncio
async def test_health_index_clears_error_on_next_successful_sync(monkeypatch):
    engine = MiniRagEngine()
    engine._vector_store._get_embedder = lambda: None
    source = _MockSource(fail_with=httpx.ConnectError("network fail"))
    engine._ingestion_worker = source
    monkeypatch.setattr(engine_module, "rag_engine", engine)

    await engine.sync_live_database()
    assert engine.index_status()["last_error"] == "ConnectError"

    # Recover
    source.fail_with = None
    source.docs = [DOC]
    await engine.sync_live_database()
    assert engine.index_status()["last_error"] is None
    assert engine.index_status()["synced"] is True
    assert engine.index_status()["documents"] == 1
