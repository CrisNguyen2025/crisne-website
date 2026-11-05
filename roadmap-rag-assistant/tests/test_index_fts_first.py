"""Tests for FTS-first indexing with background embedding (TASK-rag-sync-002).

Verifies:
1. Sau sync, tim theo FTS thay ngay tai lieu moi trong khi embed con chay.
2. vectors_pending giam dan ve 0.
3. Sync moi trong luc embed cu dang chay thi khong co vector "lac the he".
4. Tai lieu da co trong cache khong bi embed lai.
5. Loi o Pha 2 khong lam sync that bai, ghi vao last_error voi tien to 'embedding:'.
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import List

import pytest

from rag_service.core.retrieval import hybrid as hybrid_module
from rag_service.domains.roadmap.retrieval.engine import MiniRagEngine
from rag_service.domains.roadmap.retrieval.ingestion import DatabaseIngestionWorker, KnowledgeDocument


def _make_doc(doc_id: str, title: str, text: str) -> KnowledgeDocument:
    return KnowledgeDocument(
        id=doc_id,
        doc_type="item",
        title=title,
        topic_slug="ai",
        topic_title="AI Architecture",
        section="Core",
        description="Test description",
        content_text=text,
        searchable_text=f"{title} {text}",
    )


class ControlledFakeEmbedder:
    def __init__(self, vector_val: float = 0.9) -> None:
        self.vector_val = vector_val
        self.call_count = 0
        self.embed_started = threading.Event()
        self.proceed_event = threading.Event()

    def embed_query(self, query: str) -> List[float]:
        return [self.vector_val, 0.0, 0.0]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        self.call_count += len(texts)
        self.embed_started.set()
        self.proceed_event.wait(timeout=5.0)
        return [[self.vector_val, 0.1, 0.0] for _ in texts]


class SimpleFakeEmbedder:
    def __init__(self) -> None:
        self.call_count = 0
        self.embedded_texts: List[str] = []

    def embed_query(self, query: str) -> List[float]:
        return [0.9, 0.1, 0.0]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        self.call_count += len(texts)
        self.embedded_texts.extend(texts)
        return [[0.8, 0.2, 0.0] for _ in texts]


class FailingFakeEmbedder:
    def embed_query(self, query: str) -> List[float]:
        return [0.9, 0.1, 0.0]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        raise RuntimeError("QuotaExceeded429")


class _MockAdapter:
    def __init__(self, docs: List[KnowledgeDocument]) -> None:
        self.docs = docs

    async def ingest_all(self) -> List[KnowledgeDocument]:
        return list(self.docs)


@pytest.fixture(autouse=True)
def fast_embedding_interval(monkeypatch, tmp_path):
    monkeypatch.setattr(hybrid_module, "EMBEDDING_REQUEST_INTERVAL", 0.0)
    monkeypatch.setattr(hybrid_module, "EMBEDDING_CACHE_PATH", tmp_path / "embedding_cache.json")


@pytest.mark.asyncio
async def test_fts_finds_document_immediately_while_embedding_runs():
    doc = _make_doc("fastapi-1", "FastAPI Concurrency Guide", "Async def endpoints handle requests")
    adapter = _MockAdapter([doc])
    engine = MiniRagEngine()
    engine._ingestion_worker = adapter

    embedder = ControlledFakeEmbedder()
    engine._vector_store._get_embedder = lambda: embedder

    # 1. Sync returns immediately after Phase 1 (FTS)
    count = await engine.sync_live_database()
    assert count == 1
    assert engine.is_current() is True

    status = engine.index_status()
    assert status["documents"] == 1
    assert status["vectors_pending"] == 1

    # 2. Search immediately via FTS finds the document before embedding finishes
    results = await engine.search_live_knowledge("Concurrency")
    assert len(results) >= 1
    assert results[0][0].title == "FastAPI Concurrency Guide"

    # 3. Release embedding worker and verify completion
    embedder.proceed_event.set()
    await engine.wait_for_embedding(timeout=5.0)

    final_status = engine.index_status()
    assert final_status["vectors_pending"] == 0
    assert "fastapi-1" in engine._vector_store._vectors


@pytest.mark.asyncio
async def test_vectors_pending_decreases_to_zero():
    docs = [
        _make_doc(f"doc-{i}", f"Lesson Title {i}", f"Content body number {i}")
        for i in range(1, 4)
    ]
    adapter = _MockAdapter(docs)
    engine = MiniRagEngine()
    engine._ingestion_worker = adapter

    embedder = SimpleFakeEmbedder()
    engine._vector_store._get_embedder = lambda: embedder

    await engine.sync_live_database()
    assert engine.index_status()["documents"] == 3

    await engine.wait_for_embedding(timeout=5.0)
    assert engine.index_status()["vectors_pending"] == 0
    assert len(engine._vector_store._vectors) == 3
    assert embedder.call_count == 3


async def _wait_event(event: threading.Event, timeout: float = 5.0) -> bool:
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if event.is_set():
            return True
        await asyncio.sleep(0.02)
    return event.is_set()


@pytest.mark.asyncio
async def test_new_sync_prevents_stale_generation_vectors():
    doc_v1 = _make_doc("doc-1", "Original Title", "Original Content Alpha")
    adapter = _MockAdapter([doc_v1])
    engine = MiniRagEngine()
    engine._ingestion_worker = adapter

    embedder_v1 = ControlledFakeEmbedder(vector_val=0.11)
    engine._vector_store._get_embedder = lambda: embedder_v1

    # Start sync 1; embedder_v1 blocks in embed_documents
    await engine.sync_live_database()
    assert await _wait_event(embedder_v1.embed_started, timeout=5.0)

    # Sync 2 starts while sync 1 embedding is blocked: doc-1 content changes
    doc_v2 = _make_doc("doc-1", "Updated Title", "Updated Content Beta")
    adapter.docs = [doc_v2]

    embedder_v2 = SimpleFakeEmbedder()
    engine._vector_store._get_embedder = lambda: embedder_v2

    # Run sync 2: generation bumps, FTS swaps to doc_v2
    await engine.sync_live_database()
    assert engine._vector_store._docs_map["doc-1"].title == "Updated Title"

    # Now unblock embedder_v1
    embedder_v1.proceed_event.set()
    await engine.wait_for_embedding(timeout=5.0)

    # Stale vector with value 0.11 must NOT be in _vectors
    current_vec = engine._vector_store._vectors.get("doc-1")
    assert current_vec is not None
    assert current_vec[0] != 0.11
    assert current_vec[0] == 0.8  # From embedder_v2


@pytest.mark.asyncio
async def test_cached_documents_are_not_re_embedded():
    doc = _make_doc("cached-1", "Cached Document Title", "Stable content that is already cached")
    adapter = _MockAdapter([doc])
    engine = MiniRagEngine()
    engine._ingestion_worker = adapter

    embedder = SimpleFakeEmbedder()
    engine._vector_store._get_embedder = lambda: embedder

    # First sync: embeds document and saves to cache
    await engine.sync_live_database()
    await engine.wait_for_embedding(timeout=5.0)
    assert embedder.call_count == 1
    assert engine.index_status()["vectors_pending"] == 0

    # Second sync: document is already in cache
    await engine.sync_live_database()
    # vectors_pending should be 0 immediately after Phase 1 because it was loaded from cache
    assert engine.index_status()["vectors_pending"] == 0

    await engine.wait_for_embedding(timeout=5.0)
    # Call count must still be 1 (not re-embedded)
    assert embedder.call_count == 1


@pytest.mark.asyncio
async def test_embedding_failure_records_last_error_and_does_not_fail_sync():
    doc = _make_doc("fail-1", "Faulty Document Title", "Will fail during embedding")
    adapter = _MockAdapter([doc])
    engine = MiniRagEngine()
    engine._ingestion_worker = adapter

    embedder = FailingFakeEmbedder()
    engine._vector_store._get_embedder = lambda: embedder

    count = await engine.sync_live_database()
    assert count == 1
    assert engine.is_current() is True
    assert engine.index_status()["synced"] is True

    await engine.wait_for_embedding(timeout=5.0)

    status = engine.index_status()
    assert status["synced"] is True
    assert status["current"] is True
    assert status["last_error"] == "embedding:RuntimeError"
    # Document is still searchable via FTS fallback
    results = await engine.search_live_knowledge("Faulty")
    assert len(results) >= 1
    assert results[0][0].title == "Faulty Document Title"
