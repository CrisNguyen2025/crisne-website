"""Hybrid RAG Engine — Knowledge retrieval for live database and roadmap templates.

Indexes:
1. Live Database: All Roadmaps, Layers, Groups, and Items (including rich-text content).
2. Blueprints: JSON roadmap templates for rapid document and plan generation.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import re
import time
from typing import List, Optional, Tuple

from rag_service.domains.roadmap.retrieval.ingestion import DatabaseIngestionWorker, KnowledgeDocument
from rag_service.core.retrieval.hybrid import HybridVectorStore

# Content edited outside the agent (web UI, Knowledge Triage approve, direct DB edits) never
# notifies this service, so the index is rebuilt in the background once it is this old.
INDEX_TTL_SECONDS = 30.0
# A chat turn waits at most this long for the first index. Under quota the re-index can take minutes (each
# document retries its embedding); past this the turn answers from what is indexed and the sync keeps running.
SYNC_WAIT_SECONDS = 8.0


THIN_DOC_MIN_WORDS = 4


def is_thin(doc: KnowledgeDocument) -> bool:
    """A doc with almost no text of its own (e.g. a layer "General" with no subtitle, an item "2").

    Its embedding is mostly ingestion boilerplate ("Bài học Mục Item…", "Lộ trình…"), so it sits
    close to every roadmap question and its cosine score means nothing; match it by name only.
    """
    own = f"{doc.title} {doc.description or ''} {doc.content_text or ''}"
    return len(re.findall(r"\w+", own)) < THIN_DOC_MIN_WORDS


# FTS5 columns of the roadmap index (the order is the table's column order)
ROADMAP_TEXT_FIELDS = (
    "doc_type", "title", "topic_slug", "topic_title", "layer_tag", "layer_title",
    "level", "description", "content_text", "searchable_text",
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
    """Enterprise RAG engine supporting live database search and blueprint generation."""

    def __init__(self, blueprints_dir: Path | None = None) -> None:
        if blueprints_dir is None:
            blueprints_dir = Path(__file__).resolve().parents[3] / "data" / "blueprints"
        self._blueprints_dir = Path(blueprints_dir)
        self._templates: dict[str, dict] = {}
        self._ingestion_worker = DatabaseIngestionWorker()
        self._vector_store = roadmap_store()
        self._is_synced = False
        self._synced_at = 0.0
        self._sync_lock = asyncio.Lock()
        self._sync_task: Optional[asyncio.Task] = None
        self.reload_blueprints()

    def reload_blueprints(self) -> None:
        """Load or reload all JSON blueprint templates from disk."""
        self._templates.clear()
        if not self._blueprints_dir.exists():
            return

        for p in self._blueprints_dir.glob("*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    tid = data.get("id") or p.stem
                    self._templates[tid] = data
            except Exception as exc:
                print(f"[HybridRagEngine] Error loading template {p}: {exc}")

    async def sync_live_database(self) -> int:
        """Sync and re-index all live Roadmaps, Layers, Groups, and Items."""
        async with self._sync_lock:
            try:
                docs = await self._ingestion_worker.ingest_all()
                # Embedding new docs is paced with time.sleep: keep it off the event loop
                await asyncio.to_thread(self._vector_store.index_documents, docs)
                self._is_synced = True
                self._synced_at = time.monotonic()
                print(f"[HybridRagEngine] Successfully indexed {len(docs)} live database documents!")
                return len(docs)
            except Exception as exc:
                print(f"[HybridRagEngine] Error syncing live database: {exc}")
                return 0

    async def search_live_knowledge(self, query: str, limit: int = 5) -> List[Tuple[KnowledgeDocument, float]]:
        """Search across live database entities (Roadmaps, Layers, Items, Content)."""
        if not self._is_synced:
            await self._wait_for_index()
        elif time.monotonic() - self._synced_at > INDEX_TTL_SECONDS and not (
            self._sync_task and not self._sync_task.done()
        ):
            # Stale-while-revalidate: answer from the current index, refresh for the next query
            self._sync_task = asyncio.create_task(self.sync_live_database())
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
        if not self._is_synced and not (self._sync_task and not self._sync_task.done()):
            self._sync_task = asyncio.create_task(self.sync_live_database())

    async def _wait_for_index(self) -> None:
        """Wait for the first index, for SYNC_WAIT_SECONDS at most. The sync itself keeps running after that."""
        if self._is_synced:
            return
        self.start_background_sync()
        await asyncio.wait({self._sync_task}, timeout=SYNC_WAIT_SECONDS)

    async def catalog(self):
        """Names of the roadmap's topics, layers and lessons, for grounding a change (target_grounding.py)."""
        from rag_service.domains.roadmap.router.target_grounding import Catalog

        await self._wait_for_index()
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
                    f"- **Layer:** [{doc.layer_tag}] {doc.layer_title} (Cấp độ: `{doc.level}`)\n"
                    f"- **Mô tả:** {doc.description or 'Chưa có mô tả'}\n"
                )
                if doc.content_text:
                    lines.append(f"- **Nội dung tóm tắt:** {doc.content_text[:300]}...")
            elif doc.doc_type == "layer":
                lines.append(
                    f"\n#### 📑 Mảng kiến thức: [{doc.layer_tag}] {doc.title}\n"
                    f"- **Thuộc Lộ trình:** {doc.topic_title} (`{doc.topic_slug}`)\n"
                    + (f"- **Chi tiết:** {doc.description}\n" if doc.description else "")
                )
            elif doc.doc_type == "topic":
                lines.append(
                    f"\n#### 🗺️ Lộ trình (Topic): [{doc.title}](/?topic={doc.topic_slug})\n"
                    + (f"- **Mô tả:** {doc.description}\n" if doc.description else "")
                )

        return "\n".join(lines)

    # ── Blueprint Methods for /plan and /goal ─────────────────────────────

    def template_for_goal(self, message: str) -> dict | None:
        """The blueprint whose declared field a learning goal names ("DevOps", "AI engineer", "frontend"), or None.

        Matched against what the template declares about itself, its shortCode and domain keywords, never
        its title: titles hold generic words ("Architecture", "Roadmap", "Master") that any goal may use.
        A new template is matched by filling in its domain, with no word list to keep in step.
        """
        from rag_service.domains.roadmap.retrieval.relevance import fold, technical_terms

        terms = technical_terms(message)
        best, best_hits = None, 0
        for template in self._templates.values():
            declared = f"{template.get('shortCode', '')} {template.get('domain', '')}"
            words = {w for w in re.findall(r"\w+", fold(declared))}
            hits = sum(1 for t in terms if t in words or (len(t) >= 5 and any(len(w) >= 5 and w.startswith(t) for w in words)))
            if hits > best_hits:
                best, best_hits = template, hits
        return best

    def list_templates(self) -> list[dict]:
        return [
            {
                "id": t.get("id", k),
                "title": t.get("title", ""),
                "shortCode": t.get("shortCode", ""),
                "domain": t.get("domain", ""),
                "description": t.get("description", ""),
                "layers_count": len(t.get("layers", [])),
            }
            for k, t in self._templates.items()
        ]

    def get_template(self, template_id: str) -> dict | None:
        if template_id in self._templates:
            return self._templates[template_id]
        query_norm = template_id.lower().strip()
        for k, t in self._templates.items():
            if k.lower() == query_norm or t.get("title", "").lower() == query_norm:
                return t
        return None

    def search_templates(self, query: str, limit: int = 3) -> list[tuple[dict, float]]:
        tokens = set(re.findall(r"\w+", query.lower()))
        if not tokens:
            return [(t, 1.0) for t in list(self._templates.values())[:limit]]

        scored: list[tuple[dict, float]] = []
        for t in self._templates.values():
            score = 0.0
            searchable_text = f"{t.get('title', '')} {t.get('shortCode', '')} {t.get('domain', '')} {t.get('description', '')}".lower()
            doc_tokens = set(re.findall(r"\w+", searchable_text))
            intersection = tokens.intersection(doc_tokens)
            if intersection:
                score = len(intersection) / len(tokens)
                if query.lower() in t.get("title", "").lower() or query.lower() == t.get("shortCode", "").lower():
                    score += 2.0
                scored.append((t, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]

    # Alias for backward compatibility
    search = search_templates

    def format_plan_preview(self, template: dict) -> str:
        lines = [
            f"### 📋 Kế Hoạch Lộ Trình: {template.get('title', 'Tài liệu')}",
            f"- **Short Code**: `{template.get('shortCode', 'DOC')}`",
            f"- **Mô tả**: {template.get('description', '')}",
            f"- **Cấu trúc phân cấp dự kiến**:\n",
        ]

        for i, layer in enumerate(template.get("layers", []), 1):
            lines.append(f"  **Layer {i}: [{layer.get('shortTag', '')}] {layer.get('title', '')}**")
            if layer.get("subtitle"):
                lines.append(f"  _{layer.get('subtitle')}_")
            # Groups are created from item levels on write, so the preview lists items only
            for group in layer.get("groups", []):
                for item in group.get("items", []):
                    lines.append(f"    • {item.get('title', '')}: {item.get('description', '')}")

        return "\n".join(lines)


# Global singleton instance
rag_engine = HybridRagEngine()
MiniRagEngine = HybridRagEngine
