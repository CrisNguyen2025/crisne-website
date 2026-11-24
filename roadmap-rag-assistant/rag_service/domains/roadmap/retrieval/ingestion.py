"""Knowledge Ingestion Pipeline — Extracts and flattens live Roadmap database entities.

Extracts all Roadmaps, Layers, Groups, and Items (including Lexical rich-text HTML)
from the database, strips HTML markup, and flattens them into structured
searchable knowledge documents.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class KnowledgeDocument(BaseModel):
    id: str = Field(..., description="Entity ID in database (UUIDv7); a chunk is '<lesson id>::<n>'")
    doc_type: str = Field(..., description="'topic' | 'item' | 'chunk' (one h2/h3 section of a lesson)")
    title: str = Field(..., description="Title of the entity")
    topic_slug: str = Field(..., description="Slug of the parent Roadmap topic")
    topic_title: str = Field(..., description="Display title of the Roadmap topic")
    item_slug: Optional[str] = Field(None, description="Slug of the lesson item")
    section: Optional[str] = Field(None, description="The lesson's section (mục) of the topic, items only (ADR-0009)")
    description: Optional[str] = Field("", description="Summary description")
    content_text: Optional[str] = Field("", description="Plain text extracted from Lexical HTML")
    searchable_text: str = Field(..., description="Combined text representation for indexing")
    parent_id: Optional[str] = Field(None, description="Chunks only: id of the lesson the chunk belongs to")
    anchor: Optional[str] = Field(None, description="Chunks only: heading id of its section (ADR-0014), None before the first heading")
    heading: Optional[str] = Field(None, description="Chunks only: text of that heading")
    passages: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Set on a copy of a lesson by search: its best matching chunks as {anchor, heading, text}",
    )

    @property
    def fts_kind(self) -> str:
        """The doc type as the full-text index sees it. Empty for chunks: a question about "chunking" must not
        match every chunk through its type word."""
        return "" if self.doc_type == "chunk" else self.doc_type


# A lesson whose plain text fits in this many characters, with no heading, is indexed as one document;
# longer or sectioned lessons also get one document per chunk, so every part of them can be found and quoted.
ITEM_CONTEXT_CHARS = 1200


def _needs_chunks(chunks: List[dict], clean_content: str) -> bool:
    return any(c.get("anchor") for c in chunks) or len(clean_content) > ITEM_CONTEXT_CHARS


def _chunk_documents(item_doc: "KnowledgeDocument", chunks: List[dict]) -> List["KnowledgeDocument"]:
    """One document per chunk of full-export's `chunks` (anchors computed by Next.js, never here)."""
    docs = []
    for n, chunk in enumerate(chunks):
        text = (chunk.get("text") or "").strip()
        if not text:
            continue
        heading = (chunk.get("heading") or "").strip() or None
        label = f"{item_doc.title} › {heading}" if heading else item_doc.title
        docs.append(
            KnowledgeDocument(
                id=f"{item_doc.id}::{n}",
                doc_type="chunk",
                title=item_doc.title,
                topic_slug=item_doc.topic_slug,
                topic_title=item_doc.topic_title,
                item_slug=item_doc.item_slug,
                section=item_doc.section,
                content_text=text,
                searchable_text=f"{label}: {text}",
                parent_id=item_doc.id,
                anchor=chunk.get("anchor") or None,
                heading=heading,
            )
        )
    return docs


def strip_html(html_str: Optional[str]) -> str:
    """Strip HTML tags and unescape common entities to extract clean readable text."""
    if not html_str:
        return ""
    text = re.sub(r"<style[\s\S]*?</style>", " ", html_str, flags=re.IGNORECASE)
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _format_topic_overview(topic: dict) -> str:
    """Summarize a topic's lesson count and section breakdown from its items."""
    items = topic.get("items") or []
    if not items:
        return ""
    from rag_service.domains.roadmap.sections import GENERAL_SECTION, section_counts

    counts = section_counts(topic)
    if not any(name for name, _ in counts):
        return f"Tổng số bài: {len(items)} bài học (chưa chia mục)."
    parts = ", ".join(f"{name or GENERAL_SECTION} ({n} bài)" for name, n in counts)
    return f"Tổng số bài: {len(items)} bài học. Các mục: {parts}."


class DatabaseIngestionWorker:
    """Syncs live data from Prisma SQLite / HTTP adapter into KnowledgeDocuments."""

    def __init__(self, adapter: Optional[Any] = None) -> None:
        self._adapter = adapter

    @property
    def adapter(self) -> Any:
        if self._adapter is not None:
            return self._adapter
        from rag_service.tools import get_adapter
        return get_adapter()

    async def ingest_all(self) -> List[KnowledgeDocument]:
        """Fetch all roadmaps, layers, groups, and items from the database.

        An empty list means the roadmap is empty. A source that cannot be read raises, so the caller keeps
        its index; reading another database instead (prisma/dev.db) would index content the site does not have.
        """
        docs: List[KnowledgeDocument] = []
        full_topics = await self.adapter.export_full_hierarchy()

        for full_topic in full_topics:
            slug = full_topic.get("slug", "")
            topic_title = full_topic.get("title", "")
            topic_desc = (full_topic.get("description") or "").strip()
            topic_overview = _format_topic_overview(full_topic)

            # 1. Topic document
            topic_search_text = " ".join(
                part for part in (f"Lộ trình Chủ đề Topic: {topic_title}.", topic_desc, topic_overview) if part
            )
            docs.append(
                KnowledgeDocument(
                    id=full_topic.get("id", slug),
                    doc_type="topic",
                    title=topic_title,
                    topic_slug=slug,
                    topic_title=topic_title,
                    description=topic_desc,
                    content_text=topic_overview[:1500],
                    searchable_text=topic_search_text,
                )
            )

            # 2. Lesson documents, in page order; each names its section, or none
            for item in full_topic.get("items", []):
                item_id = item.get("id", "")
                item_title = item.get("title", "")
                item_desc = (item.get("description") or "").strip()
                section = item.get("section") or None
                clean_content = strip_html(item.get("content", ""))

                item_search_text = (
                    f"Bài học Mục Item: {item_title}. "
                    f"Lộ trình: {topic_title} ({slug})"
                    + (f" -> Mục: {section}" if section else "")
                    + f". Mô tả: {item_desc}. Nội dung chi tiết: {clean_content}"
                ).strip()

                item_doc = KnowledgeDocument(
                    id=item_id,
                    doc_type="item",
                    title=item_title,
                    topic_slug=slug,
                    topic_title=topic_title,
                    item_slug=item.get("slug") or None,
                    section=section,
                    description=item_desc,
                    content_text=clean_content[:1500],  # truncated for retrieval context
                    searchable_text=item_search_text,
                )
                docs.append(item_doc)

                # Sources without chunks (an older Next.js, the SQLite adapter) index lessons whole, as before
                chunks = item.get("chunks") or []
                if chunks and _needs_chunks(chunks, clean_content):
                    docs.extend(_chunk_documents(item_doc, chunks))

        return docs

    async def index_version(self) -> Optional[str]:
        """Fingerprint of the source (GET /api/v1/roadmaps/index-version); None when it cannot say."""
        read = getattr(self.adapter, "index_version", None)
        if read is None:
            return None
        try:
            return await read()
        except Exception:
            return None
