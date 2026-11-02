"""Hybrid RAG Engine — knowledge retrieval over the live roadmap: Roadmaps, Layers, Groups and Items
(including rich-text content)."""

from __future__ import annotations

import asyncio
import re
import time
from typing import List, Optional, Tuple

from rag_service.domains.roadmap.retrieval.ingestion import DatabaseIngestionWorker, KnowledgeDocument
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


# FTS5 columns of the roadmap index (the order is the table's column order)
ROADMAP_TEXT_FIELDS = (
    "doc_type", "title", "topic_slug", "topic_title", "section", "description", "content_text", "searchable_text",
)


def roadmap_store(db_path: str = ":memory:") -> HybridVectorStore:
    """The hybrid index configured with the roadmap's thin-document rule and columns."""
    return HybridVectorStore(db_path, thin=is_thin, text_fields=ROADMAP_TEXT_FIELDS)


def knowledge_href(doc: KnowledgeDocument) -> str:
    """Page link for a retrieved document: items open the lesson itself (?item= accepts its id)."""
    if doc.doc_type == "item" and doc.id:
        return f"/?topic={doc.topic_slug}&item={doc.id}"
    return f"/?topic={doc.topic_slug}"


class HybridRagEngine:
    """Search over the live roadmap, kept in step with its source."""

    def __init__(self) -> None:
        self._ingestion_worker = DatabaseIngestionWorker()
        self._vector_store = roadmap_store()
        self._is_synced = False
        self._synced_at = 0.0
        # Bumped by request_reindex; the index is current once _indexed_generation catches up
        self._change_generation = 0
        self._indexed_generation = 0
        self._sync_lock = asyncio.Lock()
        self._sync_task: Optional[asyncio.Task] = None

    async def sync_live_database(self) -> int:
        """Sync and re-index all live Roadmaps, Layers, Groups, and Items.

        An empty roadmap empties the index. A source that cannot be read keeps the previous index:
        dropping it would make the assistant deny lessons that still exist.
        """
        async with self._sync_lock:
            generation = self._change_generation
            try:
                docs = await self._ingestion_worker.ingest_all()
                # Embedding new docs is paced with time.sleep: keep it off the event loop
                await asyncio.to_thread(self._vector_store.index_documents, docs)
            except Exception as exc:
                print(f"[HybridRagEngine] Error syncing live database, keeping the previous index: {exc}")
                return 0
            self._is_synced = True
            self._synced_at = time.monotonic()
            self._indexed_generation = generation
            print(f"[HybridRagEngine] Successfully indexed {len(docs)} live database documents!")
            return len(docs)

    def request_reindex(self) -> None:
        """The source changed: rebuild now, and let the next turn wait briefly for the new index."""
        self._change_generation += 1
        self._start_sync()

    def is_current(self) -> bool:
        return self._is_synced and self._indexed_generation >= self._change_generation

    def is_empty(self) -> bool:
        """The roadmap was read and holds nothing. False while the first index is still unknown."""
        return self._is_synced and not self._vector_store._docs_map

    async def ensure_fresh(self) -> None:
        """Gate for every read of the index (search, catalog, link targets).

        First index or a reported change: wait up to SYNC_WAIT_SECONDS for the rebuild.
        Older than INDEX_TTL_SECONDS: answer from the current index and refresh for the next turn.
        """
        if not self.is_current():
            self._start_sync()
            await asyncio.wait({self._sync_task}, timeout=SYNC_WAIT_SECONDS)
        elif time.monotonic() - self._synced_at > INDEX_TTL_SECONDS:
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
        """Search across live database entities (Roadmaps, Layers, Items, Content)."""
        await self.ensure_fresh()
        return self._vector_store.hybrid_search(query, limit=limit)

    def known_item_ids(self) -> set[str]:
        """Ids of every item in the current index (valid targets for `&item=` links)."""
        return {d.id for d in self._vector_store._docs_map.values() if d.doc_type == "item"}

    def title_vocabulary(self) -> set[str]:
        """Technical terms in indexed titles, for routing statements that name a lesson ("LLM", "chunking").

        Only ASCII words of 3+ letters: Vietnamese syllables in titles ("giá" in "Đánh giá") are too common
        to say a message is about a lesson.
        """
        from rag_service.domains.roadmap.retrieval.relevance import title_terms

        words: set[str] = set()
        for doc in self._vector_store._docs_map.values():
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
            self._vocabulary = corpus_vocabulary(docs.values())
            self._vocabulary_of = docs
        return self._vocabulary

    def known_topic_slugs(self) -> set[str]:
        """Slugs of every roadmap in the current index (valid targets for `/?topic=` links)."""
        return {d.topic_slug for d in self._vector_store._docs_map.values() if d.topic_slug}

    def format_knowledge_context(self, matches: List[Tuple[KnowledgeDocument, float]]) -> str:
        """Format retrieved live knowledge into structured markdown context for the LLM."""
        if not matches:
            return "Không tìm thấy tài liệu phù hợp trong cơ sở dữ liệu hệ thống."

        lines = ["### 📚 Thông Tin Tìm Thấy Trong Hệ Thống:"]
        for doc, score in matches:
            if doc.doc_type == "item":
                lines.append(
                    f"\n#### 📖 Bài học: [{doc.title}]({knowledge_href(doc)})\n"
                    f"- **Lộ trình:** {doc.topic_title} (`{doc.topic_slug}`)\n"
                    f"- **Mục:** {doc.section or 'Chung'}\n"
                    f"- **Mô tả:** {doc.description or 'Chưa có mô tả'}\n"
                )
                if doc.content_text:
                    lines.append(f"- **Nội dung tóm tắt:** {doc.content_text[:300]}...")
            elif doc.doc_type == "topic":
                lines.append(
                    f"\n#### 🗺️ Lộ trình (Topic): [{doc.title}](/?topic={doc.topic_slug})\n"
                    + (f"- **Mô tả:** {doc.description}\n" if doc.description else "")
                )

        return "\n".join(lines)


# Global singleton instance
rag_engine = HybridRagEngine()
MiniRagEngine = HybridRagEngine
