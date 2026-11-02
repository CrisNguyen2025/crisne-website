"""Lesson (item) and section CUD tools for the LangChain agent (ADR-0009).

A lesson belongs to a topic and may name a section (mục) of it. Tools:
  - create_item        : Add one lesson to a topic, optionally into a section
  - create_items_batch : Add several lessons at once
  - import_items_from_text: Add the lessons of a pasted list
  - update_item        : Change a lesson's title, description or section
  - rename_section     : Rename a section of a topic
  - delete_item        : Delete a lesson by ID
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Optional

from langchain.tools import tool
from pydantic import BaseModel, Field
from rag_service.adapters.errors import DuplicateEntityError, with_skipped as _with_skipped

if TYPE_CHECKING:
    from rag_service.execution.changes import ChangeSet


# ── Pydantic Input Schemas ───────────────────────────────────────────────


class CreateItemInput(BaseModel):
    """Input for creating a new lesson."""

    topic: str = Field(description="Topic chứa bài: slug hoặc tên topic, ví dụ 'ai-engineering'")
    title: str = Field(description="Tên bài, ví dụ: 'Prompt Engineering'")
    section: str = Field(
        default="",
        description=(
            "Mục của topic (tùy chọn). Mục đã có sẽ được dùng lại; mục mới sẽ được tạo. "
            "Để trống khi người dùng không nêu mục."
        ),
    )
    description: str = Field(default="", description="Mô tả ngắn cho bài")
    content: str = Field(default="", description="Nội dung chi tiết (HTML/markdown) nếu người dùng cung cấp")


class ImportItemsFromTextInput(BaseModel):
    """Input for importing many lessons from a pasted list."""

    topic: str = Field(description="Topic nhận các bài: slug hoặc tên topic")
    section: str = Field(default="", description="Mục chung cho các bài; để trống khi người dùng không nêu")
    text: str = Field(description="Danh sách bài, mỗi dòng một bài (bullet '-', '*', '•' hoặc số thứ tự)")


class CreateItemsBatchInput(BaseModel):
    """Input for batch-creating several lessons in one topic."""

    topic: str = Field(description="Topic chứa các bài: slug hoặc tên topic")
    section: str = Field(default="", description="Mục chung cho tất cả bài trong batch; để trống khi không nêu")
    items: list[dict] = Field(
        description=(
            "Danh sách bài cần tạo. Mỗi phần tử là dict có key: "
            "'title' (bắt buộc), 'description' (tùy chọn). "
            "Ví dụ: [{'title': 'Prompt Engineering'}, {'title': 'LangChain Basics'}]"
        )
    )


class UpdateItemInput(BaseModel):
    """Input for updating a lesson."""

    item_id: str = Field(description="ID của bài cần cập nhật")
    title: str = Field(default="", description="Tên mới (để trống nếu không đổi)")
    description: str = Field(default="", description="Mô tả mới (để trống nếu không đổi)")
    section: str = Field(
        default="",
        description="Mục để chuyển bài sang (để trống nếu không chuyển)",
    )


class RenameSectionInput(BaseModel):
    """Input for renaming a section of a topic."""

    topic: str = Field(description="Topic có mục cần đổi tên: slug hoặc tên topic")
    from_name: str = Field(description="Tên mục hiện tại")
    to_name: str = Field(description="Tên mục mới; trùng mục có sẵn thì hai mục được gộp")


class DeleteItemInput(BaseModel):
    """Input for deleting a lesson."""

    item_id: str = Field(description="ID của bài cần xóa")


# ── Helpers ──────────────────────────────────────────────────────────────


async def _topic_or_message(identifier: str):
    """(slug, None) for the topic, or (None, message) when it cannot be used."""
    from rag_service.tools.topic_resolver import describe_unresolved_topic, resolve_topic

    res = await resolve_topic(identifier)
    if res.status == "found" and res.slug:
        return res.slug, None
    return None, describe_unresolved_topic(identifier, res)


# ── Tool Definitions ────────────────────────────────────────────────────


@tool(args_schema=CreateItemInput)
async def create_item(
    topic: str,
    title: str,
    section: str = "",
    description: str = "",
    content: str = "",
) -> str:
    """Thêm một bài học vào một Topic, tuỳ chọn vào một mục của topic.

    Ví dụ: 'thêm bài Prompt Engineering vào topic AI Engineering mục RAG'.
    """
    from rag_service.tools import get_adapter

    slug, message = await _topic_or_message(topic)
    if slug is None:
        return message or ""
    adapter = get_adapter()
    try:
        result = await adapter.create_item(slug, section, title, description, content)
    except DuplicateEntityError as dup:
        return f"ℹ️ Bài học '{dup.title}' đã có trong topic '{slug}', không tạo thêm."
    where = f" mục {result.get('section')}" if result.get("section") else ""
    return f"✅ Đã thêm bài '{result.get('title', title)}' vào topic '{slug}'{where}"


@tool(args_schema=CreateItemsBatchInput)
async def create_items_batch(
    topic: str,
    items: list[dict],
    section: str = "",
    changes: Optional["ChangeSet"] = None,
) -> str:
    """Thêm nhiều bài học cùng lúc vào một Topic.

    Ví dụ: 'thêm 3 bài: Vector DB, Embeddings, RAG Pipeline vào topic AI Engineering mục Core'.
    """
    from rag_service.tools import get_adapter

    slug, message = await _topic_or_message(topic)
    if slug is None:
        return message or ""
    adapter = get_adapter()
    created: list[str] = []
    skipped: list[str] = []
    for item in items:
        item_title = item.get("title", "")
        try:
            result = await adapter.create_item(slug, section, item_title, item.get("description", ""), item.get("content", ""))
        except DuplicateEntityError as dup:
            skipped.append(dup.title)
            if changes is not None:
                changes.skip(dup.title)
            continue
        created.append(result.get("title", item_title))
        if changes is not None:
            changes.created(result.get("title", item_title), result)
    section_note = f" vào mục {section}" if section else ""
    return _with_skipped(f"✅ Đã thêm {len(created)} bài{section_note}: {', '.join(created)}", skipped)


_LIST_LINE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(.+?)\s*$")


def parse_item_list(text: str) -> list[str]:
    """Return titles from bullet or numbered lines. Plain lines are ignored to avoid guessing."""
    titles: list[str] = []
    for line in text.splitlines():
        m = _LIST_LINE.match(line)
        if m and m.group(1).strip():
            titles.append(m.group(1).strip())
    return titles


@tool(args_schema=ImportItemsFromTextInput)
async def import_items_from_text(
    topic: str, text: str, section: str = "", changes: Optional["ChangeSet"] = None
) -> str:
    """Nhập nhiều bài từ một danh sách dán vào, mỗi dòng bắt đầu bằng '-' hoặc số thứ tự.

    Ví dụ: 'thêm các bài sau vào topic AI Engineering:\\n- Docker\\n- Kubernetes'.
    """
    titles = parse_item_list(text)
    if not titles:
        return "⚠️ Không tìm thấy dòng bài nào. Hãy dùng dạng '- Tên bài' hoặc '1. Tên bài' mỗi dòng."
    return await create_items_batch.coroutine(
        topic=topic, section=section, items=[{"title": t} for t in titles], changes=changes
    )


@tool(args_schema=UpdateItemInput)
async def update_item(
    item_id: str,
    title: str = "",
    description: str = "",
    section: str = "",
) -> str:
    """Cập nhật bài học, hoặc chuyển bài sang mục khác của cùng topic.

    Ví dụ: 'đổi tên bài xyz thành ABC', 'chuyển bài xyz sang mục Production'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    kwargs: dict = {}
    if title:
        kwargs["title"] = title
    if description:
        kwargs["description"] = description
    if section:
        kwargs["section"] = section
    try:
        result = await adapter.update_item(item_id, **kwargs)
    except DuplicateEntityError as dup:
        return f"ℹ️ Topic đã có bài '{dup.title}', không đổi tên."
    return f"✅ Đã cập nhật bài '{result.get('title', item_id)}'"


@tool(args_schema=RenameSectionInput)
async def rename_section(topic: str, from_name: str, to_name: str) -> str:
    """Đổi tên một mục của topic. Mọi bài trong mục chuyển sang tên mới.

    Ví dụ: 'đổi tên mục RAG thành Retrieval trong topic AI Engineering'.
    """
    from rag_service.tools import get_adapter

    slug, message = await _topic_or_message(topic)
    if slug is None:
        return message or ""
    try:
        result = await get_adapter().update_section(slug, from_name, to_name)
    except ValueError as exc:
        return f"⚠️ {exc}"
    return f"✅ Đã đổi tên mục '{from_name}' thành '{result.get('section') or to_name}' ({result.get('renamed', 0)} bài)"


@tool(args_schema=DeleteItemInput)
async def delete_item(item_id: str) -> str:
    """Xóa một bài học theo ID.

    Ví dụ: 'xóa bài có ID xyz'.
    """
    from rag_service.tools import get_adapter

    success = await get_adapter().delete_item(item_id)
    if success:
        return f"🗑️ Đã xóa bài '{item_id}'."
    return f"❌ Không thể xóa bài '{item_id}'."
