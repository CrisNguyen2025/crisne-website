"""Every section of a lesson reaches the answer: chunks from full-export are searched, folded into their lesson,
quoted in the context and linked by heading anchor; catalogs, vocabularies and scope centroids ignore them."""

from __future__ import annotations

import pytest

from rag_service.domains.roadmap.profile import _roadmap_document
from rag_service.domains.roadmap.retrieval.engine import MiniRagEngine
from rag_service.domains.roadmap.retrieval.ingestion import DatabaseIngestionWorker
from rag_service.domains.roadmap.retrieval.scope_centroid import DomainCentroids

FILLER = "Kho vector lưu embedding của tài liệu để tìm theo nghĩa thay vì theo từ khoá. " * 14  # ~1,100 chars
FACT = "Tham số ef_search của chỉ mục HNSW trong pgvector mặc định bằng 40."


def _chunk(anchor, heading, text):
    return {"anchor": anchor, "heading": heading, "text": text}


def _long_lesson():
    """A lesson whose fact sits in its third section, over 2,000 characters in."""
    chunks = [
        _chunk(None, None, FILLER),
        _chunk("lich-su", "Lịch sử", FILLER),
        _chunk("tinh-chinh-pgvector", "Tinh chỉnh pgvector", FACT),
    ]
    html = "".join(
        (f"<h2>{c['heading']}</h2>" if c["heading"] else "") + f"<p>{c['text']}</p>" for c in chunks
    )
    return {
        "id": "les-vec",
        "slug": "vector-db",
        "title": "Vector Database",
        "description": "Tổng quan kho vector",
        "section": "Retrieval",
        "content": html,
        "chunks": chunks,
    }


def _short_lesson():
    return {
        "id": "les-short",
        "slug": "prompt",
        "title": "Prompt Engineering",
        "description": "",
        "section": None,
        "content": "<p>Viết prompt rõ ràng.</p>",
        "chunks": [_chunk(None, None, "Viết prompt rõ ràng.")],
    }


def _export(with_chunks: bool = True):
    items = [_long_lesson(), _short_lesson()]
    if not with_chunks:
        for item in items:
            item.pop("chunks")
    return [{"id": "t1", "slug": "ai", "title": "AI", "description": "", "items": items}]


class _Adapter:
    def __init__(self, export):
        self.export = export

    async def export_full_hierarchy(self):
        return self.export


async def _engine(with_chunks: bool = True) -> MiniRagEngine:
    engine = MiniRagEngine()
    engine._ingestion_worker = DatabaseIngestionWorker(adapter=_Adapter(_export(with_chunks)))
    engine._vector_store._get_embedder = lambda: None
    await engine.sync_live_database()
    return engine


@pytest.mark.asyncio
async def test_a_fact_deep_in_a_lesson_reaches_the_context_with_its_section_link():
    engine = await _engine()
    matches = await engine.search_live_knowledge("ef_search HNSW pgvector")

    assert matches and matches[0][0].id == "les-vec"
    lesson = matches[0][0]
    assert lesson.doc_type == "item"
    assert any(FACT in p["text"] for p in lesson.passages)

    context = engine.format_knowledge_context(matches)
    assert FACT in context
    assert "/ai/vector-db#tinh-chinh-pgvector" in context

    document = _roadmap_document(lesson, matches[0][1])
    assert FACT in document.body
    assert document.href == "/ai/vector-db#tinh-chinh-pgvector"


@pytest.mark.asyncio
async def test_search_returns_lessons_and_topics_only_each_once():
    engine = await _engine()
    matches = await engine.search_live_knowledge("kho vector embedding")

    assert all(doc.doc_type in {"item", "topic"} for doc, _ in matches)
    ids = [doc.id for doc, _ in matches]
    assert len(ids) == len(set(ids))
    lesson = next(doc for doc, _ in matches if doc.id == "les-vec")
    assert 1 <= len(lesson.passages) <= 2  # two sections match; the lesson comes back once with both


@pytest.mark.asyncio
async def test_the_word_chunk_does_not_match_every_chunk_through_its_type():
    engine = await _engine()
    hits = engine._vector_store.search_fts("chunk", limit=20)
    assert not any(doc.doc_type == "chunk" for doc, _ in hits)


@pytest.mark.asyncio
async def test_short_lessons_without_headings_are_not_chunked():
    engine = await _engine()
    docs = engine._vector_store._docs_map
    assert not any(d.parent_id == "les-short" for d in docs.values())
    assert sum(1 for d in docs.values() if d.parent_id == "les-vec") == 3
    assert engine.index_status()["chunks"] == 3


@pytest.mark.asyncio
async def test_a_lesson_without_chunks_shows_its_content_beyond_300_characters():
    engine = await _engine(with_chunks=False)
    assert engine.index_status()["chunks"] == 0
    matches = await engine.search_live_knowledge("Vector Database")
    lesson = next(doc for doc, _ in matches if doc.id == "les-vec")
    assert not lesson.passages
    body = _roadmap_document(lesson, 1.0).body
    assert FILLER[:1000].strip() in body


@pytest.mark.asyncio
async def test_catalog_vocabularies_and_centroids_ignore_chunks():
    chunked, whole = await _engine(), await _engine(with_chunks=False)

    assert chunked.known_item_ids() == whole.known_item_ids() == {"les-vec", "les-short"}
    assert chunked.known_item_slugs() == whole.known_item_slugs()
    assert chunked.title_vocabulary() == whole.title_vocabulary()
    assert chunked.corpus_vocabulary() == whole.corpus_vocabulary()
    a, b = await chunked.catalog(), await whole.catalog()
    assert (a.topics, a.items) == (b.topics, b.items)

    # Same vectors for topics and lessons; chunks get far-off ones that would move the centroid if counted
    for engine in (chunked, whole):
        store = engine._vector_store
        store._vectors = {
            doc_id: ([0.0, 1.0] if doc.doc_type == "chunk" else [1.0, 0.0]) for doc_id, doc in store._docs_map.items()
        }
    ca, cb = DomainCentroids.from_store(chunked._vector_store), DomainCentroids.from_store(whole._vector_store)
    assert ca.centroids == cb.centroids  # the `domain` signal the thresholds were tuned with does not move


@pytest.mark.asyncio
async def test_a_question_near_a_later_section_is_near_the_roadmap():
    """Case 7 of tests/manual/rag-index-sync.md: `nearest` counts chunks, or a statement added at the end of a
    lesson (from News) reads as outside the field and the router answers "out of scope"."""
    chunked, whole = await _engine(), await _engine(with_chunks=False)
    for engine in (chunked, whole):
        store = engine._vector_store
        store._vectors = {
            doc_id: ([0.0, 1.0] if doc.doc_type == "chunk" else [1.0, 0.0]) for doc_id, doc in store._docs_map.items()
        }
    question_about_the_last_section = [0.0, 1.0]

    with_chunks = DomainCentroids.from_store(chunked._vector_store).signals(question_about_the_last_section)
    lessons_only = DomainCentroids.from_store(whole._vector_store).signals(question_about_the_last_section)
    assert with_chunks.nearest == 1.0
    assert lessons_only.nearest == 0.0
    assert with_chunks.domain == lessons_only.domain
