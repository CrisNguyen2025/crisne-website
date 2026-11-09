"""Tests for the live roadmap index of the RAG engine."""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.retrieval.engine import MiniRagEngine


@pytest.mark.asyncio
async def test_stale_index_is_refreshed_in_background():
    """Edits made outside the agent (web UI) reach the index after the TTL."""
    import time

    from rag_service.domains.roadmap.retrieval.engine import INDEX_TTL_SECONDS
    from rag_service.domains.roadmap.retrieval.ingestion import KnowledgeDocument

    corpus = [[], [KnowledgeDocument(id="d", doc_type="item", title="Docker Basics", topic_slug="ops",
                                      topic_title="ops", searchable_text="Bài học Mục Item: Docker Basics")]]

    class _Ingest:
        async def ingest_all(self):
            return corpus[0]

    engine = MiniRagEngine()
    engine._ingestion_worker = _Ingest()
    engine._vector_store._get_embedder = lambda: None
    assert await engine.search_live_knowledge("docker") == []

    corpus[0] = corpus[1]  # new item published from the web
    assert await engine.search_live_knowledge("docker") == []  # still fresh: no re-sync yet
    engine._synced_at = time.monotonic() - INDEX_TTL_SECONDS - 1
    await engine.search_live_knowledge("docker")  # stale: refresh starts in the background
    await engine._sync_task
    assert [d.title for d, _ in await engine.search_live_knowledge("docker")] == ["Docker Basics"]
    assert engine.known_topic_slugs() == {"ops"}
