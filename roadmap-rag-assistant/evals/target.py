"""RoadmapTarget: with corpus_export.py, the only modules under evals/ that import rag_service.

Retrieval runs on the knowledge in prisma/dev.db (read only) and reports hits as corpus section_ids;
routing runs the sensitive guard and the heuristic intent router, no LLM and no network.
"""

from __future__ import annotations

from evals.corpus_export import build_documents, load_knowledge, read_existing
from evals.kit.corpus import content_hash
from evals.kit.target import Answer, Hit, RouteResult
from rag_service.rag.ingestion import KnowledgeDocument
from rag_service.rag.vector_store import HybridVectorStore
from rag_service.router.grounding import is_sensitive_request
from rag_service.router.intent_router import IntentRouter

MODES = ("fts", "vector", "hybrid")


class RoadmapTarget:
    name = "roadmap"
    capabilities = frozenset({"retrieve", "route"})

    def __init__(self, mode: str = "hybrid"):
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
        self.mode = mode
        self._router = IntentRouter()
        self._knowledge: list[KnowledgeDocument] | None = None
        self._documents: list[dict] | None = None
        self._store: HybridVectorStore | None = None

    def _load(self) -> tuple[list[KnowledgeDocument], list[dict]]:
        if self._knowledge is None:
            self._knowledge = load_knowledge()
            # Same conversion as the export, reusing its doc_ids, so hits and fingerprint match the corpus
            self._documents = build_documents(self._knowledge, read_existing()[0])
        return self._knowledge, self._documents

    def _get_store(self) -> HybridVectorStore:
        # Built on first retrieve so routing-only runs never embed the corpus
        if self._store is None:
            store = HybridVectorStore()
            if self.mode == "fts":
                store._get_embedder = lambda: None  # type: ignore[method-assign]
            store.index_documents(self._load()[0])
            self._store = store
        return self._store

    def retrieve(self, text: str, k: int, run_as: str | None = None) -> list[Hit]:
        store = self._get_store()
        search = {"fts": store.search_fts, "vector": store.search_vector, "hybrid": store.hybrid_search}[self.mode]
        doc_ids = {doc["source_id"]: doc["doc_id"] for doc in self._load()[1]}
        return [
            Hit(doc_id=doc_ids[doc.id], section_id=doc_ids[doc.id], score=score)
            for doc, score in search(text, limit=k)
        ]

    def route(self, text: str, run_as: str | None = None) -> RouteResult:
        if is_sensitive_request(text):
            return RouteResult(behavior="refuse")
        if self._router.has_mixed_intents(text):
            return RouteResult(behavior="clarify")
        result = self._router.classify_heuristics(text)
        return RouteResult(behavior="answer", route=[result.intent.value] if result else [])

    def answer(self, text: str, history: list[dict], run_as: str | None = None) -> Answer:
        raise NotImplementedError("answer is not in capabilities yet")

    def corpus_fingerprint(self) -> dict:
        documents = self._load()[1]
        return {"source": "prisma/dev.db", "doc_count": len(documents), "sha256": content_hash(documents)}


def build_target(mode: str = "hybrid") -> RoadmapTarget:
    return RoadmapTarget(mode=mode)
