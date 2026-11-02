"""The index follows the roadmap: reported changes, deletions down to nothing, and a source that cannot be read."""

from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from rag_service.adapters.http_adapter import HttpApiAdapter
from rag_service.api.server import app
from rag_service.domains.roadmap.retrieval import engine as engine_module
from rag_service.domains.roadmap.retrieval.engine import INDEX_TTL_SECONDS, MiniRagEngine
from rag_service.domains.roadmap.retrieval.ingestion import DatabaseIngestionWorker, KnowledgeDocument

DOCKER = KnowledgeDocument(
    id="d", doc_type="item", title="Docker Basics", topic_slug="ops", topic_title="ops",
    searchable_text="Bài học Mục Item: Docker Basics",
)


class _Source:
    """Stands in for full-export: returns `docs`, or raises while `down` is set."""

    def __init__(self, docs):
        self.docs = docs
        self.down = False
        self.reads = 0

    async def ingest_all(self):
        self.reads += 1
        if self.down:
            raise httpx.ConnectError("Next.js unreachable")
        return list(self.docs)


def _engine(source: _Source) -> MiniRagEngine:
    engine = MiniRagEngine()
    engine._ingestion_worker = source
    engine._vector_store._get_embedder = lambda: None
    return engine


async def _titles(engine: MiniRagEngine, query: str = "docker") -> list[str]:
    return [d.title for d, _ in await engine.search_live_knowledge(query)]


@pytest.mark.asyncio
async def test_deleting_everything_empties_the_index():
    source = _Source([DOCKER])
    engine = _engine(source)
    assert await _titles(engine) == ["Docker Basics"]

    source.docs = []  # every roadmap deleted on the site
    engine.request_reindex()
    assert await _titles(engine) == []
    assert engine.known_topic_slugs() == set()
    assert engine.known_item_ids() == set()


@pytest.mark.asyncio
async def test_a_reported_change_is_visible_on_the_next_turn_before_the_ttl():
    source = _Source([])
    engine = _engine(source)
    assert await _titles(engine) == []

    source.docs = [DOCKER]
    engine.request_reindex()  # what POST /internal/reindex does
    assert await _titles(engine) == ["Docker Basics"]  # no TTL wait, no stale answer


@pytest.mark.asyncio
async def test_catalog_refreshes_too_not_only_search():
    """The router grounds writes on catalog(): it must not keep naming deleted lessons."""
    source = _Source([DOCKER])
    engine = _engine(source)
    await engine.catalog()
    assert engine.known_item_ids() == {"d"}

    source.docs = []
    engine._synced_at = time.monotonic() - INDEX_TTL_SECONDS - 1  # edited outside the API: only the TTL sees it
    await engine.catalog()
    await engine._sync_task
    assert engine.known_item_ids() == set()


@pytest.mark.asyncio
async def test_a_source_that_cannot_be_read_keeps_the_previous_index():
    source = _Source([DOCKER])
    engine = _engine(source)
    assert await _titles(engine) == ["Docker Basics"]

    source.down = True
    engine.request_reindex()
    await engine._sync_task
    assert await _titles(engine) == ["Docker Basics"]  # not wiped: the lessons still exist
    assert not engine.is_current()  # and the next turn tries again

    source.down = False
    source.docs = []
    assert await _titles(engine) == []
    assert engine.is_current()


@pytest.mark.asyncio
async def test_a_change_reported_during_a_sync_is_not_lost(monkeypatch):
    source = _Source([])
    engine = _engine(source)
    await engine.ensure_fresh()
    reads_before = source.reads

    started = asyncio.Event()
    release = asyncio.Event()
    real_ingest = source.ingest_all

    async def slow_ingest():
        docs = await real_ingest()
        started.set()
        await release.wait()
        return docs

    monkeypatch.setattr(source, "ingest_all", slow_ingest)
    engine.request_reindex()
    await started.wait()
    source.docs = [DOCKER]  # written after this sync read the source
    engine.request_reindex()
    release.set()
    await engine._sync_task

    assert source.reads == reads_before + 2  # the same task read the source again
    assert engine.is_current()
    assert await _titles(engine) == ["Docker Basics"]


@pytest.mark.asyncio
async def test_a_failing_sync_does_not_hold_the_turn_past_the_bound(monkeypatch):
    monkeypatch.setattr(engine_module, "SYNC_WAIT_SECONDS", 0.2)
    source = _Source([DOCKER])
    engine = _engine(source)
    await engine.ensure_fresh()

    async def stuck():
        await asyncio.sleep(1.0)
        return [DOCKER]

    monkeypatch.setattr(source, "ingest_all", stuck)
    engine.request_reindex()
    t0 = time.monotonic()
    assert await _titles(engine) == ["Docker Basics"]  # answered from the previous index
    assert time.monotonic() - t0 < 0.8
    await engine._sync_task


# ── Ingestion: empty and unreadable are different answers ──────────────────────


class _Adapter:
    def __init__(self, result):
        self.result = result

    async def export_full_hierarchy(self):
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.mark.asyncio
async def test_ingestion_raises_instead_of_reading_another_database():
    worker = DatabaseIngestionWorker(adapter=_Adapter(httpx.ConnectError("connection refused")))
    with pytest.raises(httpx.ConnectError):
        await worker.ingest_all()


@pytest.mark.asyncio
async def test_ingestion_of_an_empty_roadmap_is_empty():
    assert await DatabaseIngestionWorker(adapter=_Adapter([])).ingest_all() == []


def _http_adapter(handler) -> HttpApiAdapter:
    adapter = HttpApiAdapter("http://next.test")
    adapter._client = httpx.AsyncClient(base_url="http://next.test", transport=httpx.MockTransport(handler))
    return adapter


@pytest.mark.asyncio
async def test_full_export_reads_an_empty_list_as_no_roadmap():
    adapter = _http_adapter(lambda req: httpx.Response(200, json={"total_roadmaps": 0, "roadmaps": []}))
    assert await adapter.export_full_hierarchy() == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [httpx.Response(500, json={"error": "Failed"}), httpx.Response(200, json={"error": "unexpected shape"})],
)
async def test_full_export_raises_when_it_cannot_say_what_exists(response):
    adapter = _http_adapter(lambda req: response)
    with pytest.raises((httpx.HTTPStatusError, ValueError)):
        await adapter.export_full_hierarchy()


# ── POST /internal/reindex ─────────────────────────────────────────────────────


def _client(headers: dict[str, str]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=headers)


@pytest.mark.asyncio
async def test_reindex_endpoint_queues_a_rebuild(monkeypatch, owner_headers):
    calls = []
    monkeypatch.setattr(engine_module.rag_engine, "request_reindex", lambda: calls.append(True))
    async with _client({**owner_headers, "x-actor": "visitor"}) as client:
        resp = await client.post("/internal/reindex")
    assert resp.status_code == 202
    assert calls == [True]


@pytest.mark.asyncio
async def test_reindex_endpoint_needs_the_internal_key(monkeypatch):
    calls = []
    monkeypatch.setattr(engine_module.rag_engine, "request_reindex", lambda: calls.append(True))
    async with _client({"x-internal-key": "wrong-key"}) as client:
        resp = await client.post("/internal/reindex")
    assert resp.status_code == 401
    assert calls == []
