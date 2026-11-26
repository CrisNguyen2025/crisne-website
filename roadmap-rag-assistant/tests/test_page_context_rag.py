"""Tests for grounding KNOWLEDGE_QUERY and RAG retrieval with the open Topic/Lesson PageContext."""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.profile import _roadmap_document
from rag_service.domains.roadmap.retrieval.engine import MiniRagEngine
from rag_service.domains.roadmap.retrieval.ingestion import KnowledgeDocument
from rag_service.domains.roadmap.retrieval.relevance import corpus_vocabulary, filter_on_topic
from rag_service.domains.roadmap.router import route_decision
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType, KnowledgeSubIntent
from rag_service.domains.roadmap.router.scope import Scope, ScopeResult, classify_for_routing


def _build_seeded_engine() -> MiniRagEngine:
    topic_fe = KnowledgeDocument(
        id="topic-fe",
        doc_type="topic",
        title="Frontend",
        topic_slug="frontend",
        topic_title="Frontend",
        description="Lộ trình Frontend hiện đại",
        content_text="Mục Next.js: Bản phát hành bảo mật Next.js tháng 11/2026",
        searchable_text="Lộ trình Frontend: Next.js bảo mật",
    )
    lesson_nextjs = KnowledgeDocument(
        id="item-nextjs",
        doc_type="item",
        title="Bản phát hành bảo mật Next.js tháng 11/2026 và lỗi v16.4.5 và v15.5.29",
        topic_slug="frontend",
        topic_title="Frontend",
        item_slug="ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529",
        section="Next.js",
        description="Cảnh báo bảo mật và bản vá cho Next.js",
        content_text="Tổng quan bản phát hành bảo mật tháng 11/2026.",
        searchable_text="Bài học Bản phát hành bảo mật Next.js tháng 11/2026 và lỗi v16.4.5 và v15.5.29",
    )
    chunk_intro = KnowledgeDocument(
        id="item-nextjs::0",
        doc_type="chunk",
        title=lesson_nextjs.title,
        topic_slug="frontend",
        topic_title="Frontend",
        item_slug=lesson_nextjs.item_slug,
        section="Next.js",
        content_text="Bản vá bảo mật khẩn cấp xử lý lỗ hổng middleware bypass.",
        searchable_text="Mở đầu: Bản vá bảo mật khẩn cấp xử lý lỗ hổng middleware bypass.",
        parent_id="item-nextjs",
        anchor=None,
        heading=None,
    )
    chunk_versions = KnowledgeDocument(
        id="item-nextjs::1",
        doc_type="chunk",
        title=lesson_nextjs.title,
        topic_slug="frontend",
        topic_title="Frontend",
        item_slug=lesson_nextjs.item_slug,
        section="Next.js",
        content_text="Bản v16.4.5 bị regression cache header, cần nâng thẳng lên v16.4.6 hoặc v15.5.30.",
        searchable_text="Chi tiết lỗi: Bản v16.4.5 bị regression cache header, cần nâng thẳng lên v16.4.6.",
        parent_id="item-nextjs",
        anchor="chi-tiet-loi-version",
        heading="Chi tiết lỗi version",
    )
    lesson_rag = KnowledgeDocument(
        id="item-rag",
        doc_type="item",
        title="Hybrid Search",
        topic_slug="ai",
        topic_title="AI Architecture",
        item_slug="hybrid-search",
        section="Retrieval",
        description="Kết hợp BM25 và vector search",
        content_text="Hybrid Search dùng RRF để gộp điểm.",
        searchable_text="Bài học Hybrid Search BM25 vector search RRF",
    )

    class _Ingest:
        async def ingest_all(self):
            return [topic_fe, lesson_nextjs, chunk_intro, chunk_versions, lesson_rag]

    engine = MiniRagEngine()
    engine._ingestion_worker = _Ingest()
    engine._vector_store._get_embedder = lambda: None
    return engine


@pytest.mark.asyncio
async def test_deictic_open_page_questions_route_to_knowledge_query_while_external_stays_out_of_scope():
    router = IntentRouter()
    page_ctx = {
        "roadmapSlug": "frontend",
        "itemId": "ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529",
    }

    for q in ("tóm tắt bài này", "giải thích bài này giúp mình", "trang này nói về gì?"):
        out = await route_decision.decide_route(router, q, (), page_context=page_ctx)
        assert out.intent_res.intent == IntentType.KNOWLEDGE_QUERY
        assert out.intent_res.sub_intent == KnowledgeSubIntent.SEARCH
        assert out.write == "none"

    async def external_scope(_text: str):
        return ScopeResult(Scope.EXTERNAL, "telegram", "outside")

    ext = await route_decision.decide_route(
        router,
        "bạn có biết thông tin về telegram k",
        (),
        page_context=page_ctx,
        scope_fn=external_scope,
    )
    assert ext.intent_res.intent == IntentType.OUT_OF_SCOPE


@pytest.mark.asyncio
async def test_scope_recognizes_terms_present_on_open_lesson():
    engine = _build_seeded_engine()
    await engine.sync_live_database()
    page_ctx = {
        "roadmapSlug": "frontend",
        "itemId": "ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529",
    }

    res = await classify_for_routing("v16.4.5 bị lỗi gì vậy?", engine, page_context=page_ctx)
    assert res.scope == Scope.ROADMAP
    assert res.reason == "matches open page"


@pytest.mark.asyncio
async def test_search_with_page_context_pins_open_lesson_for_deictic_and_detail_queries_only():
    engine = _build_seeded_engine()
    await engine.sync_live_database()
    page_ctx = {
        "roadmapSlug": "frontend",
        "itemId": "ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529",
    }
    vocab = corpus_vocabulary(
        d for d in engine._vector_store._docs_map.values() if d.doc_type != "chunk"
    )

    # 1. Deictic question ("tóm tắt bài này") pins the open lesson + chunks and survives filter_on_topic
    deictic_matches = await engine.search_with_page_context("tóm tắt bài này", page_ctx, limit=4)
    assert deictic_matches
    top_doc, _ = deictic_matches[0]
    assert top_doc.id == "item-nextjs"
    assert top_doc.is_current_page is True
    assert len(top_doc.passages) == 2

    kept = filter_on_topic("tóm tắt bài này", deictic_matches, vocab, pinned_doc_id=top_doc.id)
    assert [d.id for d, _ in kept] == ["item-nextjs"]

    # Formatted prompt document carries the open-page grounding marker
    ctx_doc = _roadmap_document(top_doc, 1.0)
    assert "Ngữ cảnh trang hiện tại" in ctx_doc.body

    # 2. Specific version detail on the page ranks the open lesson first with matching chunk first
    detail_matches = await engine.search_with_page_context("v16.4.5 bị lỗi gì?", page_ctx, limit=4)
    assert detail_matches[0][0].id == "item-nextjs"
    assert detail_matches[0][0].is_current_page is True
    assert any("v16.4.5" in (p.get("text") or "") for p in detail_matches[0][0].passages)

    # 3. Unrelated question about another topic does NOT get polluted with the Next.js lesson
    other_matches = await engine.search_with_page_context("Hybrid Search dùng RRF thế nào?", page_ctx, limit=4)
    assert [d.id for d, _ in other_matches] == ["item-rag"]

    # 4. Unknown external tech term is still rejected by filter_on_topic even with pinned_doc_id
    assert filter_on_topic("Kubernetes Helm chart là gì?", deictic_matches, vocab, pinned_doc_id=top_doc.id) == []
