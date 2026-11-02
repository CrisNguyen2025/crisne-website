"""Group CUD tools for the LangChain agent.

Tools:
  - create_group : Create a new group inside a layer
  - update_group : Update a group's title
  - delete_group : Delete a group by ID
"""

from __future__ import annotations

from langchain.tools import tool
from pydantic import BaseModel, Field
from rag_service.adapters.errors import DuplicateEntityError


# ── Pydantic Input Schemas ───────────────────────────────────────────────


class CreateGroupInput(BaseModel):
    """Input for creating a new group."""

    layer_id: str = Field(description="ID của layer chứa group")
    title: str = Field(description="Tên group, duy nhất trong layer, ví dụ: 'Fundamentals', 'Production'")


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
) -> str:
    """Tạo một Group mới bên trong một Layer.

    Group là nhóm bài học có tên, tên là duy nhất trong layer.
    Ví dụ: 'thêm group Production vào layer 01-DB'.
    """
    from rag_service.tools import get_adapter
    from rag_service.tools.layer_resolver import describe_unresolved, resolve_layer

    res = await resolve_layer(layer_id)
    if res.status not in ("found", "unavailable"):
        return describe_unresolved(layer_id, res)
    real_layer_id = res.layer_id or layer_id
    adapter = get_adapter()
    try:
        result = await adapter.create_group(real_layer_id, title)
    except DuplicateEntityError as dup:
        return f"ℹ️ Group '{dup.title}' đã có trong layer '{layer_id}', không tạo thêm."
    return (
        f"✅ Đã tạo group '{result.get('title', title)}' "
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
