"""Group CUD tools for the LangChain agent.

Tools:
  - create_group : Create a new group inside a layer
  - update_group : Update a group's title
  - delete_group : Delete a group by ID
"""

from __future__ import annotations

from langchain.tools import tool
from pydantic import BaseModel, Field


# ── Pydantic Input Schemas ───────────────────────────────────────────────


class CreateGroupInput(BaseModel):
    """Input for creating a new group."""

    layer_id: str = Field(description="ID của layer chứa group")
    title: str = Field(description="Tên group, ví dụ: 'Core', 'Advanced'")
    level: str = Field(
        default="",
        description=(
            "Level identifier, ví dụ: 'core', 'intermediate', 'advanced'. "
            "Để trống sẽ tự suy luận từ title."
        ),
    )


class UpdateGroupInput(BaseModel):
    """Input for updating a group."""

    group_id: str = Field(description="ID của group cần cập nhật")
    title: str = Field(description="Tên mới cho group")


class DeleteGroupInput(BaseModel):
    """Input for deleting a group."""

    group_id: str = Field(description="ID của group cần xóa")


# ── Tool Definitions ────────────────────────────────────────────────────


@tool(args_schema=CreateGroupInput)
async def create_group(
    layer_id: str,
    title: str,
    level: str = "",
) -> str:
    """Tạo một Group mới bên trong một Layer.

    Group phân loại các item theo mức độ (core, intermediate, advanced)
    hoặc theo chủ đề tùy chỉnh.
    Ví dụ: 'thêm group Advanced vào layer 01-DB'.
    """
    from rag_service.tools import get_adapter, resolve_layer_id

    real_layer_id = await resolve_layer_id(layer_id)
    adapter = get_adapter()
    result = await adapter.create_group(real_layer_id, title, level)
    return (
        f"✅ Đã tạo group '{result.get('title', title)}' "
        f"(level: {result.get('level', level or 'auto')}) "
        f"trong layer '{layer_id}'"
    )


@tool(args_schema=UpdateGroupInput)
async def update_group(group_id: str, title: str) -> str:
    """Đổi tên một Group.

    Ví dụ: 'đổi tên group Core thành Fundamentals'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    result = await adapter.update_group(group_id, title)
    return f"✅ Đã đổi tên group thành '{result.get('title', title)}'"


@tool(args_schema=DeleteGroupInput)
async def delete_group(group_id: str) -> str:
    """Xóa một Group và toàn bộ items bên trong.

    Ví dụ: 'xóa group advanced trong layer 01-DB'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    success = await adapter.delete_group(group_id)
    if success:
        return f"🗑️ Đã xóa group '{group_id}' và toàn bộ items."
    return f"❌ Không thể xóa group '{group_id}'."
