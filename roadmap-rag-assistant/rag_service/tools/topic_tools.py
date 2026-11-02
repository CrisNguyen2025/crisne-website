"""Topic CUD tools for the LangChain agent (ADR-0009). A topic is created empty; lessons follow.

Tools:
  - create_topic       : Create a single topic
  - create_topics_batch: Batch-create multiple topics at once
  - list_topics        : List all existing topics
  - delete_topic       : Delete a topic by slug
"""

from __future__ import annotations

from langchain.tools import tool
from pydantic import BaseModel, Field
from rag_service.adapters.errors import DuplicateEntityError, with_skipped as _with_skipped


# ── Pydantic Input Schemas ───────────────────────────────────────────────


class CreateTopicInput(BaseModel):
    """Input for creating a new topic."""

    title: str = Field(description="Tên topic, ví dụ: 'AI Engineering'")
    description: str = Field(default="", description="Mô tả ngắn về topic (tùy chọn)")


class CreateTopicsBatchInput(BaseModel):
    """Input for batch-creating multiple topics."""

    topics: list[dict] = Field(
        description=(
            "Danh sách các topic cần tạo. Mỗi phần tử là dict có key: "
            "'title' (bắt buộc), 'description' (tùy chọn). "
            "Ví dụ: [{'title': 'AI'}, {'title': 'Backend'}]"
        )
    )


class DeleteTopicInput(BaseModel):
    """Input for deleting a topic."""

    slug: str = Field(description="Slug của topic cần xóa, ví dụ: 'ai-engineering'")


# ── Tool Definitions ────────────────────────────────────────────────────


@tool(args_schema=CreateTopicInput)
async def create_topic(title: str, description: str = "") -> str:
    """Tạo một Topic mới trong hệ thống. Bài học được thêm sau.

    Ví dụ: 'tạo topic AI Engineering', 'thêm roadmap Backend'.
    """
    from rag_service.tools import get_adapter

    try:
        result = await get_adapter().create_topic(title, description)
    except DuplicateEntityError as dup:
        return f"ℹ️ Topic '{dup.title}' đã có (slug: {dup.existing.get('slug', 'N/A')}), không tạo thêm."
    return f"✅ Đã tạo topic '{result.get('title', title)}' (slug: {result.get('slug', 'N/A')})"


@tool(args_schema=CreateTopicsBatchInput)
async def create_topics_batch(topics: list[dict]) -> str:
    """Tạo nhiều Topic cùng lúc.

    Ví dụ: 'tạo cho tôi 3 topic A, B và C', 'tạo 5 roadmap: X, Y, Z, W, V'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    results: list[str] = []
    skipped: list[str] = []
    for t in topics:
        raw_title = t.get("title", "")
        try:
            result = await adapter.create_topic(raw_title, t.get("description", ""))
        except DuplicateEntityError as dup:
            skipped.append(dup.title)
            continue
        results.append(result.get("title", raw_title))
    return _with_skipped(f"✅ Đã tạo {len(results)} topic: {', '.join(results)}", skipped)


@tool
async def list_topics() -> str:
    """Liệt kê tất cả Topic hiện có trong hệ thống.

    Sử dụng khi cần xem danh sách topic, tìm slug trước khi thao tác,
    hoặc kiểm tra topic đã tồn tại chưa.
    """
    from rag_service.tools import get_adapter

    topics = await get_adapter().list_topics()
    if not topics:
        return "📋 Hiện website chưa có lộ trình (topic) nào."
    lines = [f"- {t['title']} (slug: {t['slug']}, bài: {t.get('_count', {}).get('items', '?')})" for t in topics]
    return f"📋 Có {len(topics)} topic:\n" + "\n".join(lines)


@tool(args_schema=DeleteTopicInput)
async def delete_topic(slug: str) -> str:
    """Xóa một Topic theo slug, cùng toàn bộ bài học bên trong.

    Ví dụ: 'xóa topic ai-engineering', 'delete roadmap sss'.
    """
    from rag_service.tools import get_adapter

    if await get_adapter().delete_topic(slug):
        return f"🗑️ Đã xóa topic '{slug}' và toàn bộ bài học bên trong."
    return f"❌ Không tìm thấy topic có slug '{slug}'."
