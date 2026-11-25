"""Hybrid RAG Engine — knowledge retrieval over the live roadmap: Roadmaps, Layers, Groups and Items
(including rich-text content)."""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any, List, Optional, Tuple

from rag_service.domains.roadmap.retrieval.ingestion import (
    ITEM_CONTEXT_CHARS,
    DatabaseIngestionWorker,
    KnowledgeDocument,
)
from rag_service.core.retrieval.hybrid import HybridVectorStore

# Next.js reports its roadmap writes (POST /internal/reindex → request_reindex). Edits that skip its API
# (scripts, direct DB edits) never do, so the index is also rebuilt in the background once it is this old.
INDEX_TTL_SECONDS = 30.0
# A chat turn waits at most this long for the first index. Under quota the re-index can take minutes (each
# document retries its embedding); past this the turn answers from what is indexed and the sync keeps running.
SYNC_WAIT_SECONDS = 3.0


THIN_DOC_MIN_WORDS = 4


def is_thin(doc: KnowledgeDocument) -> bool:
    """A doc with almost no text of its own (e.g. a lesson titled "2").

    Its embedding is mostly ingestion boilerplate ("Bài học Mục Item…", "Lộ trình…"), so it sits
    close to every roadmap question and its cosine score means nothing; match it by name only.
    """
    own = f"{doc.title} {doc.description or ''} {doc.content_text or ''}"
    return len(re.findall(r"\w+", own)) < THIN_DOC_MIN_WORDS


# FTS5 columns of the roadmap index (the order is the table's column order). The type column reads `fts_kind`,
# which is the doc type for topics and lessons and empty for chunks.
ROADMAP_TEXT_FIELDS = (
    "fts_kind", "title", "topic_slug", "topic_title", "section", "description", "content_text", "searchable_text",
)


def roadmap_store(db_path: str = ":memory:") -> HybridVectorStore:
    """The hybrid index configured with the roadmap's thin-document rule and columns."""
    return HybridVectorStore(db_path, thin=is_thin, text_fields=ROADMAP_TEXT_FIELDS)


def knowledge_href(doc: KnowledgeDocument, anchor: Optional[str] = None) -> str:
    """Page link for a retrieved document (ADR-0014): a lesson is /[topic_slug]/[item_slug], a topic /[topic_slug].

    Like lessonPath in lib/roadmap/paths.ts, a lesson without a topic slug falls back to /lessons/[item_slug],
    which 308s to the canonical path. `anchor` (a heading id from full-export's chunks) links one section.
    """
    if doc.doc_type == "item" and (doc.item_slug or doc.id):
        item_slug = doc.item_slug or doc.id
        href = f"/{doc.topic_slug}/{item_slug}" if doc.topic_slug else f"/lessons/{item_slug}"
        return f"{href}#{anchor}" if anchor else href
    return f"/{doc.topic_slug}"


# Characters of a matched chunk, and of a lesson without chunks, that reach the model's context
PASSAGE_CONTEXT_CHARS = 900  # a whole chunk (CHUNK_MAX_CHARS in lib/roadmap/content-utils.ts)
# Chunks of one lesson quoted per answer, and how many hits to fetch before folding chunks into lessons
MAX_PASSAGES_PER_LESSON = 2
SEARCH_POOL_FACTOR = 3


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def lesson_context_lines(doc: KnowledgeDocument) -> List[str]:
    """What the model reads of a lesson's content: its matched chunks, or the content itself
    (shared by format_knowledge_context and profile._roadmap_document)."""
    if doc.passages:
        return [
            f"Đoạn \"{passage.get('heading') or 'Mở đầu'}\": {_clip(passage.get('text') or '', PASSAGE_CONTEXT_CHARS)}"
            for passage in doc.passages
        ]
    if doc.content_text:
        return [f"Nội dung: {_clip(doc.content_text, ITEM_CONTEXT_CHARS)}"]
    return []


def lesson_href(doc: KnowledgeDocument) -> str:
    """Link of a retrieved lesson: the section of its best matched chunk when it has one (ADR-0014 anchor)."""
    anchor = doc.passages[0].get("anchor") if doc.passages else None
    return knowledge_href(doc, anchor)


def _is_index_meta(doc: KnowledgeDocument) -> bool:
    """Topics and lessons; chunks only serve passage search and stay out of catalogs, vocabularies and centroids."""
    return doc.doc_type != "chunk"


class HybridRagEngine:
    """Search over the live roadmap, kept in step with its source."""

    def __init__(self) -> None:
        self._ingestion_worker = DatabaseIngestionWorker()
        self._vector_store = roadmap_store()
        self._is_synced = False
        self._synced_at = 0.0
        self._last_error: Optional[str] = None
        # Bumped by request_reindex; the index is current once _indexed_generation catches up
        self._change_generation = 0
        self._indexed_generation = 0
        self._sync_lock = asyncio.Lock()
        self._sync_task: Optional[asyncio.Task] = None
        self._embed_lock = asyncio.Lock()
        self._embed_task: Optional[asyncio.Task] = None
        # Source fingerprint read before the last successful sync; None when the source cannot give one
        self._indexed_version: Optional[str] = None
        self._last_sync_ms: Optional[float] = None
        self._version_checks_skipped = 0
        self._check_task: Optional[asyncio.Task] = None

    async def _source_version(self) -> Optional[str]:
        read = getattr(self._ingestion_worker, "index_version", None)
        if read is None:
            return None
        try:
            return await read()
        except Exception:
            return None

    async def sync_live_database(self) -> int:
        """Sync and re-index all live Roadmaps, Layers, Groups, and Items.

        Phase 1: Ingests documents and swaps FTS5 index and cached vectors immediately.
        Phase 2: Missing embeddings run in the background.

        An empty roadmap empties the index. A source that cannot be read keeps the previous index:
        dropping it would make the assistant deny lessons that still exist.
        """
        async with self._sync_lock:
            generation = self._change_generation
            started = time.monotonic()
            # Read before the export: a write landing mid-sync changes the version, so the next check re-syncs
            version = await self._source_version()
            try:
                docs = await self._ingestion_worker.ingest_all()
                await asyncio.to_thread(self._vector_store.index_documents, docs)
            except Exception as exc:
                self._last_error = type(exc).__name__
                print(f"[HybridRagEngine] Error syncing live database, keeping the previous index: {exc}")
                return 0
            self._is_synced = True
            self._synced_at = time.monotonic()
            self._last_sync_ms = round((self._synced_at - started) * 1000, 1)
            self._indexed_version = version
            self._indexed_generation = generation
            self._last_error = None
            print(f"[HybridRagEngine] Successfully indexed {len(docs)} live database documents!")
            self._start_background_embedding()
            return len(docs)

    def _start_background_embedding(self) -> None:
        if self._vector_store.vectors_pending == 0:
            return
        if self._embed_task is None or self._embed_task.done():
            self._embed_task = asyncio.create_task(self._run_embed_worker())

    async def _run_embed_worker(self) -> None:
        async with self._embed_lock:
            while True:
                current_gen = self._vector_store.generation
                if self._vector_store.vectors_pending == 0:
                    break
                try:
                    await asyncio.to_thread(self._vector_store.embed_missing_documents, current_gen)
                    if self._last_error and self._last_error.startswith("embedding:"):
                        self._last_error = None
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    self._last_error = f"embedding:{type(exc).__name__}"
                    print(f"[HybridRagEngine] Background embedding warning ({exc}). Partial vectors kept; rest uses FTS5.")
                    break

                if self._vector_store.generation == current_gen or self._vector_store.vectors_pending == 0:
                    break

    async def wait_for_embedding(self) -> None:
        task = self._embed_task
        if task and not task.done():
            await task

    def request_reindex(self) -> None:
        """The source changed: rebuild now, and let the next turn wait briefly for the new index."""
        self._change_generation += 1
        self._start_sync()

    def is_current(self) -> bool:
        return self._is_synced and self._indexed_generation >= self._change_generation

    def index_status(self) -> dict:
        """Freshness and metrics for GET /health."""
        return {
            "synced": self._is_synced,
            "current": self.is_current(),
            "documents": len(getattr(self._vector_store, "_docs_map", {})),
            "age_seconds": (
                round(max(0.0, time.monotonic() - self._synced_at), 2)
                if self._is_synced and self._synced_at > 0
                else None
            ),
            "last_error": self._last_error,
            "vectors_pending": getattr(self._vector_store, "vectors_pending", 0),
            "chunks": sum(1 for d in getattr(self._vector_store, "_docs_map", {}).values() if d.doc_type == "chunk"),
            "last_sync_ms": self._last_sync_ms,
            "version_checks_skipped": self._version_checks_skipped,
        }

    def is_empty(self) -> bool:
        """The roadmap was read and holds nothing. False while the first index is still unknown."""
        return self._is_synced and not self._vector_store._docs_map

    async def ensure_fresh(self) -> None:
        """Gate for every read of the index (search, catalog, link targets).

        First index or a reported change: wait up to SYNC_WAIT_SECONDS for the rebuild.
        Older than INDEX_TTL_SECONDS: answer from the current index and, in the background, re-read the source
        only if its version changed since the last sync (or it cannot say).
        """
        if not self.is_current():
            self._start_sync()
            if self._sync_task is not None:
                await asyncio.wait({self._sync_task}, timeout=SYNC_WAIT_SECONDS)
        elif time.monotonic() - self._synced_at > INDEX_TTL_SECONDS:
            self._start_freshness_check()

    def _start_freshness_check(self) -> None:
        def _is_busy(task: Optional[asyncio.Task[Any]]) -> bool:
            return task is not None and not task.done()

        if _is_busy(self._sync_task) or _is_busy(self._check_task):
            return
        if self._indexed_version is None:
            # The source gave no version at the last sync (none to compare): re-read it, as before versions
            self._start_sync()
            return
        self._check_task = asyncio.create_task(self._check_source_version())

    async def _check_source_version(self) -> None:
        """TTL refresh: a source whose version is unchanged needs no full export; anything else re-syncs."""
        version = await self._source_version()
        if version is not None and version == self._indexed_version and self.is_current():
            self._synced_at = time.monotonic()
            self._version_checks_skipped += 1
            return
        self._start_sync()

    def _start_sync(self) -> None:
        """One sync task at a time; a change reported while it runs is picked up by the same task."""
        if not (self._sync_task and not self._sync_task.done()):
            self._sync_task = asyncio.create_task(self._sync_until_current())

    async def _sync_until_current(self) -> None:
        while True:
            before = self._indexed_generation
            await self.sync_live_database()
            # Stop once current, or when this attempt failed (the next turn or the TTL retries)
            if self._indexed_generation >= self._change_generation or self._indexed_generation == before:
                return

    async def search_live_knowledge(self, query: str, limit: int = 5) -> List[Tuple[KnowledgeDocument, float]]:
        """Search topics and lessons, every section of a lesson included.

        Chunk hits are folded into their lesson: the result holds topics and lessons only, as before, and a lesson
        found through its chunks carries them in `passages` (best first) so the answer can quote and link them.
        A lesson ranks at its best hit, whether that was the lesson itself or one of its chunks.
        """
        await self.ensure_fresh()
        docs = self._vector_store._docs_map  # snapshot: a background re-index may swap the maps mid-search
        if not self._has_chunks(docs):
            # Same call as before chunks existed: a wider pool would re-weigh the RRF fusion for no gain
            return self._vector_store.hybrid_search(query, limit=limit)
        hits = self._vector_store.hybrid_search(query, limit=limit * SEARCH_POOL_FACTOR)
        return fold_chunks(hits, docs, limit)

    def _has_chunks(self, docs: dict) -> bool:
        if getattr(self, "_chunks_of", None) is not docs:
            self._chunks_present = any(d.doc_type == "chunk" for d in docs.values())
            self._chunks_of = docs
        return self._chunks_present

    def known_item_ids(self) -> set[str]:
        """Ids of every item in the current index (valid targets for `&item=` links)."""
        return {d.id for d in self._vector_store._docs_map.values() if d.doc_type == "item"}

    def known_item_slugs(self) -> set[str]:
        """Slugs of every item in the current index (valid lesson targets: `/<topic>/<lesson>`, `/lessons/<lesson>`)."""
        return {d.item_slug for d in self._vector_store._docs_map.values() if d.doc_type == "item" and d.item_slug}

    def title_vocabulary(self) -> set[str]:
        """Technical terms in indexed titles, for routing statements that name a lesson ("LLM", "chunking").

        Only ASCII words of 3+ letters: Vietnamese syllables in titles ("giá" in "Đánh giá") are too common
        to say a message is about a lesson.
        """
        from rag_service.domains.roadmap.retrieval.relevance import title_terms

        words: set[str] = set()
        for doc in self._vector_store._docs_map.values():
            if _is_index_meta(doc):
                words |= title_terms(doc.title)
        return words

    def start_background_sync(self) -> None:
        """Index at startup, in the background: the first chat turn does not have to wait for it."""
        if not self._is_synced:
            self._start_sync()

    async def _wait_for_index(self) -> None:
        """Wait for the first index, for SYNC_WAIT_SECONDS at most. The sync itself keeps running after that."""
        if self._is_synced:
            return
        self.start_background_sync()
        if self._sync_task is not None:
            await asyncio.wait({self._sync_task}, timeout=SYNC_WAIT_SECONDS)

    async def catalog(self):
        """Names of the roadmap's topics and lessons, for grounding a change (target_grounding.py)."""
        from rag_service.domains.roadmap.router.target_grounding import Catalog

        await self.ensure_fresh()
        docs = self._vector_store._docs_map
        if getattr(self, "_catalog_of", None) is not docs:
            self._catalog = Catalog.from_documents(docs.values())
            self._catalog_of = docs
        return self._catalog

    async def query_vector(self, text: str):
        """The query embedding the search will use (cached, so the search does not embed it again); None offline."""
        from rag_service.core.retrieval.hybrid import _QUERY_VECTORS

        cached = _QUERY_VECTORS.get(text)
        if cached is not None:
            return cached
        embedder = self._vector_store._get_embedder()
        if embedder is None:
            return None
        try:
            vec = await asyncio.to_thread(embedder.embed_query, text)
        except Exception:
            return None
        _QUERY_VECTORS.put(text, vec)
        return vec

    def centroids(self):
        """Domain signals from the indexed vectors (scope_centroid.py); None without embeddings. Rebuilt after a sync."""
        from rag_service.domains.roadmap.retrieval.scope_centroid import DomainCentroids

        docs = self._vector_store._docs_map
        if getattr(self, "_centroids_of", None) is not docs:
            self._centroids = DomainCentroids.from_store(self._vector_store)
            self._centroids_of = docs
        return self._centroids

    def corpus_vocabulary(self) -> set[str]:
        """Content words of the current index, for the on-topic gate; rebuilt after each sync."""
        from rag_service.domains.roadmap.retrieval.relevance import corpus_vocabulary

        docs = self._vector_store._docs_map
        if getattr(self, "_vocabulary_of", None) is not docs:
            self._vocabulary = corpus_vocabulary(d for d in docs.values() if _is_index_meta(d))
            self._vocabulary_of = docs
        return self._vocabulary

    def known_topic_slugs(self) -> set[str]:
        """Slugs of every roadmap in the current index (valid topic targets: `/<topic>`, `/topic/<topic>`)."""
        return {d.topic_slug for d in self._vector_store._docs_map.values() if d.topic_slug}

    def format_knowledge_context(self, matches: List[Tuple[KnowledgeDocument, float]]) -> str:
        """Format retrieved live knowledge into structured markdown context for the LLM."""
        if not matches:
            return "Không tìm thấy tài liệu phù hợp trong cơ sở dữ liệu hệ thống."

        lines = ["### 📚 Thông Tin Tìm Thấy Trong Hệ Thống:"]
        for doc, _score in matches:
            if doc.doc_type == "item":
                lines.append(
                    f"\n#### 📖 Bài học: [{doc.title}]({lesson_href(doc)})\n"
                    f"- **Lộ trình:** {doc.topic_title} (`{doc.topic_slug}`)\n"
                    f"- **Mục:** {doc.section or 'Chung'}\n"
                    f"- **Mô tả:** {doc.description or 'Chưa có mô tả'}\n"
                )
                lines.extend(f"- {line}" for line in lesson_context_lines(doc))
            elif doc.doc_type == "topic":
                lines.append(
                    f"\n#### 🗺️ Lộ trình (Topic): [{doc.title}]({knowledge_href(doc)})\n"
                    + (f"- **Mô tả:** {doc.description}\n" if doc.description else "")
                    + (f"- **Cấu trúc lộ trình:** {doc.content_text}\n" if doc.content_text else "")
                )

        return "\n".join(lines)


def fold_chunks(
    hits: List[Tuple[KnowledgeDocument, float]], docs: dict, limit: int
) -> List[Tuple[KnowledgeDocument, float]]:
    """Ranked hits → topics and lessons only, each once, at its best rank; chunks become their lesson's passages."""
    order: List[str] = []
    scores: dict = {}
    passages: dict = {}
    for doc, score in hits:
        key = doc.parent_id if doc.doc_type == "chunk" else doc.id
        if not key or key not in docs:
            continue  # a chunk whose lesson left the index in a swap
        if key not in scores:
            order.append(key)
            scores[key] = score
        if doc.doc_type == "chunk" and len(passages.setdefault(key, [])) < MAX_PASSAGES_PER_LESSON:
            passages[key].append({"anchor": doc.anchor, "heading": doc.heading, "text": doc.content_text or ""})

    results = []
    for key in order[:limit]:
        doc = docs[key]
        if passages.get(key):
            doc = doc.model_copy(update={"passages": passages[key]})
        results.append((doc, scores[key]))
    return results


# Global singleton instance
rag_engine = HybridRagEngine()
MiniRagEngine = HybridRagEngine
