"""Item CUD tools for the LangChain agent.

Tools:
  - create_item       : Create a single item in a layer/group
  - create_items_batch: Batch-create multiple items
  - update_item       : Update item fields or move between groups
  - delete_item       : Delete an item by ID
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
    """Input for creating a new item."""

    layer_id: str = Field(description="ID của layer chứa item")
    level: str = Field(
        description=(
            "Level/group của item: 'core', 'intermediate', 'advanced', "
            "hoặc custom level. Nếu group chưa tồn tại sẽ tự tạo."
        )
    )
    title: str = Field(description="Tên item, ví dụ: 'Prompt Engineering'")
    description: str = Field(default="", description="Mô tả ngắn cho item")
    content: str = Field(default="", description="Nội dung chi tiết (HTML/markdown) nếu người dùng cung cấp")


class ImportItemsFromTextInput(BaseModel):
    """Input for importing many items from a pasted list."""

    layer_id: str = Field(description="ID của layer nhận các item")
    level: str = Field(description="Level/group cho các item: 'core' | 'intermediate' | 'advanced'")
    text: str = Field(description="Danh sách item, mỗi dòng một item (bullet '-', '*', '•' hoặc số thứ tự)")


class CreateItemsBatchInput(BaseModel):
    """Input for batch-creating multiple items."""

    layer_id: str = Field(description="ID của layer chứa các items")
    level: str = Field(
        description="Level/group chung cho tất cả items trong batch"
    )
    items: list[dict] = Field(
        description=(
            "Danh sách items cần tạo. Mỗi phần tử là dict có key: "
            "'title' (bắt buộc), 'description' (tùy chọn). "
            "Ví dụ: [{'title': 'Prompt Engineering'}, {'title': 'LangChain Basics'}]"
        )
    )


class UpdateItemInput(BaseModel):
    """Input for updating an item."""

    item_id: str = Field(description="ID của item cần cập nhật")
    title: str = Field(
        default="", description="Tên mới (để trống nếu không đổi)"
    )
    description: str = Field(
        default="", description="Mô tả mới (để trống nếu không đổi)"
    )
    level: str = Field(
        default="",
        description=(
            "Level mới để chuyển item sang group khác "
            "(để trống nếu không di chuyển)"
        ),
    )


class DeleteItemInput(BaseModel):
    """Input for deleting an item."""

    item_id: str = Field(description="ID của item cần xóa")


# ── Tool Definitions ────────────────────────────────────────────────────


@tool(args_schema=CreateItemInput)
async def create_item(
    layer_id: str,
    level: str,
    title: str,
    description: str = "",
    content: str = "",
) -> str:
    """Tạo một Item mới trong một Layer.

    Item là đơn vị kiến thức nhỏ nhất (ví dụ: 'Vector Databases', 'Prompt Engineering').
    Tự tìm hoặc tạo Group phù hợp theo level.
    Ví dụ: 'thêm item Prompt Engineering vào layer 01-LLM, level core'.
    """
    from rag_service.tools import get_adapter
    from rag_service.tools.layer_resolver import describe_unresolved, resolve_layer

    res = await resolve_layer(layer_id)
    if res.status not in ("found", "unavailable"):
        return describe_unresolved(layer_id, res)
    real_layer_id = res.layer_id or layer_id
    adapter = get_adapter()
    try:
        result = await adapter.create_item(real_layer_id, level, title, description, content)
    except DuplicateEntityError as dup:
        return f"ℹ️ Bài học '{dup.title}' đã có trong layer '{layer_id}', không tạo thêm."
    return (
        f"✅ Đã tạo item '{result.get('title', title)}' "
        f"(level: {level}) trong layer '{layer_id}'"
    )


@tool(args_schema=CreateItemsBatchInput)
async def create_items_batch(
    layer_id: str,
    level: str,
    items: list[dict],
    changes: Optional["ChangeSet"] = None,
) -> str:
    """Tạo nhiều Items cùng lúc trong một Layer.

    Sử dụng khi người dùng yêu cầu thêm nhiều item trong một câu.
    Ví dụ: 'thêm 3 item: Vector DB, Embeddings, RAG Pipeline vào layer 01-DB level core'.
    """
    from rag_service.tools import get_adapter
    from rag_service.tools.layer_resolver import describe_unresolved, resolve_layer

    res = await resolve_layer(layer_id)
    if res.status not in ("found", "unavailable"):
        return describe_unresolved(layer_id, res)
    real_layer_id = res.layer_id or layer_id
    adapter = get_adapter()
    created: list[str] = []
    skipped: list[str] = []
    for item in items:
        item_title = item.get("title", "")
        try:
            result = await adapter.create_item(
                real_layer_id, level, item_title, item.get("description", ""), item.get("content", "")
            )
        except DuplicateEntityError as dup:
            skipped.append(dup.title)
            if changes is not None:
                changes.skip(dup.title)
            continue
        created.append(result.get("title", item_title))
        if changes is not None:
            changes.created(result.get("title", item_title), result)
    return _with_skipped(f"✅ Đã tạo {len(created)} item (level: {level}): {', '.join(created)}", skipped)


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
    layer_id: str, level: str, text: str, changes: Optional["ChangeSet"] = None
) -> str:
    """Nhập nhiều item từ một danh sách dán vào, mỗi dòng bắt đầu bằng '-' hoặc số thứ tự.

    Ví dụ: 'thêm các bài sau vào layer này:\n- Docker\n- Kubernetes'.
    """
    titles = parse_item_list(text)
    if not titles:
        return "⚠️ Không tìm thấy dòng item nào. Hãy dùng dạng '- Tên bài' hoặc '1. Tên bài' mỗi dòng."
    return await create_items_batch.coroutine(
        layer_id=layer_id, level=level, items=[{"title": t} for t in titles], changes=changes
    )


@tool(args_schema=UpdateItemInput)
async def update_item(
    item_id: str,
    title: str = "",
    description: str = "",
    level: str = "",
) -> str:
    """Cập nhật thông tin Item hoặc di chuyển Item sang group/level khác.

    Ví dụ: 'đổi tên item xyz thành ABC', 'chuyển item xyz sang level advanced'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    kwargs: dict = {}
    if title:
        kwargs["title"] = title
    if description:
        kwargs["description"] = description
    if level:
        kwargs["level"] = level
    result = await adapter.update_item(item_id, **kwargs)
    return f"✅ Đã cập nhật item '{result.get('title', item_id)}'"


@tool(args_schema=DeleteItemInput)
async def delete_item(item_id: str) -> str:
    """Xóa một Item theo ID.

    Ví dụ: 'xóa item có ID xyz'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    success = await adapter.delete_item(item_id)
    if success:
        return f"🗑️ Đã xóa item '{item_id}'."
    return f"❌ Không thể xóa item '{item_id}'."
