"""Tests for Mini-RAG engine and document generation tools."""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.retrieval.engine import MiniRagEngine
from rag_service.tools.rag_tools import (
    generate_roadmap_from_template,
    preview_roadmap_plan,
    search_roadmap_templates,
)


@pytest.fixture
def rag():
    return MiniRagEngine()


def test_rag_engine_loads_blueprints(rag):
    templates = rag.list_templates()
    assert len(templates) >= 3
    ids = [t["id"] for t in templates]
    assert "ai-engineering" in ids
    assert "nextjs-fullstack" in ids
    assert "cloud-devops" in ids


def test_rag_engine_search_exact_and_fuzzy(rag):
    # Search for AI
    results = rag.search("AI & LLM", limit=2)
    assert len(results) > 0
    top_template, score = results[0]
    assert top_template["id"] == "ai-engineering"

    # Search for Next.js
    results_next = rag.search("Next.js App Router", limit=2)
    assert len(results_next) > 0
    assert results_next[0][0]["id"] == "nextjs-fullstack"


def test_rag_engine_format_plan_preview(rag):
    template = rag.get_template("ai-engineering")
    assert template is not None
    preview = rag.format_plan_preview(template)
    assert "AI & LLM Architecture" in preview
    assert "Layer 1:" in preview
    assert "01-LLM" in preview


@pytest.mark.asyncio
async def test_search_roadmap_templates_tool():
    result = await search_roadmap_templates.ainvoke({"query": "DevOps Kubernetes"})
    assert "🔍" in result
    assert "cloud-devops" in result


@pytest.mark.asyncio
async def test_preview_roadmap_plan_tool():
    result = await preview_roadmap_plan.ainvoke({"query_or_template_id": "ai-engineering"})
    assert "Kế Hoạch Lộ Trình" in result
    assert "01-LLM" in result
    assert "preview_roadmap_plan" not in result  # Returns formatted preview text


@pytest.mark.asyncio
async def test_generate_roadmap_from_template_tool(mock_adapter):
    mock_adapter.create_topic.return_value = {
        "id": "new-topic-id",
        "slug": "ai-test",
        "title": "AI Test",
    }
    mock_adapter.get_topic.return_value = {
        "slug": "ai-test",
        "layers": [
            {"id": "layer-1", "shortTag": "01-LLM"},
            {"id": "layer-2", "shortTag": "02-RAG"},
        ],
    }

    result = await generate_roadmap_from_template.ainvoke(
        {"template_id": "ai-engineering", "custom_title": "AI Test"}
    )
    assert "🎉" in result
    assert "ai-test" in result
    mock_adapter.create_topic.assert_called_once()
    assert mock_adapter.create_item.call_count >= 3


@pytest.mark.asyncio
async def test_stale_index_is_refreshed_in_background():
    """Edits made outside the agent (web UI, triage approve) reach the index after the TTL."""
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
