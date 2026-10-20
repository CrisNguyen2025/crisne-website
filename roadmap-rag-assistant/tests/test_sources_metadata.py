"""Sources in the closing metadata: exactly the documents the model named in its <sources> line."""

from __future__ import annotations

from rag_service.core.augmentation.documents import ContextDocument
from rag_service.core.generation.delivery import MAX_SOURCES, metadata_event


def _doc(id_: str, title: str, href: str | None = None, score: float = 0.5) -> ContextDocument:
    return ContextDocument(id=id_, title=title, body="", score=score, href=href)


def test_retrieved_but_unnamed_documents_are_not_sources():
    docs = [_doc("a", "Hybrid Search", "/?topic=t&item=a"), _doc("b", "Chunking Strategy", "/?topic=t&item=b")]
    ev = metadata_event("rag", "Tìm kiếm lai kết hợp BM25 và vector.", docs, None, "ok", False, cited_ids=["a"])
    assert [s["id"] for s in ev["sources"]] == ["a"]


def test_no_sources_line_means_no_sources_even_if_titles_appear():
    docs = [_doc("a", "Hybrid Search", "/?topic=t&item=a")]
    ev = metadata_event("rag", "Bài Hybrid Search nói về BM25.", docs, None, "ok", False, cited_ids=[])
    assert ev["sources"] == []


def test_cited_flag_reflects_inline_link():
    docs = [_doc("a", "Hybrid Search", "/?topic=t&item=a")]
    ev = metadata_event("rag", "Xem [Hybrid Search](/?topic=t&item=a).", docs, None, "ok", False, cited_ids=["a"])
    assert ev["sources"][0]["cited"] is True


def test_sources_keep_the_models_order_and_are_capped():
    docs = [_doc(str(i), f"Bài {i}", f"/?topic=t&item={i}") for i in range(6)]
    ev = metadata_event("rag", "", docs, None, "ok", False, cited_ids=["5", "2", "0", "1", "3"])
    assert [s["id"] for s in ev["sources"]] == ["5", "2", "0"][:MAX_SOURCES]
