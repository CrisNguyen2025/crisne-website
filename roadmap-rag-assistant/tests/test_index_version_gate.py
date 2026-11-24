"""The TTL refresh re-reads full-export only when the source's index version changed (or it cannot say);
a reported change (POST /internal/reindex) always re-reads it."""

from __future__ import annotations

import time

import httpx
import pytest

from rag_service.adapters.http_adapter import HttpApiAdapter
from rag_service.domains.roadmap.retrieval.engine import INDEX_TTL_SECONDS, MiniRagEngine
from rag_service.domains.roadmap.retrieval.ingestion import DatabaseIngestionWorker, KnowledgeDocument

DOCKER = KnowledgeDocument(
    id="d", doc_type="item", title="Docker Basics", topic_slug="ops", topic_title="ops",
    searchable_text="Bài học Mục Item: Docker Basics",
)


class _VersionedSource:
    def __init__(self, version="v1"):
        self.version = version
        self.reads = 0

    async def ingest_all(self):
        self.reads += 1
        return [DOCKER]

    async def index_version(self):
        return self.version


async def _synced(source) -> MiniRagEngine:
    engine = MiniRagEngine()
    engine._ingestion_worker = source
    engine._vector_store._get_embedder = lambda: None
    await engine.ensure_fresh()
    return engine


async def _past_ttl(engine: MiniRagEngine) -> None:
    engine._synced_at = time.monotonic() - INDEX_TTL_SECONDS - 1
    await engine.ensure_fresh()
    if engine._check_task is not None:
        await engine._check_task
    if engine._sync_task is not None:
        await engine._sync_task


@pytest.mark.asyncio
async def test_an_unchanged_version_skips_the_full_export():
    source = _VersionedSource()
    engine = await _synced(source)
    assert source.reads == 1

    await _past_ttl(engine)
    assert source.reads == 1
    assert engine.index_status()["version_checks_skipped"] == 1
    assert time.monotonic() - engine._synced_at < INDEX_TTL_SECONDS  # fresh again, no check on the next turn


@pytest.mark.asyncio
async def test_a_changed_version_re_reads_the_export():
    source = _VersionedSource()
    engine = await _synced(source)

    source.version = "v2"  # edited outside the API: only the TTL sees it
    await _past_ttl(engine)
    assert source.reads == 2
    assert engine._indexed_version == "v2"


@pytest.mark.asyncio
async def test_a_source_without_a_version_re_reads_on_every_ttl():
    source = _VersionedSource(version=None)
    engine = await _synced(source)

    await _past_ttl(engine)
    assert source.reads == 2
    assert engine.index_status()["version_checks_skipped"] == 0


@pytest.mark.asyncio
async def test_a_reported_change_always_re_reads_even_with_the_same_version():
    source = _VersionedSource()
    engine = await _synced(source)

    engine.request_reindex()  # what POST /internal/reindex does
    await engine._sync_task
    assert source.reads == 2


@pytest.mark.asyncio
async def test_health_reports_sync_metrics():
    engine = await _synced(_VersionedSource())
    status = engine.index_status()
    assert status["chunks"] == 0
    assert isinstance(status["last_sync_ms"], float)
    assert status["version_checks_skipped"] == 0


def _http_adapter(handler) -> HttpApiAdapter:
    adapter = HttpApiAdapter("http://next.test")
    adapter._client = httpx.AsyncClient(base_url="http://next.test", transport=httpx.MockTransport(handler))
    return adapter


@pytest.mark.asyncio
async def test_http_adapter_reads_the_index_version():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req.url.path)
        return httpx.Response(200, json={"version": "2.170.123.171"})

    assert await _http_adapter(handler).index_version() == "2.170.123.171"
    assert seen == ["/api/v1/roadmaps/index-version"]


@pytest.mark.asyncio
async def test_an_older_next_without_the_route_gives_no_version():
    worker = DatabaseIngestionWorker(adapter=_http_adapter(lambda req: httpx.Response(404, json={})))
    assert await worker.index_version() is None
