"""Query embeddings: a repeated question costs no embed request, and a failed embed flags the trace."""

from __future__ import annotations

from types import SimpleNamespace

import rag_service.core.retrieval.hybrid as hybrid
from rag_service.core.retrieval.hybrid import HybridVectorStore, _QueryVectorCache


class _Embedder:
    def __init__(self, fail: bool = False) -> None:
        self.fail, self.calls = fail, 0

    def embed_query(self, text):
        self.calls += 1
        if self.fail:
            raise RuntimeError("429 RESOURCE_EXHAUSTED")
        return [1.0, 0.0]


def _store(embedder) -> HybridVectorStore:
    store = HybridVectorStore()
    store._get_embedder = lambda: embedder  # type: ignore[method-assign]
    store._docs_map = {"d1": SimpleNamespace(id="d1")}
    store._vectors = {"d1": [1.0, 0.0]}
    return store


def test_repeated_query_is_embedded_once(monkeypatch):
    monkeypatch.setattr(hybrid, "_QUERY_VECTORS", _QueryVectorCache())
    embedder = _Embedder()
    store = _store(embedder)
    assert store._similarities("RAG là gì") == {"d1": 1.0}
    assert store._similarities("RAG là gì") == {"d1": 1.0}
    assert embedder.calls == 1


def test_cache_keeps_only_the_most_recent_queries():
    cache = _QueryVectorCache(size=2)
    cache.put("a", [1.0])
    cache.put("b", [2.0])
    cache.get("a")
    cache.put("c", [3.0])
    assert cache.get("b") is None and cache.get("a") == [1.0]


def test_failed_query_embedding_flags_the_trace(monkeypatch):
    monkeypatch.setattr(hybrid, "_QUERY_VECTORS", _QueryVectorCache())
    trace = SimpleNamespace(flags={})
    monkeypatch.setattr("rag_service.observability.current_trace", lambda: trace)
    assert _store(_Embedder(fail=True))._similarities("RAG là gì") is None
    assert trace.flags["embedding_degraded"] is True


def test_rate_limited_embedding_key_hands_over_to_the_next():
    from rag_service.core.retrieval.hybrid import RotatingEmbeddings

    class _Emb:
        def __init__(self, fail):
            self.fail, self.calls = fail, 0

        def embed_query(self, text):
            self.calls += 1
            if self.fail:
                raise RuntimeError("429 RESOURCE_EXHAUSTED")
            return [0.5]

    first, second = _Emb(True), _Emb(False)
    emb = RotatingEmbeddings([first, second])
    assert emb.embed_query("x") == [0.5] and emb.embed_query("y") == [0.5]
    assert first.calls == 1  # the working key stays current
