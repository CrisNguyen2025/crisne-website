"""RoadmapTarget: with corpus_export.py, the only modules under evals/ that import rag_service.

Retrieval runs on the knowledge in prisma/dev.db (read only) and reports hits as corpus section_ids;
routing runs the sensitive guard and the heuristic intent router, no LLM and no network.
Answering (opt-in, `--opt answer=llm`) runs the real agent with the configured LLM: it calls the
provider and spends quota, so the default offline run leaves it out.
Judging (opt-in on top of it, `--opt judge=llm`) grades those answers with a judge model from the other provider
than LLM_PROVIDER (google_genai <-> groq, against self-preference bias), or `judge_provider` / `judge_model`.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from pathlib import Path

from evals.corpus_export import DEV_DB, build_documents, load_knowledge, read_existing
from evals.kit import judge as kit_judge
from evals.kit.corpus import content_hash
from evals.kit.target import Answer, Hit, RouteResult, ScopeResult, TargetUnavailable
from rag_service.config import settings
from rag_service.domains.roadmap.retrieval.ingestion import KnowledgeDocument
from rag_service.core.retrieval.hybrid import HybridVectorStore
from rag_service.domains.roadmap.retrieval.engine import roadmap_store
from rag_service.domains.roadmap.retrieval.relevance import corpus_vocabulary, filter_on_topic
from rag_service.domains.roadmap.router.grounding import MIXED_INTENT_REPLY, SENSITIVE_REPLY, is_sensitive_request
from rag_service.domains.roadmap.router.understanding import instruction_part
from rag_service.domains.roadmap.router.intent_router import IntentRouter

MODES = ("fts", "vector", "hybrid")
ANSWER_MODES = ("off", "llm")
DEFAULT_JUDGE_MODELS = {
    # gemini-2.5-pro is closed to new keys (404); Google names this one as its replacement
    "google_genai": "gemini-3.1-pro-preview",
    "groq": "llama-3.3-70b-versatile",
}
CACHE_FILE = Path(__file__).parent / ".cache" / "answers.json"
JUDGE_CACHE_FILE = Path(__file__).parent / ".cache" / "judge.json"
# Code whose change can change an answer; any edit here invalidates the whole cache
CODE_GLOBS = ("rag_service/core/**/*.py", "rag_service/domains/**/*.py")


def _code_fingerprint() -> str:
    root = Path(__file__).resolve().parents[1]
    digest = hashlib.sha256()
    for pattern in CODE_GLOBS:
        for path in sorted(root.glob(pattern)):
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


class JudgeConfigError(RuntimeError):
    """The judge cannot run at all (missing key): fails the run instead of marking every sample unavailable."""


class RoadmapTarget:
    name = "roadmap"
    def __init__(self, mode: str = "hybrid", answer: str = "off", cache: str = "on", gate: str = "off",
                 judge: str = "off", judge_provider: str = "", judge_model: str = "", rerank: str = "off"):
        # rerank=llm reorders retrieval with the chat model, as /chat does with RAG_RERANK=true
        if rerank not in ANSWER_MODES:
            raise ValueError(f"rerank must be one of {ANSWER_MODES}, got {rerank!r}")
        self.rerank = rerank == "llm"
        self._rerank_llm = None
        if cache not in ("on", "off"):
            raise ValueError(f"cache must be 'on' or 'off', got {cache!r}")
        self._cache_on = cache == "on"
        self._cache: dict | None = None
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
        if answer not in ANSWER_MODES:
            raise ValueError(f"answer must be one of {ANSWER_MODES}, got {answer!r}")
        self.mode = mode
        # gate=on applies the chat's on-topic check to retrieval, as /chat does
        if gate not in ("on", "off"):
            raise ValueError(f"gate must be on or off, got {gate!r}")
        self.gate = gate == "on"
        if judge not in ANSWER_MODES:
            raise ValueError(f"judge must be one of {ANSWER_MODES}, got {judge!r}")
        if judge == "llm" and answer != "llm":
            raise ValueError("judge=llm grades live answers, so it needs answer=llm too")
        answer_provider = settings.llm_provider.strip().lower()
        if judge_provider:
            self.judge_provider = judge_provider.strip().lower()
        else:
            # Auto-switch to alternate provider to avoid self-preference bias
            self.judge_provider = "groq" if answer_provider == "google_genai" else "google_genai"

        self.judge_model = judge_model or DEFAULT_JUDGE_MODELS.get(self.judge_provider, settings.llm_model)

        # Fallback provider is the alternate model, never the answer provider: grading its own answers
        # would bring back the self-preference bias, so without one the sample is unavailable instead
        other = "groq" if self.judge_provider == "google_genai" else "google_genai"
        self.fallback_provider = None if other == answer_provider else other
        self.fallback_model = DEFAULT_JUDGE_MODELS[other] if self.fallback_provider else None

        self._judge_llm = None
        self._fallback_judge_llm = None
        self._judge_cache: dict | None = None
        capabilities = {"retrieve", "route", "scope"} | ({"answer"} if answer == "llm" else set())
        self.capabilities = frozenset(capabilities | ({"judge"} if judge == "llm" else set()))
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
            store = roadmap_store()
            if self.mode == "fts":
                store._get_embedder = lambda: None  # type: ignore[method-assign]
            store.index_documents(self._load()[0])
            self._store = store
        return self._store

    def retrieve(self, text: str, k: int, run_as: str | None = None) -> list[Hit]:
        store = self._get_store()
        search = {"fts": store.search_fts, "vector": store.search_vector, "hybrid": store.hybrid_search}[self.mode]
        doc_ids = {doc["source_id"]: doc["doc_id"] for doc in self._load()[1]}
        if self.rerank:
            from rag_service.core.retrieval.rerank import RERANK_POOL, rerank
            from rag_service.domains.roadmap.agent import _PROVIDERS, rerank_text

            if self._rerank_llm is None:
                builder = _PROVIDERS.get(settings.llm_provider.strip().lower())
                self._rerank_llm = builder() if builder else None
                if self._rerank_llm is None:
                    raise RuntimeError("rerank=llm needs LLM_PROVIDER and its API key in roadmap-rag-assistant/.env")
                # One loop for the run: the model's HTTP client is bound to the loop it first ran on
                self._rerank_loop = asyncio.new_event_loop()
            pool = search(text, limit=max(k, RERANK_POOL))
            matches = self._rerank_loop.run_until_complete(rerank(self._rerank_llm, text, pool, rerank_text))[:k]
        else:
            matches = search(text, limit=k)
        if self.gate:
            matches = filter_on_topic(text, matches, corpus_vocabulary(self._load()[0]))
        return [Hit(doc_id=doc_ids[doc.id], section_id=doc_ids[doc.id], score=score) for doc, score in matches]

    def scope(self, text: str, run_as: str | None = None) -> ScopeResult:
        """What the message is about, as the chat decides it before routing."""
        from rag_service.domains.roadmap.router.understanding import understand

        target = understand(text).target.value
        return ScopeResult(target={"off_topic": "external", "roadmap": "roadmap"}.get(target, "none"))

    def route(self, text: str, run_as: str | None = None) -> RouteResult:
        if is_sensitive_request(text, instruction=instruction_part(text)):
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
        if reply.strip().startswith(MIXED_INTENT_REPLY) or mode == "unclear":
            return "clarify"
        return "answer"

    def _citations(self, events: list[dict]) -> list[str]:
        """Corpus section_ids of the answer's sources (the <sources> line, sent in the metadata event).

        Every listed source counts, linked inline or not: the answer no longer links documents in its text.
        """
        doc_ids = {doc["source_id"]: doc["doc_id"] for doc in self._load()[1]}
        meta = next((e for e in reversed(events) if e.get("type") == "metadata"), {})
        return [doc_ids[s["id"]] for s in meta.get("sources", []) if s["id"] in doc_ids]

    def contexts(self, section_ids: list[str]) -> list[str]:
        """Each cited section with the title and placement the agent's context carries (layer, level)."""
        sections = {
            section["section_id"]: (doc, section["text"]) for doc in self._load()[1] for section in doc["sections"]
        }
        texts = []
        for section_id in section_ids:
            if section_id in sections:
                doc, text = sections[section_id]
                meta = doc.get("metadata", {})
                where = ", ".join(str(meta[key]) for key in ("topic", "layer_title", "level") if meta.get(key))
                texts.append(f"{doc['title']} ({where}): {text}" if where else f"{doc['title']}: {text}")
        return texts

    def _build_judge_llm(self, provider: str, model: str):
        if provider == "google_genai":
            from langchain_google_genai import ChatGoogleGenerativeAI
            from rag_service.domains.roadmap.agent import _resolve_gemini_api_key

            api_key = _resolve_gemini_api_key()
            if not api_key:
                return None
            return ChatGoogleGenerativeAI(
                model=model, api_key=api_key, temperature=0, max_retries=1, timeout=60.0,
                response_mime_type="application/json",
            )
        elif provider == "groq":
            from langchain_groq import ChatGroq

            api_key = settings.groq_api_key
            if not api_key:
                return None
            return ChatGroq(
                model=model, api_key=api_key, temperature=0, max_retries=2, timeout=60.0,
                model_kwargs={"response_format": {"type": "json_object"}},
            )
        else:
            raise RuntimeError(f"judge_provider must be google_genai or groq, got {provider!r}")

    def _get_judge_llm(self, fallback: bool = False):
        provider = self.fallback_provider if fallback else self.judge_provider
        model = self.fallback_model if fallback else self.judge_model

        if not fallback and self._judge_llm is not None:
            return self._judge_llm
        if fallback and self._fallback_judge_llm is not None:
            return self._fallback_judge_llm

        llm = self._build_judge_llm(provider, model)
        if not llm:
            raise JudgeConfigError(f"judge=llm needs the {provider} API key in roadmap-rag-assistant/.env")

        if fallback:
            self._fallback_judge_llm = llm
        else:
            self._judge_llm = llm
        return llm

    def _judge_key(self, provider: str | None, model: str | None, prompt: str) -> str:
        payload = {"version": kit_judge.JUDGE_VERSION, "provider": provider, "model": model, "prompt": prompt}
        return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

    def judge(self, prompt: str) -> str:
        primary_key = self._judge_key(self.judge_provider, self.judge_model, prompt)
        cache = self._load_judge_cache() if self._cache_on else {}
        if primary_key in cache:
            return cache[primary_key]

        if self.judge_provider not in ("google_genai", "groq"):
            raise RuntimeError(f"judge_provider must be google_genai or groq, got {self.judge_provider!r}")

        chosen_key = primary_key
        try:
            reply = self._get_judge_llm(fallback=False).invoke(prompt).content
        except Exception as primary_exc:
            limited = any(mark in str(primary_exc) for mark in ("429", "RESOURCE_EXHAUSTED", "rate limit"))
            unavailable = TargetUnavailable("judge_rate_limited" if limited else "judge_error")
            if self.fallback_provider is None:
                if isinstance(primary_exc, JudgeConfigError):
                    raise
                raise unavailable from primary_exc

            # Only when the primary judge fails: a verdict the fallback gave earlier never hides the primary's
            chosen_key = self._judge_key(self.fallback_provider, self.fallback_model, prompt)
            if chosen_key in cache:
                return cache[chosen_key]
            try:
                reply = self._get_judge_llm(fallback=True).invoke(prompt).content
            except Exception as fallback_exc:
                if isinstance(primary_exc, JudgeConfigError) and isinstance(fallback_exc, JudgeConfigError):
                    raise JudgeConfigError(f"{primary_exc}; fallback: {fallback_exc}") from fallback_exc
                raise unavailable from primary_exc

        if isinstance(reply, list):  # some providers return content parts
            reply = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in reply)
        # Checked before caching (raises TargetUnavailable): a broken reply is asked again next run, not replayed
        kit_judge.parse(reply)
        if self._cache_on:
            cache[chosen_key] = reply
            JUDGE_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            JUDGE_CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        return reply

    def _load_judge_cache(self) -> dict:
        if self._judge_cache is None:
            exists = JUDGE_CACHE_FILE.exists()
            self._judge_cache = json.loads(JUDGE_CACHE_FILE.read_text(encoding="utf-8")) if exists else {}
        return self._judge_cache

    def corpus_fingerprint(self) -> dict:
        documents = self._load()[1]
        return {"source": "prisma/dev.db", "doc_count": len(documents), "sha256": content_hash(documents)}


def build_target(mode: str = "hybrid", answer: str = "off", cache: str = "on", gate: str = "off",
                 judge: str = "off", judge_provider: str = "", judge_model: str = "",
                 rerank: str = "off") -> RoadmapTarget:
    return RoadmapTarget(mode=mode, answer=answer, cache=cache, gate=gate,
                         judge=judge, judge_provider=judge_provider, judge_model=judge_model, rerank=rerank)
