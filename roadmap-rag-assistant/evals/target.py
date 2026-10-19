"""RoadmapTarget: with corpus_export.py, the only modules under evals/ that import rag_service.

Retrieval runs on the knowledge in prisma/dev.db (read only) and reports hits as corpus section_ids;
routing runs the sensitive guard and the heuristic intent router, no LLM and no network.
Answering (opt-in, `--opt answer=llm`) runs the real agent with the configured LLM: it calls the
provider and spends quota, so the default offline run leaves it out.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from pathlib import Path

from evals.corpus_export import DEV_DB, build_documents, load_knowledge, read_existing
from evals.kit.corpus import content_hash
from evals.kit.target import Answer, Hit, RouteResult, TargetUnavailable
from rag_service.config import settings
from rag_service.rag.ingestion import KnowledgeDocument
from rag_service.rag.vector_store import HybridVectorStore
from rag_service.router.grounding import MIXED_INTENT_REPLY, SENSITIVE_REPLY, is_sensitive_request
from rag_service.router.intent_router import IntentRouter

MODES = ("fts", "vector", "hybrid")
ANSWER_MODES = ("off", "llm")
CACHE_FILE = Path(__file__).parent / ".cache" / "answers.json"
# Code whose change can change an answer; any edit here invalidates the whole cache
CODE_GLOBS = ("rag_service/agent.py", "rag_service/core/**/*.py", "rag_service/domains/**/*.py", "rag_service/rag/*.py", "rag_service/router/*.py")


def _code_fingerprint() -> str:
    root = Path(__file__).resolve().parents[1]
    digest = hashlib.sha256()
    for pattern in CODE_GLOBS:
        for path in sorted(root.glob(pattern)):
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


class RoadmapTarget:
    name = "roadmap"
    def __init__(self, mode: str = "hybrid", answer: str = "off", cache: str = "on"):
        if cache not in ("on", "off"):
            raise ValueError(f"cache must be 'on' or 'off', got {cache!r}")
        self._cache_on = cache == "on"
        self._cache: dict | None = None
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
        if answer not in ANSWER_MODES:
            raise ValueError(f"answer must be one of {ANSWER_MODES}, got {answer!r}")
        self.mode = mode
        self.capabilities = frozenset({"retrieve", "route"} | ({"answer"} if answer == "llm" else set()))
        self._agent = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._router = IntentRouter()
        self._knowledge: list[KnowledgeDocument] | None = None
        self._documents: list[dict] | None = None
        self._store: HybridVectorStore | None = None

    def _load(self) -> tuple[list[KnowledgeDocument], list[dict]]:
        if self._knowledge is None:
            if not DEV_DB.exists():
                raise RuntimeError(f"{DEV_DB} is missing: restore the corpus source (see the backup) before running evals")
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

    def _get_agent(self):
        if self._agent is None:
            from rag_service.adapters.sqlite_adapter import SqliteAdapter
            from rag_service.agent import build_agent
            from rag_service.tools import init_adapter

            # Same knowledge as the corpus, and no Next.js needed. Never create the file: sqlite would
            # otherwise make an empty database that looks like real data.
            if not DEV_DB.exists():
                raise RuntimeError(f"{DEV_DB} is missing: restore the corpus source before running answer evals")
            init_adapter(SqliteAdapter(str(DEV_DB)))
            agent = build_agent()
            if agent.llm is None:
                raise RuntimeError("answer=llm needs LLM_PROVIDER and its API key in roadmap-rag-assistant/.env")
            self._agent = agent
            # One loop for the whole run: the RAG engine keeps locks and background sync tasks across calls
            self._loop = asyncio.new_event_loop()
        return self._agent

    async def _collect(self, text: str, thread_id: str) -> list[dict]:
        return [
            ev
            async for ev in self._agent.astream_events(
                {"messages": [{"role": "user", "content": text}], "fast": True},
                config={"configurable": {"thread_id": thread_id}},
            )
        ]

    def answer(self, text: str, history: list[dict], run_as: str | None = None) -> Answer:
        from rag_service.auth import current_actor
        from rag_service.core.augmentation.history import history_store
        from rag_service.pii import mask_pii
        from rag_service.state import session_store

        key = self._cache_key(text, history)
        if self._cache_on:
            hit = self._load_cache().get(key)
            if hit is not None:
                return Answer(text=hit["text"], behavior=hit["behavior"], citations=hit["citations"])

        self._get_agent()
        thread_id = f"eval-{uuid.uuid4()}"
        # Earlier turns go straight into memory, masked as the agent stores them, so a sample tests how
        # the answer uses history without replaying (and paying for) every earlier turn.
        for turn in history:
            history_store.append(thread_id, turn["role"], mask_pii(turn["content"]))
        # Visitors cannot write, so an eval can never change the database
        token = current_actor.set("owner" if run_as == "owner" else "visitor")
        try:
            events = self._loop.run_until_complete(self._collect(text, thread_id))
        finally:
            current_actor.reset(token)
            session_store.clear(thread_id)

        reply = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
        steps = {e["id"]: e for e in events if e.get("type") == "step" and e.get("status") != "running"}
        # The LLM was rate limited or down: the template/context answer is not what this sample measures.
        # Checked before caching, so a fallback is never stored as if it were the model's answer.
        reason = steps.get("answer", {}).get("fallback_reason")
        if reason in ("rate_limited", "llm_error"):
            raise TargetUnavailable(reason)
        answer_obj = Answer(text=reply, behavior=self._behavior(reply, steps), citations=self._citations(events))
        if self._cache_on:
            self._store_cache(key, answer_obj)
        return answer_obj

    def _cache_key(self, text: str, history: list[dict]) -> str:
        """Model, code, corpus and the exact question: change any of them and the answer is recomputed."""
        payload = {
            "model": settings.llm_model,
            "code": _code_fingerprint(),
            "corpus": self.corpus_fingerprint()["sha256"],
            "text": text,
            "history": history,
        }
        return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

    def _load_cache(self) -> dict:
        if self._cache is None:
            self._cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
        return self._cache

    def _store_cache(self, key: str, answer: Answer) -> None:
        cache = self._load_cache()
        cache[key] = {"text": answer.text, "behavior": answer.behavior, "citations": answer.citations}
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    @staticmethod
    def _behavior(reply: str, steps: dict) -> str:
        intent = steps.get("route", {}).get("intent")
        mode = steps.get("answer", {}).get("mode")
        if reply.strip() == SENSITIVE_REPLY.strip() or intent == "out_of_scope" or mode == "no_match":
            return "refuse"
        if reply.strip() == MIXED_INTENT_REPLY.strip() or mode == "unclear":
            return "clarify"
        return "answer"

    def _citations(self, events: list[dict]) -> list[str]:
        """Corpus section_ids of the sources the answer links to (from the pipeline's metadata event)."""
        doc_ids = {doc["source_id"]: doc["doc_id"] for doc in self._load()[1]}
        meta = next((e for e in reversed(events) if e.get("type") == "metadata"), {})
        return [doc_ids[s["id"]] for s in meta.get("sources", []) if s.get("cited") and s["id"] in doc_ids]

    def corpus_fingerprint(self) -> dict:
        documents = self._load()[1]
        return {"source": "prisma/dev.db", "doc_count": len(documents), "sha256": content_hash(documents)}


def build_target(mode: str = "hybrid", answer: str = "off", cache: str = "on") -> RoadmapTarget:
    return RoadmapTarget(mode=mode, answer=answer, cache=cache)
