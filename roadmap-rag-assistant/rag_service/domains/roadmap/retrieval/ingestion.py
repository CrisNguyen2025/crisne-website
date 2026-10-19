"""Knowledge Ingestion Pipeline — Extracts and flattens live Roadmap database entities.

Extracts all Roadmaps, Layers, Groups, and Items (including Lexical rich-text HTML)
from the database, strips HTML markup, and flattens them into structured
searchable knowledge documents.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from rag_service.adapters.sqlite_adapter import SqliteAdapter


class KnowledgeDocument(BaseModel):
    id: str = Field(..., description="Entity ID in database (UUIDv7)")
    doc_type: str = Field(..., description="'topic' | 'layer' | 'item'")
    title: str = Field(..., description="Title of the entity")
    topic_slug: str = Field(..., description="Slug of the parent Roadmap topic")
    topic_title: str = Field(..., description="Display title of the Roadmap topic")
    layer_tag: Optional[str] = Field(None, description="e.g. '01-DB', '02-LLM'")
    layer_title: Optional[str] = Field(None, description="Title of the parent layer")
    level: Optional[str] = Field("core", description="core | intermediate | advanced")
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
        """Fetch all roadmaps, layers, groups, and items from the database."""
        docs: List[KnowledgeDocument] = []

        active_adapter = self.adapter
        try:
            full_topics = await active_adapter.export_full_hierarchy()
        except Exception as exc:
            err_str = str(exc).lower()
            if any(k in err_str for k in ["connection", "connect", "timeout", "network", "errno"]):
                from rag_service.adapters.sqlite_adapter import SqliteAdapter
                active_adapter = SqliteAdapter()
                try:
                    full_topics = await active_adapter.export_full_hierarchy()
                except Exception:
                    full_topics = []
            else:
                full_topics = []

        if not full_topics:
            try:
                topics = await active_adapter.list_topics()
                for t in topics:
                    slug = t.get("slug", "")
                    ft = await active_adapter.get_topic(slug)
                    if ft:
                        full_topics.append(ft)
            except Exception:
                pass

        for full_topic in full_topics:
            slug = full_topic.get("slug", "")
            topic_title = full_topic.get("title", "")
            topic_desc = full_topic.get("description", "")
            topic_code = full_topic.get("shortCode", "")

            # 1. Topic Document
            topic_search_text = f"Lộ trình Chủ đề Topic: {topic_title} (Mã: {topic_code}). {topic_desc}".strip()
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

            layers = full_topic.get("layers", [])
            for layer in layers:
                layer_id = layer.get("id", "")
                layer_tag = layer.get("shortTag", "")
                layer_title = layer.get("title", "")
                layer_subtitle = layer.get("subtitle", "")

                # 2. Layer Document
                layer_search_text = (
                    f"Mảng kiến thức Layer: [{layer_tag}] {layer_title} trong Lộ trình {topic_title}. "
                    f"{layer_subtitle}"
                ).strip()
                docs.append(
                    KnowledgeDocument(
                        id=layer_id,
                        doc_type="layer",
                        title=layer_title,
                        topic_slug=slug,
                        topic_title=topic_title,
                        layer_tag=layer_tag,
                        layer_title=layer_title,
                        description=layer_subtitle,
                        searchable_text=layer_search_text,
                    )
                )

                # Groups and items
                for group in layer.get("groups", []):
                    group_level = group.get("level", "core")
                    group_title = group.get("title", "")
                    items = group.get("items", [])

                    for item in items:
                        item_id = item.get("id", "")
                        item_title = item.get("title", "")
                        item_desc = item.get("description", "")
                        raw_content = item.get("content", "")
                        clean_content = strip_html(raw_content)

                        # 3. Item / Lesson Document
                        item_search_text = (
                            f"Bài học Mục Item: {item_title}. "
                            f"Lộ trình: {topic_title} ({slug}) -> Layer: [{layer_tag}] {layer_title} -> Group: {group_title} ({group_level}). "
                            f"Mô tả: {item_desc}. "
                            f"Nội dung chi tiết: {clean_content}"
                        ).strip()

                        docs.append(
                            KnowledgeDocument(
                                id=item_id,
                                doc_type="item",
                                title=item_title,
                                topic_slug=slug,
                                topic_title=topic_title,
                                layer_tag=layer_tag,
                                layer_title=layer_title,
                                level=group_level,
                                description=item_desc,
                                content_text=clean_content[:1500],  # truncated for retrieval context
                                searchable_text=item_search_text,
                            )
                        )

        return docs
