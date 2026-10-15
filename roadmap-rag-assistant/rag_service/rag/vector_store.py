"""Hybrid Vector & Full-Text Search Store for Roadmap Knowledge.

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
from typing import List, Optional, Tuple

from rag_service.config import settings
from rag_service.rag.ingestion import KnowledgeDocument


EMBEDDING_CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "embedding_cache.json"
EMBEDDING_MODEL = "models/gemini-embedding-001"
# Seconds between embed requests (~90/min, under the 100/min free-tier limit)
EMBEDDING_REQUEST_INTERVAL = 0.67
# Hybrid results below this cosine similarity are dropped. On tests/eval_retrieval.py the lowest
# on-topic match scored 0.688 and the highest off-topic query 0.654. Re-check with the eval
# when changing the embedding model.
VECTOR_MIN_SIMILARITY = 0.665

# Question words and fillers that match nearly every document under BM25 OR-queries.
FTS_STOPWORDS = {
    "là", "gì", "của", "và", "các", "những", "cho", "có", "không", "được", "trong", "về", "với",
    "này", "đó", "thế", "nào", "sao", "làm", "như", "một", "bao", "nhiêu", "hãy", "giúp", "tôi",
    "mình", "bạn", "ạ", "nhé", "the", "a", "an", "is", "what", "how", "of", "to", "in", "for",
}


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

def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


class HybridVectorStore:
    """In-memory or persistent SQLite FTS5 + Vector hybrid index."""

    def __init__(self, db_path: str = ":memory:") -> None:
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._embedder = None
        self._docs_map: dict[str, KnowledgeDocument] = {}
        self._vectors: dict[str, List[float]] = {}
        self._init_db()

    def _init_db(self) -> None:
        with self.conn:
            self.conn.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(
                    id UNINDEXED,
                    doc_type,
                    title,
                    topic_slug,
                    topic_title,
                    layer_tag,
                    layer_title,
                    level,
                    description,
                    content_text,
                    searchable_text,
                    tokenize = 'unicode61'
                )
                """
            )

    def _get_embedder(self):
        if self._embedder is not None:
            return self._embedder
        api_key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if api_key and not api_key.startswith("your_"):
            try:
                from langchain_google_genai import GoogleGenerativeAIEmbeddings
                self._embedder = GoogleGenerativeAIEmbeddings(
                    model=EMBEDDING_MODEL,
                    google_api_key=api_key,
                )
            except Exception as exc:
                print(f"[VectorStore] Embeddings init warning: {exc}")
        return self._embedder

    def index_documents(self, docs: List[KnowledgeDocument]) -> None:
        """Index a batch of KnowledgeDocuments into FTS5 and vector store."""
        self._docs_map.clear()
        self._vectors.clear()

        with self.conn:
            self.conn.execute("DELETE FROM fts_docs")
            for d in docs:
                self._docs_map[d.id] = d
                self.conn.execute(
                    """
                    INSERT INTO fts_docs (
                        id, doc_type, title, topic_slug, topic_title,
                        layer_tag, layer_title, level, description,
                        content_text, searchable_text
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        d.id, d.doc_type, d.title, d.topic_slug, d.topic_title,
                        d.layer_tag or "", d.layer_title or "", d.level or "",
                        d.description or "", d.content_text or "", d.searchable_text
                    ),
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
                    self._vectors[d.id] = cache[k]

    def search_fts(self, query: str, limit: int = 10) -> List[Tuple[KnowledgeDocument, float]]:
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
        """Cosine similarity of the query to every embedded doc; None when vectors are unavailable."""
        embedder = self._get_embedder()
        if not embedder or not self._vectors:
            return None
        try:
            q_emb = embedder.embed_query(query)
        except Exception:
            return None
        return {
            doc_id: _cosine_similarity(q_emb, emb)
            for doc_id, emb in self._vectors.items()
            if doc_id in self._docs_map
        }

    def search_vector(self, query: str, limit: int = 10) -> List[Tuple[KnowledgeDocument, float]]:
        """Search via dense vector cosine similarity."""
        sims = self._similarities(query)
        if not sims:
            return []
        scored = sorted(sims.items(), key=lambda x: x[1], reverse=True)[:limit]
        return [(self._docs_map[doc_id], sim) for doc_id, sim in scored]

    def hybrid_search(self, query: str, limit: int = 5) -> List[Tuple[KnowledgeDocument, float]]:
        """Combine FTS5 BM25 and Vector Search using Reciprocal Rank Fusion (RRF).

        With embeddings, docs below VECTOR_MIN_SIMILARITY are dropped, so an off-topic query
        returns nothing instead of the closest unrelated docs. Without them it is FTS only.
        """
        fts_res = self.search_fts(query, limit=limit * 2)
        sims = self._similarities(query)
        if not sims:
            return fts_res[:limit]

        def relevant(doc: KnowledgeDocument) -> bool:
            # Docs left unembedded (e.g. quota ran out mid-index) cannot be judged, so keep them.
            return doc.id not in sims or sims[doc.id] >= VECTOR_MIN_SIMILARITY

        fts_res = [(d, s) for d, s in fts_res if relevant(d)]
        top = sorted(sims.items(), key=lambda x: x[1], reverse=True)[: limit * 2]
        vec_res = [(self._docs_map[i], s) for i, s in top if s >= VECTOR_MIN_SIMILARITY]

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
        return [(self._docs_map[doc_id], score) for doc_id, score in sorted_ids[:limit] if doc_id in self._docs_map]
