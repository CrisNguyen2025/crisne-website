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
    id: str = Field(..., description="Entity ID in database (UUIDv7)")
    doc_type: str = Field(..., description="'topic' | 'item'")
    title: str = Field(..., description="Title of the entity")
    topic_slug: str = Field(..., description="Slug of the parent Roadmap topic")
    topic_title: str = Field(..., description="Display title of the Roadmap topic")
    section: Optional[str] = Field(None, description="The lesson's section (mục) of the topic, items only (ADR-0009)")
    description: Optional[str] = Field("", description="Summary description")
    content_text: Optional[str] = Field("", description="Plain text extracted from Lexical HTML")
    searchable_text: str = Field(..., description="Combined text representation for indexing")


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
            topic_desc = full_topic.get("description", "")

            # 1. Topic document
            topic_search_text = f"Lộ trình Chủ đề Topic: {topic_title}. {topic_desc}".strip()
            docs.append(
                KnowledgeDocument(
                    id=full_topic.get("id", slug),
                    doc_type="topic",
                    title=topic_title,
                    topic_slug=slug,
                    topic_title=topic_title,
                    description=topic_desc,
                    searchable_text=topic_search_text,
                )
            )

            # 2. Lesson documents, in page order; each names its section, or none
            for item in full_topic.get("items", []):
                item_id = item.get("id", "")
                item_title = item.get("title", "")
                item_desc = item.get("description", "")
                section = item.get("section") or None
                clean_content = strip_html(item.get("content", ""))

                item_search_text = (
                    f"Bài học Mục Item: {item_title}. "
                    f"Lộ trình: {topic_title} ({slug})"
                    + (f" -> Mục: {section}" if section else "")
                    + f". Mô tả: {item_desc}. Nội dung chi tiết: {clean_content}"
                ).strip()

                docs.append(
                    KnowledgeDocument(
                        id=item_id,
                        doc_type="item",
                        title=item_title,
                        topic_slug=slug,
                        topic_title=topic_title,
                        section=section,
                        description=item_desc,
                        content_text=clean_content[:1500],  # truncated for retrieval context
                        searchable_text=item_search_text,
                    )
                )

        return docs
