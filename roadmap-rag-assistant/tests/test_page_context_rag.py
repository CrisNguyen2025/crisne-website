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


@pytest.mark.asyncio
async def test_current_section_query_with_page_context_routes_and_answers_without_domain_gap(monkeypatch):
    import uuid
    import rag_service.domains.roadmap.agent as agent_module
    from rag_service.auth import set_actor
    from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
    from rag_service.domains.roadmap.retrieval.relevance import asks_about_current_page

    page_ctx = {
        "roadmapSlug": "frontend",
        "roadmapTitle": "Frontend",
        "itemId": "sssss",
        "itemTitle": "sssss",
        "section": "sss",
    }
    router = IntentRouter()
    for q in ("section hiện tại là gì", "mục hiện tại là gì", "section này là gì"):
        assert asks_about_current_page(q)
        out = await route_decision.decide_route(router, q, (), page_context=page_ctx)
        assert out.intent_res.intent == IntentType.KNOWLEDGE_QUERY
        assert out.method == "page_context"
        assert out.scope is None

    engine = _build_seeded_engine()
    await engine.sync_live_database()
    vocab = corpus_vocabulary(
        d for d in engine._vector_store._docs_map.values() if d.doc_type != "chunk"
    )
    # "section" must not trigger names_unknown_topic when filtering pinned open-page docs
    matches = await engine.search_with_page_context("section hiện tại là gì", page_ctx, limit=4)
    # Seeded page_ctx item ("sssss") is absent in _build_seeded_engine; test with existing Next.js item
    existing_ctx = {
        "roadmapSlug": "frontend",
        "itemId": "ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529",
    }
    pinned = await engine.search_with_page_context("section hiện tại là gì", existing_ctx, limit=4)
    assert pinned and pinned[0][0].is_current_page is True
    kept = filter_on_topic("section hiện tại là gì", pinned, vocab, pinned_doc_id=pinned[0][0].id)
    assert kept and kept[0][0].id == "item-nextjs"
    assert matches is not None

    async def fail_if_scope(*_a, **_k):
        raise AssertionError("scope classifier should not run for current-section open-page queries")

    set_actor("owner")
    bot = NextGenRoadmapAgent(llm_model=None)
    with monkeypatch.context() as m:
        m.setattr(agent_module, "classify_for_routing", fail_if_scope)
        events = [
            ev
            async for ev in bot.astream_events(
                {"messages": [{"role": "user", "content": "section hiện tại là gì"}], "context": page_ctx, "fast": True},
                config={"configurable": {"thread_id": f"sec-{uuid.uuid4()}"}},
            )
        ]
    reply = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
    assert "`sss`" in reply
    assert "sssss" in reply
    assert "Domain Gap" not in reply
    assert not any(e.get("type") == "action_preview" for e in events)

    # Without page_context on a fresh thread, scope resolves to NONE (no domain_gap) and never drafts a fake lesson
    scope_res = await classify_for_routing("section hiện tại là gì", engine)
    assert scope_res.scope == Scope.NONE
    no_ctx_events = [
        ev
        async for ev in bot.astream_events(
            {"messages": [{"role": "user", "content": "section hiện tại là gì"}], "fast": True},
            config={"configurable": {"thread_id": f"sec-empty-{uuid.uuid4()}"}},
        )
    ]
    no_ctx_reply = "".join(e.get("delta", "") for e in no_ctx_events if e.get("type") == "token")
    assert "chưa thấy bài học hay mục (section) nào đang mở" in no_ctx_reply
    assert not any(e.get("type") == "action_preview" for e in no_ctx_events)


@pytest.mark.asyncio
async def test_page_hien_tai_dang_noi_ve_gi_pins_open_lesson_including_thin_lesson(monkeypatch):
    import uuid
    import rag_service.domains.roadmap.agent as agent_module
    from rag_service.auth import set_actor
    from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
    from rag_service.domains.roadmap.retrieval.relevance import asks_about_current_page

    router = IntentRouter()
    page_ctx = {
        "roadmapSlug": "frontend",
        "roadmapTitle": "Frontend",
        "itemId": "sssss",
        "itemTitle": "sssss",
        "section": "sss",
    }
    for q in ("page hiện tại đang nói về gì", "page này là gì", "lesson hiện tại đang nói về gì"):
        assert asks_about_current_page(q)
        out = await route_decision.decide_route(router, q, (), page_context=page_ctx)
        assert out.intent_res.intent == IntentType.KNOWLEDGE_QUERY
        assert out.method == "page_context"
        assert out.scope is None

    # Seed an engine that also holds a thin empty lesson `sssss` in `frontend`
    engine = _build_seeded_engine()
    thin_lesson = KnowledgeDocument(
        id="item-sssss",
        doc_type="item",
        title="sssss",
        topic_slug="frontend",
        topic_title="Frontend",
        item_slug="sssss",
        section="sss",
        description="",
        content_text="",
        searchable_text="Bài học Mục Item: sssss. Lộ trình: Frontend (frontend) -> Mục: sss.",
    )
    orig_ingest = engine._ingestion_worker.ingest_all

    async def ingest_with_thin():
        return [*(await orig_ingest()), thin_lesson]

    engine._ingestion_worker.ingest_all = ingest_with_thin
    await engine.sync_live_database()
    vocab = corpus_vocabulary(
        d for d in engine._vector_store._docs_map.values() if d.doc_type != "chunk"
    )

    pinned = await engine.search_with_page_context("page hiện tại đang nói về gì", page_ctx, limit=4)
    assert pinned and pinned[0][0].id == "item-sssss"
    assert pinned[0][0].is_current_page is True
    kept = filter_on_topic("page hiện tại đang nói về gì", pinned, vocab, pinned_doc_id="item-sssss")
    assert kept and kept[0][0].id == "item-sssss"
    ctx_doc = _roadmap_document(kept[0][0], 1.0)
    assert "page hiện tại" in ctx_doc.body
    assert "chưa có mô tả hay nội dung" in ctx_doc.body

    async def fail_if_scope(*_a, **_k):
        raise AssertionError("scope classifier should not run for open-page queries")

    with monkeypatch.context() as m:
        m.setattr(agent_module, "classify_for_routing", fail_if_scope)
        m.setattr(agent_module, "rag_engine", engine)
        set_actor("owner")
        bot = NextGenRoadmapAgent(llm_model=None)
        events = [
            ev
            async for ev in bot.astream_events(
                {"messages": [{"role": "user", "content": "page hiện tại đang nói về gì"}], "context": page_ctx, "fast": True},
                config={"configurable": {"thread_id": f"page-{uuid.uuid4()}"}},
            )
        ]
    reply = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
    assert "sssss" in reply
    assert "Roadmap chưa có bài học về chủ đề này" not in reply


@pytest.mark.asyncio
async def test_open_lesson_summary_is_not_hijacked_by_history_or_sibling_lesson(monkeypatch):
    import uuid
    import rag_service.domains.roadmap.agent as agent_module
    from rag_service.auth import set_actor
    from rag_service.core.augmentation.history import history_store
    from rag_service.core.generation.delivery import record_turn
    from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
    from rag_service.domains.roadmap.retrieval.relevance import asks_about_current_page

    engine = _build_seeded_engine()
    sept_lesson = KnowledgeDocument(
        id="item-nextjs-sept",
        doc_type="item",
        title="Bản phát hành bảo mật Next.js tháng 9/2026: 7 lỗ hổng sẽ được vá",
        topic_slug="frontend",
        topic_title="Frontend",
        item_slug="ban-phat-hanh-bao-mat-nextjs-thang-92026-7-lo-hong-se-duoc-va",
        section="Mục hay ho",
        description="",
        content_text="Next.js tháng 9/2026 công bố 7 lỗ hổng bảo mật cần cập nhật.",
        searchable_text="Bài học Bản phát hành bảo mật Next.js tháng 9/2026: 7 lỗ hổng sẽ được vá.",
    )
    orig_ingest = engine._ingestion_worker.ingest_all

    async def ingest_both():
        return [*(await orig_ingest()), sept_lesson]

    engine._ingestion_worker.ingest_all = ingest_both
    await engine.sync_live_database()

    sept_ctx = {
        "roadmapSlug": "frontend",
        "roadmapTitle": "Frontend",
        "itemId": sept_lesson.item_slug,
        "itemTitle": sept_lesson.title,
        "section": "Mục hay ho",
    }

    # 1. Pure open-lesson summary isolates to the September lesson (never mixes November in)
    matches = await engine.search_with_page_context("tóm tắt page này", sept_ctx, limit=4)
    assert [d.id for d, _ in matches] == ["item-nextjs-sept"]
    assert matches[0][0].is_current_page is True

    # 2. Follow-up correction statement ("đây là bài về tháng 9 mà") routes via page_context, never UNCLEAR
    router = IntentRouter()
    assert asks_about_current_page("đây là bài về tháng 9 mà")
    out = await route_decision.decide_route(router, "đây là bài về tháng 9 mà", (), page_context=sept_ctx)
    assert out.intent_res.intent == IntentType.KNOWLEDGE_QUERY
    assert out.method == "page_context"
    corr_matches = await engine.search_with_page_context("đây là bài về tháng 9 mà", sept_ctx, limit=4)
    assert [d.id for d, _ in corr_matches] == ["item-nextjs-sept"]

    # 3. End-to-end turn after prior turns about November must NOT rewrite to November or leak November into <context>
    class PromptRecordingLLM:
        def __init__(self) -> None:
            self.prompts: list[str] = []

        async def ainvoke(self, prompt: str):
            self.prompts.append(str(prompt))
            return type("Msg", (), {"content": '{"rewrite": "Bản phát hành bảo mật Next.js tháng 11/2026", "variants": [], "parts": []}'})()

        async def astream(self, prompt: str):
            self.prompts.append(str(prompt))
            from langchain_core.messages import AIMessageChunk

            yield AIMessageChunk(content="Bài tháng 9/2026 nêu 7 lỗ hổng bảo mật. [[item-nextjs-sept]]\n<sources>item-nextjs-sept</sources>")

    tid = f"owner:sept-{uuid.uuid4()}"
    history_store.clear(tid)
    record_turn(
        tid,
        "vậy còn page này",
        "Trang hiện tại là bài học “Bản phát hành bảo mật Next.js tháng 11/2026: vá lỗi v16.4.5 và v15.5.29”.",
    )
    llm = PromptRecordingLLM()

    with monkeypatch.context() as m:
        m.setattr(agent_module, "rag_engine", engine)
        set_actor("owner")
        bot = NextGenRoadmapAgent(llm_model=llm)
        events = [
            ev
            async for ev in bot.astream_events(
                {"messages": [{"role": "user", "content": "tóm tắt page này"}], "context": sept_ctx, "fast": True},
                config={"configurable": {"thread_id": tid}},
            )
        ]

        # Only the generation prompt ran (no query-rewrite LLM call!) and <context> holds only September
        assert len(llm.prompts) == 1
        sent = llm.prompts[0]
        context_block = sent[sent.index("<context>") : sent.index("</context>")]
        assert "item-nextjs-sept" in context_block
        assert "item-nextjs\"" not in context_block
        assert "<current_page>" in sent and sept_lesson.title in sent.split("<current_page>")[1]
        reply = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
        assert "tháng 9/2026" in reply

        # 4. Correction turn right after ("đây là bài về tháng 9 mà") does NOT fall into UNCLEAR
        corr_events = [
            ev
            async for ev in bot.astream_events(
                {"messages": [{"role": "user", "content": "đây là bài về tháng 9 mà"}], "context": sept_ctx, "fast": True},
                config={"configurable": {"thread_id": tid}},
            )
        ]
        corr_reply = "".join(e.get("delta", "") for e in corr_events if e.get("type") == "token")
        assert "chưa hiểu rõ" not in corr_reply
        assert "tháng 9/2026" in corr_reply
