"""Sources in the closing metadata: only documents the answer actually uses."""

from __future__ import annotations

from rag_service.core.augmentation.documents import ContextDocument
from rag_service.core.generation.delivery import MAX_SOURCES, metadata_event


def _doc(id_: str, title: str, href: str | None = None, score: float = 0.5) -> ContextDocument:
    return ContextDocument(id=id_, title=title, body="", score=score, href=href)


def test_retrieved_but_unused_documents_are_not_sources():
    docs = [_doc("a", "Hybrid Search", "/?topic=t&item=a"), _doc("b", "Chunking Strategy", "/?topic=t&item=b")]
    ev = metadata_event("rag", "Tìm kiếm lai kết hợp BM25 và vector.", docs, None, "ok", show_scores=False)
    assert ev["sources"] == []


def test_linked_document_is_cited():
    docs = [_doc("a", "Hybrid Search", "/?topic=t&item=a")]
    ev = metadata_event("rag", "Xem [Hybrid Search](/?topic=t&item=a).", docs, None, "ok", show_scores=False)
    assert [s["id"] for s in ev["sources"]] == ["a"]
    assert ev["sources"][0]["cited"] is True


def test_named_but_unlinked_document_is_a_source_not_cited():
    docs = [_doc("a", "Hybrid Search", "/?topic=t&item=a")]
    ev = metadata_event("rag", "Bài hybrid search nói về BM25.", docs, None, "ok", show_scores=False)
    assert [s["id"] for s in ev["sources"]] == ["a"]
    assert ev["sources"][0]["cited"] is False


def test_sources_are_capped_and_empty_titles_never_match():
    docs = [_doc(str(i), f"Bài {i}", f"/?topic=t&item={i}") for i in range(6)]
    text = " ".join(f"Bài {i}" for i in range(6))
    ev = metadata_event("rag", text, docs + [_doc("x", "", None)], None, "ok", show_scores=False)
    assert len(ev["sources"]) == MAX_SOURCES
    assert all(s["id"] != "x" for s in ev["sources"])
