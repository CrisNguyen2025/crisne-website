"""End-to-end index sync tests with mock adapter.

Tests the full lifecycle of roadmap changes:
1. Thêm bài -> request_reindex -> tìm kiếm thấy bài.
2. Sửa tiêu đề -> request_reindex -> thấy tiêu đề mới.
3. Xoá -> request_reindex -> không còn thấy.
4. Nguồn lỗi -> index cũ vẫn được giữ và last_error có giá trị.
"""

from __future__ import annotations

import httpx
import pytest

from rag_service.domains.roadmap.retrieval.engine import MiniRagEngine
from rag_service.domains.roadmap.retrieval.ingestion import DatabaseIngestionWorker


class MockRoadmapAdapter:
    """Mock adapter simulating Next.js export_full_hierarchy API."""

    def __init__(self, roadmaps: list[dict] | None = None) -> None:
        self.roadmaps: list[dict] = roadmaps if roadmaps is not None else []
        self.error: Exception | None = None

    async def export_full_hierarchy(self) -> list[dict]:
        if self.error is not None:
            raise self.error
        # Deep clone shallow structure
        return [
            {
                **topic,
                "items": list(topic.get("items", [])),
            }
            for topic in self.roadmaps
        ]


@pytest.fixture
def sync_env():
    adapter = MockRoadmapAdapter([
        {
            "id": "topic-python",
            "slug": "python-stack",
            "title": "Python Ecosystem",
            "description": "Backend engineering with Python",
            "items": [],
        }
    ])
    engine = MiniRagEngine()
    # Disable live Gemini embeddings for CI offline testing
    engine._vector_store._get_embedder = lambda: None
    engine._ingestion_worker = DatabaseIngestionWorker(adapter=adapter)
    return engine, adapter


@pytest.mark.asyncio
async def test_roadmap_index_sync_full_lifecycle(sync_env):
    engine, adapter = sync_env

    # Initial state: 1 topic, 0 lessons
    await engine.sync_live_database()
    assert engine.is_current()
    assert len(engine.known_item_ids()) == 0
    results = await engine.search_live_knowledge("FastAPI")
    assert len(results) == 0

    # 1. Thêm bài -> request_reindex -> tìm kiếm thấy bài
    item1 = {
        "id": "lesson-fastapi-01",
        "roadmapId": "topic-python",
        "title": "FastAPI Async Endpoints",
        "section": "Web Frameworks",
        "description": "How to structure async endpoints with FastAPI",
        "content": "<p>FastAPI uses async def for high performance concurrent request processing.</p>",
    }
    adapter.roadmaps[0]["items"].append(item1)
    engine.request_reindex()

    # search_live_knowledge awaits ensure_fresh()
    matches = await engine.search_live_knowledge("FastAPI")
    titles = [doc.title for doc, _ in matches]
    assert "FastAPI Async Endpoints" in titles
    assert "lesson-fastapi-01" in engine.known_item_ids()
    status = engine.index_status()
    assert status["synced"] is True
    assert status["current"] is True
    assert status["last_error"] is None

    # 2. Sửa tiêu đề -> thấy tiêu đề mới
    adapter.roadmaps[0]["items"][0] = {
        **item1,
        "title": "FastAPI High Performance Routing",
    }
    engine.request_reindex()

    matches = await engine.search_live_knowledge("Routing")
    titles = [doc.title for doc, _ in matches]
    assert "FastAPI High Performance Routing" in titles
    # Old title should no longer match
    old_matches = await engine.search_live_knowledge("Async Endpoints")
    old_titles = [doc.title for doc, _ in old_matches]
    assert "FastAPI Async Endpoints" not in old_titles

    # 3. Xoá -> không còn thấy
    adapter.roadmaps[0]["items"].clear()
    engine.request_reindex()

    matches = await engine.search_live_knowledge("FastAPI")
    assert len(matches) == 0
    assert "lesson-fastapi-01" not in engine.known_item_ids()

    # 4. Nguồn lỗi -> index cũ vẫn được giữ và last_error có giá trị
    # First, restore an item and reindex successfully
    adapter.roadmaps[0]["items"].append({
        "id": "lesson-docker-01",
        "roadmapId": "topic-python",
        "title": "Docker Deployment",
        "section": "DevOps",
        "description": "Containerizing FastAPI with Docker",
        "content": "<p>Build small multi-stage Docker images for Python apps.</p>",
    })
    engine.request_reindex()
    matches = await engine.search_live_knowledge("Docker")
    assert "Docker Deployment" in [doc.title for doc, _ in matches]
    docs_count_before = engine.index_status()["documents"]

    # Now make source error
    adapter.error = httpx.ConnectError("Failed to connect to /api/v1/roadmaps/full-export")
    engine.request_reindex()
    await engine._sync_task

    # Index cũ vẫn được giữ
    matches_after_error = await engine.search_live_knowledge("Docker")
    assert "Docker Deployment" in [doc.title for doc, _ in matches_after_error]
    assert "lesson-docker-01" in engine.known_item_ids()

    # last_error có giá trị
    err_status = engine.index_status()
    assert err_status["last_error"] == "ConnectError"
    assert err_status["synced"] is True
    assert err_status["current"] is False
    assert err_status["documents"] == docs_count_before
