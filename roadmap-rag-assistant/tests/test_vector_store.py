"""HybridVectorStore: similarity cut-off and stopword handling, with a fake embedder (no API calls)."""

from __future__ import annotations

from rag_service.domains.roadmap.retrieval.ingestion import KnowledgeDocument
from rag_service.core.retrieval.hybrid import HybridVectorStore
from rag_service.domains.roadmap.retrieval.engine import roadmap_store


def _doc(doc_id: str, title: str, text: str) -> KnowledgeDocument:
    return KnowledgeDocument(
        id=doc_id, doc_type="item", title=title, topic_slug="ai", topic_title="AI", searchable_text=text
    )


DOCS = [
    _doc("rag", "Retrieval-Augmented Generation (RAG)", "Bài học Mục Item: RAG là kiến trúc truy xuất tài liệu"),
    _doc("chunk", "Chunking Strategy", "Bài học Mục Item: cắt nhỏ tài liệu là gì và cách làm"),
    _doc("cache", "Semantic Caching", "Bài học Mục Item: lưu đệm câu trả lời theo ý nghĩa"),
]

# Query → embedding; docs sit on unit axes so cosine = the matching coordinate.
QUERIES = {
    "rag": [0.9, 0.1, 0.0],
    "phở bò": [0.4, 0.4, 0.4],
}


class _FakeEmbedder:
    def embed_query(self, query: str) -> list[float]:
        return QUERIES[query]


def _store(with_vectors: bool = True, missing: tuple[str, ...] = ()) -> HybridVectorStore:
    store = roadmap_store()
    store._get_embedder = lambda: None  # index without calling the API
    store.index_documents(DOCS)
    if with_vectors:
        axes = {"rag": [1.0, 0.0, 0.0], "chunk": [0.0, 1.0, 0.0], "cache": [0.0, 0.0, 1.0]}
        store._vectors = {k: v for k, v in axes.items() if k not in missing}
        store._get_embedder = lambda: _FakeEmbedder()
    return store


def test_hybrid_keeps_relevant_docs():
    titles = [d.title for d, _ in _store().hybrid_search("rag")]
    assert titles[0] == "Retrieval-Augmented Generation (RAG)"
    assert "Semantic Caching" not in titles


def test_hybrid_returns_nothing_for_off_topic_query():
    # cos([0.4,0.4,0.4], axis) ≈ 0.577 < threshold for every doc
    assert _store().hybrid_search("phở bò") == []


def test_unembedded_docs_are_not_dropped():
    titles = [d.title for d, _ in _store(missing=("cache",)).hybrid_search("phở bò")]
    assert titles == []  # "cache" has no FTS match for this query either
    titles = [d.title for d, _ in _store(missing=("rag",)).hybrid_search("rag")]
    assert "Retrieval-Augmented Generation (RAG)" in titles


def test_fts_ignores_question_stopwords():
    # "là" and "gì" appear in other docs; only "rag" should drive the ranking
    titles = [d.title for d, _ in _store(with_vectors=False).search_fts("RAG là gì")]
    assert titles == ["Retrieval-Augmented Generation (RAG)"]


def test_fts_keeps_stopwords_when_query_has_nothing_else():
    assert _store(with_vectors=False).search_fts("là gì")


def test_thin_docs_are_not_returned_on_cosine_alone():
    thin = KnowledgeDocument(
        id="general", doc_type="layer", title="General", topic_slug="fe", topic_title="fe",
        searchable_text="Mảng kiến thức Layer: [01-GEN] General trong Lộ trình fe.",
    )
    store = roadmap_store()
    store._get_embedder = lambda: None
    store.index_documents(DOCS + [thin])
    store._vectors = {"general": [0.9, 0.1, 0.0], "rag": [1.0, 0.0, 0.0]}
    store._get_embedder = lambda: _FakeEmbedder()
    # cos("rag" query, general) ≈ 0.99 but the layer has no text of its own
    assert [d.title for d, _ in store.hybrid_search("rag")] == ["Retrieval-Augmented Generation (RAG)"]


def test_reindex_replaces_the_previous_index():
    store = _store(with_vectors=False)
    old_conn = store.conn
    store.index_documents(DOCS[:1])
    assert store.conn is not old_conn
    assert [d.title for d, _ in store.search_fts("cache")] == []
