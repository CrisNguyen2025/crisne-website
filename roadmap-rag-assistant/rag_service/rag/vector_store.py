"""Hybrid Vector & Full-Text Search Store for Roadmap Knowledge.

Uses SQLite FTS5 for BM25 keyword retrieval combined with vector embeddings
(Google text-embedding-004 or TF-IDF/cosine similarity) via Reciprocal Rank Fusion (RRF).
"""

from __future__ import annotations

import math
import os
import re
import sqlite3
from typing import List, Optional, Tuple

from rag_service.config import settings
from rag_service.rag.ingestion import KnowledgeDocument


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
                    model="models/text-embedding-004",
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
            try:
                texts = [d.searchable_text[:1000] for d in docs]
                # Embed in batches of 50
                batch_size = 50
                all_embeddings: list[list[float]] = []
                for i in range(0, len(texts), batch_size):
                    batch = texts[i:i + batch_size]
                    all_embeddings.extend(embedder.embed_documents(batch))
                for d, emb in zip(docs, all_embeddings):
                    self._vectors[d.id] = emb
            except Exception as exc:
                print(f"[VectorStore] Vector embedding generation warning ({exc}). Using FTS5 search.")

    def search_fts(self, query: str, limit: int = 10) -> List[Tuple[KnowledgeDocument, float]]:
        """Search via SQLite FTS5 BM25 ranking."""
        tokens = re.findall(r"\w+", query.lower())
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

    def search_vector(self, query: str, limit: int = 10) -> List[Tuple[KnowledgeDocument, float]]:
        """Search via dense vector cosine similarity."""
        embedder = self._get_embedder()
        if not embedder or not self._vectors:
            return []
        try:
            q_emb = embedder.embed_query(query)
            scored = []
            for doc_id, emb in self._vectors.items():
                sim = _cosine_similarity(q_emb, emb)
                if doc_id in self._docs_map:
                    scored.append((self._docs_map[doc_id], sim))
            scored.sort(key=lambda x: x[1], reverse=True)
            return scored[:limit]
        except Exception:
            return []

    def hybrid_search(self, query: str, limit: int = 5) -> List[Tuple[KnowledgeDocument, float]]:
        """Combine FTS5 BM25 and Vector Search using Reciprocal Rank Fusion (RRF)."""
        fts_res = self.search_fts(query, limit=limit * 2)
        vec_res = self.search_vector(query, limit=limit * 2)

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
