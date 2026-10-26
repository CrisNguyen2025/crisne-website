"""Hybrid Vector & Full-Text Search Store.

Uses SQLite FTS5 for BM25 keyword retrieval combined with vector embeddings
(Google gemini-embedding-001 or TF-IDF/cosine similarity) via Reciprocal Rank Fusion (RRF).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import math
import os
import re
import sqlite3
import time
from collections import OrderedDict
from typing import Any, Callable, List, Optional, Sequence, Tuple

from rag_service.config import settings


EMBEDDING_CACHE_PATH = Path(__file__).resolve().parents[2] / "data" / "embedding_cache.json"
EMBEDDING_MODEL = "models/gemini-embedding-001"
# Seconds between embed requests (~90/min, under the 100/min free-tier limit)
EMBEDDING_REQUEST_INTERVAL = 0.67
# Query embeddings kept in memory (one embed request saved per repeated question)
QUERY_CACHE_SIZE = 512
# Hybrid results below this cosine similarity are dropped. On tests/eval_retrieval.py the lowest
# relevant match scored 0.688 and the highest unrelated query 0.654. Re-check with the eval
# when changing the embedding model.
VECTOR_MIN_SIMILARITY = 0.665
# Text columns of the FTS table when a domain does not name its own
DEFAULT_TEXT_FIELDS = ("title", "searchable_text")

# Question words and fillers that match nearly every document under BM25 OR-queries.
# words such as "bài", "website", "trang" describe the site itself; a domain's searchable_text may repeat them.
FTS_STOPWORDS = {
    "là", "gì", "của", "và", "các", "những", "cho", "có", "không", "được", "trong", "về", "với",
    "này", "đó", "thế", "nào", "sao", "làm", "như", "một", "bao", "nhiêu", "hãy", "giúp", "tôi",
    "mình", "bạn", "ạ", "nhé", "the", "a", "an", "is", "what", "how", "of", "to", "in", "for",
    "hay", "hoặc", "bài", "website", "web", "trang", "any", "or", "and", "are", "there",
}


# Docs whose own words (title + description + content) are fewer than this are "thin".
# Documents this short are matched by name only (see the domain's thin rule)


def _embedding_key(text: str) -> str:
    """Cache key covers both the text and the model, so switching models invalidates old vectors."""
    return hashlib.sha1(f"{EMBEDDING_MODEL}\n{text[:1000]}".encode("utf-8")).hexdigest()


def _load_embedding_cache() -> dict:
    try:
        return json.loads(EMBEDDING_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save_embedding_cache(cache: dict) -> None:
    try:
        EMBEDDING_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        EMBEDDING_CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")
    except OSError as exc:
        print(f"[VectorStore] Could not write embedding cache: {exc}")



def _embed_with_quota_retry(embedder, text: str, attempts: int = 8) -> list[float]:
    """Embed one text; on a 429 quota error wait for the window to reset and retry."""
    for attempt in range(1, attempts + 1):
        try:
            return embedder.embed_documents([text])[0]
        except Exception as exc:
            if "RESOURCE_EXHAUSTED" not in str(exc) or attempt == attempts:
                raise
            time.sleep(40)
    raise RuntimeError("unreachable")

class RotatingEmbeddings:
    """Several embedding keys: a rate-limited key hands the call to the next (as llm_keys does for chat).

    Without it one exhausted free-tier key turned every search into FTS5 only (embedding_degraded).
    """

    def __init__(self, embedders: List[Any]) -> None:
        self._embedders = embedders
        self._current = 0

    def _call(self, method: str, arg: Any) -> Any:
        from rag_service.llm_keys import is_rate_limited

        last: Optional[BaseException] = None
        for step in range(len(self._embedders)):
            i = (self._current + step) % len(self._embedders)
            try:
                result = getattr(self._embedders[i], method)(arg)
                self._current = i
                return result
            except Exception as exc:
                if not is_rate_limited(exc):
                    raise
                last = exc
        raise last  # type: ignore[misc]

    def embed_query(self, text: str) -> List[float]:
        return self._call("embed_query", text)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._call("embed_documents", texts)


class _QueryVectorCache:
    """Recent query embeddings in memory, so a repeated question costs no embed request.

    Kept apart from the document cache: a query is embedded with embed_query, a document with
    embed_documents, and the two give different vectors for the same text.
    """

    def __init__(self, size: int = QUERY_CACHE_SIZE) -> None:
        self._size = size
        self._items: "OrderedDict[str, List[float]]" = OrderedDict()

    def get(self, query: str) -> Optional[List[float]]:
        key = _embedding_key(query)
        vec = self._items.get(key)
        if vec is not None:
            self._items.move_to_end(key)
        return vec

    def put(self, query: str, vec: List[float]) -> None:
        self._items[_embedding_key(query)] = vec
        self._items.move_to_end(_embedding_key(query))
        while len(self._items) > self._size:
            self._items.popitem(last=False)

    def clear(self) -> None:
        self._items.clear()


_QUERY_VECTORS = _QueryVectorCache()


# The warning is printed at most this often; every degraded turn is still flagged in its trace
DEGRADED_LOG_INTERVAL = 60.0
_last_degraded_log = [0.0]


def _flag_degraded(reason: str) -> None:
    from rag_service.observability import current_trace

    now = time.monotonic()
    if now - _last_degraded_log[0] > DEGRADED_LOG_INTERVAL:
        _last_degraded_log[0] = now
        print(f"[VectorStore] Query embedding unavailable ({reason}); searching with FTS5 only.")
    if (trace := current_trace()) is not None:
        trace.flags["embedding_degraded"] = True


def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


class HybridVectorStore:
    """In-memory or persistent SQLite FTS5 + Vector hybrid index."""

    def __init__(
        self,
        db_path: str = ":memory:",
        thin: Optional[Callable[[Any], bool]] = None,
        min_similarity: float = VECTOR_MIN_SIMILARITY,
        text_fields: Sequence[str] = DEFAULT_TEXT_FIELDS,
    ) -> None:
        """`thin(doc)` marks documents to match by name only; the domain supplies it (None = none are thin).

        `text_fields` are the document attributes stored and searched by FTS5, in that order. A domain
        passes its own list; `searchable_text` must be one of them (it is embedded).
        """
        if "searchable_text" not in text_fields:
            raise ValueError("text_fields must include 'searchable_text'")
        self._db_path = db_path
        self._thin = thin or (lambda doc: False)
        self._min_similarity = min_similarity
        self._fields = tuple(text_fields)
        self._embedder = None
        self._docs_map: dict[str, Any] = {}
        self._vectors: dict[str, List[float]] = {}
        self.conn = self._connect()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        with conn:
            conn.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(
                    id UNINDEXED,
                    {columns},
                    tokenize = 'unicode61'
                )
                """.format(columns=",\n                    ".join(self._fields))
            )
        return conn

    def _get_embedder(self):
        if self._embedder is not None:
            return self._embedder
        from rag_service.llm_keys import parse_keys

        keys = parse_keys(
            settings.gemini_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "",
            settings.gemini_api_keys or os.environ.get("GEMINI_API_KEYS", ""),
        )
        if keys:
            try:
                from langchain_google_genai import GoogleGenerativeAIEmbeddings

                embedders = [GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL, google_api_key=k) for k in keys]
                self._embedder = embedders[0] if len(embedders) == 1 else RotatingEmbeddings(embedders)
            except Exception as exc:
                print(f"[VectorStore] Embeddings init warning: {exc}")
        return self._embedder

    def index_documents(self, docs: List[Any]) -> None:
        """Index a batch of Anys into FTS5 and vector store.

        Builds a fresh index and swaps it in at the end, so searches running while a
        background re-sync is in progress keep using the previous, complete index.
        """
        conn = self._connect() if self._db_path == ":memory:" else self.conn
        docs_map: dict[str, Any] = {}
        vectors: dict[str, List[float]] = {}

        with conn:
            conn.execute("DELETE FROM fts_docs")
            for d in docs:
                docs_map[d.id] = d
                placeholders = ", ".join("?" * (len(self._fields) + 1))
                conn.execute(
                    f"INSERT INTO fts_docs (id, {', '.join(self._fields)}) VALUES ({placeholders})",
                    (d.id, *(getattr(d, f) or "" for f in self._fields)),
                )

        embedder = self._get_embedder()
        if embedder is not None:
            cache = _load_embedding_cache()
            keys = [_embedding_key(d.searchable_text) for d in docs]
            missing = [i for i, k in enumerate(keys) if k not in cache]
            try:
                # Only embed texts not yet cached. Free tier allows ~100 embed requests/min,
                # so pace requests and save progress; the next start continues where this stopped.
                for n, i in enumerate(missing, start=1):
                    vec = _embed_with_quota_retry(embedder, docs[i].searchable_text[:1000])
                    cache[keys[i]] = vec
                    if n % 20 == 0:
                        _save_embedding_cache(cache)
                    time.sleep(EMBEDDING_REQUEST_INTERVAL)
                _save_embedding_cache(cache)
            except Exception as exc:
                _save_embedding_cache(cache)
                print(f"[VectorStore] Vector embedding generation warning ({exc}). Partial vectors kept; rest uses FTS5.")
            for d, k in zip(docs, keys):
                if k in cache:
                    vectors[d.id] = cache[k]

        self.conn, self._docs_map, self._vectors = conn, docs_map, vectors

    def search_fts(self, query: str, limit: int = 10) -> List[Tuple[Any, float]]:
        """Search via SQLite FTS5 BM25 ranking."""
        all_tokens = re.findall(r"\w+", query.lower())
        # Keep stopwords only when the query has nothing else (e.g. a one-word query).
        tokens = [t for t in all_tokens if t not in FTS_STOPWORDS] or all_tokens
        if not tokens:
            return []

        # Construct FTS5 query: token1 OR token2 OR prefix*
        match_query = " OR ".join([f'"{t}"' for t in tokens])
        cur = self.conn.cursor()
        try:
            cur.execute(
                """
                SELECT id, rank FROM fts_docs
                WHERE fts_docs MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                (match_query, limit),
            )
            rows = cur.fetchall()
            results = []
            for r in rows:
                doc_id = r["id"]
                score = abs(float(r["rank"]))  # FTS5 rank is negative
                if doc_id in self._docs_map:
                    results.append((self._docs_map[doc_id], score))
            return results
        except sqlite3.OperationalError:
            # Fallback to simple LIKE
            cur.execute(
                """
                SELECT id FROM fts_docs
                WHERE title LIKE ? OR searchable_text LIKE ?
                LIMIT ?
                """,
                (f"%{query}%", f"%{query}%", limit),
            )
            rows = cur.fetchall()
            return [(self._docs_map[r["id"]], 1.0) for r in rows if r["id"] in self._docs_map]

    def _similarities(self, query: str) -> dict[str, float] | None:
        """Cosine similarity of the query to every embedded doc; None when vectors are unavailable.

        With an embedder configured, None means the search runs on FTS5 alone: the trace is flagged
        `embedding_degraded` so those turns can be found.
        """
        embedder = self._get_embedder()
        if not embedder:
            return None
        if not self._vectors:
            _flag_degraded("no document vectors")
            return None
        q_emb = _QUERY_VECTORS.get(query)
        if q_emb is None:
            try:
                q_emb = embedder.embed_query(query)
            except Exception as exc:
                _flag_degraded(f"{type(exc).__name__}: {str(exc)[:120]}")
                return None
            _QUERY_VECTORS.put(query, q_emb)
        return {
            doc_id: _cosine_similarity(q_emb, emb)
            for doc_id, emb in self._vectors.items()
            if doc_id in self._docs_map
        }

    def search_vector(self, query: str, limit: int = 10) -> List[Tuple[Any, float]]:
        """Search via dense vector cosine similarity."""
        sims = self._similarities(query)
        if not sims:
            return []
        scored = sorted(sims.items(), key=lambda x: x[1], reverse=True)[:limit]
        return [(self._docs_map[doc_id], sim) for doc_id, sim in scored]

    def hybrid_search(self, query: str, limit: int = 5) -> List[Tuple[Any, float]]:
        """Combine FTS5 BM25 and Vector Search using Reciprocal Rank Fusion (RRF).

        With embeddings, docs below the similarity threshold are dropped, so an unrelated query
        returns nothing instead of the closest unrelated docs. Without them it is FTS only.
        """
        docs = self._docs_map  # snapshot: a background re-index may swap the maps mid-search
        fts_res = self.search_fts(query, limit=limit * 2)
        sims = self._similarities(query)
        if not sims:
            return fts_res[:limit]

        def relevant(doc: Any) -> bool:
            # Docs left unembedded (e.g. quota ran out mid-index) cannot be judged, so keep them.
            return doc.id not in sims or sims[doc.id] >= self._min_similarity

        fts_res = [(d, s) for d, s in fts_res if relevant(d)]
        # Thin documents only count when the query names them (FTS); never on cosine alone.
        top = sorted(
            ((i, s) for i, s in sims.items() if i in docs and not self._thin(docs[i])),
            key=lambda x: x[1],
            reverse=True,
        )[: limit * 2]
        vec_res = [(docs[i], s) for i, s in top if s >= self._min_similarity]

        if not vec_res:
            return fts_res[:limit]
        if not fts_res:
            return vec_res[:limit]

        # RRF Scoring: Score = 1 / (60 + rank)
        rrf_scores: dict[str, float] = {}
        for rank, (doc, _) in enumerate(fts_res):
            rrf_scores[doc.id] = rrf_scores.get(doc.id, 0.0) + (1.0 / (60.0 + rank + 1.0))
        for rank, (doc, _) in enumerate(vec_res):
            rrf_scores[doc.id] = rrf_scores.get(doc.id, 0.0) + (1.0 / (60.0 + rank + 1.0))

        sorted_ids = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
        by_id = {d.id: d for d, _ in fts_res + vec_res}
        return [(by_id[doc_id], score) for doc_id, score in sorted_ids[:limit]]
