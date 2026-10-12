"""Topic (Roadmap) CUD tools for the LangChain agent.

Tools:
  - create_topic       : Create a single topic with optional layers
  - create_topics_batch: Batch-create multiple topics at once
  - list_topics        : List all existing topics
  - delete_topic       : Delete a topic by slug
"""

from __future__ import annotations

from langchain.tools import tool
from pydantic import BaseModel, Field


# ── Pydantic Input Schemas ───────────────────────────────────────────────


class CreateTopicInput(BaseModel):
    """Input for creating a new topic/roadmap."""

    title: str = Field(description="Tên topic, ví dụ: 'AI Engineering'")
    short_code: str = Field(
        description="Mã viết tắt 2-4 ký tự viết hoa, ví dụ: 'AI', 'BE', 'FE'"
    )
    description: str = Field(
        default="", description="Mô tả ngắn về topic (tùy chọn)"
    )
    layer_titles: list[str] = Field(
        default_factory=lambda: ["General"],
        description="Danh sách tên các layer ban đầu, ví dụ: ['Foundation', 'Core', 'Advanced']",
    )


class CreateTopicsBatchInput(BaseModel):
    """Input for batch-creating multiple topics."""

    topics: list[dict] = Field(
        description=(
            "Danh sách các topic cần tạo. Mỗi phần tử là dict có key: "
            "'title' (bắt buộc), 'short_code' (tùy chọn, tự suy luận nếu thiếu), "
            "'description' (tùy chọn). "
            "Ví dụ: [{'title': 'AI', 'short_code': 'AI'}, {'title': 'Backend', 'short_code': 'BE'}]"
        )
    )


class DeleteTopicInput(BaseModel):
    """Input for deleting a topic."""

    slug: str = Field(
        description="Slug của topic cần xóa, ví dụ: 'ai-engineering'"
    )


# ── Tool Definitions ────────────────────────────────────────────────────


@tool(args_schema=CreateTopicInput)
async def create_topic(
    title: str,
    short_code: str,
    description: str = "",
    layer_titles: list[str] | None = None,
) -> str:
    """Tạo một Topic/Roadmap mới trong hệ thống.

    Sử dụng khi người dùng muốn tạo MỘT topic, roadmap, hoặc chủ đề mới.
    Ví dụ: 'tạo topic AI Engineering', 'thêm roadmap Backend'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    layers = [
        {"title": t, "shortTag": f"{i + 1:02d}-{t[:3].upper()}"}
        for i, t in enumerate(layer_titles or ["General"])
    ]
    result = await adapter.create_topic(title, short_code, description, layers)
    return (
        f"✅ Đã tạo topic '{result.get('title', title)}' "
        f"(slug: {result.get('slug', 'N/A')})"
    )


@tool(args_schema=CreateTopicsBatchInput)
async def create_topics_batch(topics: list[dict]) -> str:
    """Tạo nhiều Topic/Roadmap cùng lúc (batch).

    Sử dụng khi người dùng yêu cầu tạo NHIỀU topic trong một câu.
    Ví dụ: 'tạo cho tôi 3 topic A, B và C', 'tạo 5 roadmap: X, Y, Z, W, V'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    results: list[str] = []
    for t in topics:
        raw_title = t.get("title", "")
        short_code = t.get("short_code", raw_title[:2].upper() if raw_title else "XX")
        result = await adapter.create_topic(
            raw_title,
            short_code,
            t.get("description", ""),
            [{"title": "General", "shortTag": "01-GEN"}],
        )
        results.append(result.get("title", raw_title))
    return f"✅ Đã tạo {len(results)} topic: {', '.join(results)}"


@tool
async def list_topics() -> str:
    """Liệt kê tất cả Topic/Roadmap hiện có trong hệ thống.

    Sử dụng khi cần xem danh sách topic, tìm slug/id trước khi thao tác,
    hoặc kiểm tra topic đã tồn tại chưa.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    topics = await adapter.list_topics()
    if not topics:
        return "📋 Chưa có topic nào trong hệ thống."
    lines = [
        f"- {t['title']} (slug: {t['slug']}, "
        f"layers: {t.get('_count', {}).get('layers', '?')})"
        for t in topics
    ]
    return f"📋 Có {len(topics)} topic:\n" + "\n".join(lines)


@tool(args_schema=DeleteTopicInput)
async def delete_topic(slug: str) -> str:
    """Xóa một Topic/Roadmap theo slug.

    Cascade xóa toàn bộ layers, groups, items bên trong.
    Ví dụ: 'xóa topic ai-engineering', 'delete roadmap sss'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    success = await adapter.delete_topic(slug)
    if success:
        return f"🗑️ Đã xóa topic '{slug}' và toàn bộ nội dung bên trong."
    return f"❌ Không tìm thấy topic có slug '{slug}'."
