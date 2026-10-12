"""Layer CUD tools for the LangChain agent.

Tools:
  - create_layer : Create a new layer inside a topic
  - update_layer : Update layer metadata (title, shortTag, subtitle)
  - delete_layer : Delete a layer by ID
"""

from __future__ import annotations

from langchain.tools import tool
from pydantic import BaseModel, Field


# ── Pydantic Input Schemas ───────────────────────────────────────────────


class CreateLayerInput(BaseModel):
    """Input for creating a new layer."""

    topic_slug: str = Field(
        description="Slug của topic chứa layer, ví dụ: 'ai-engineering'"
    )
    title: str = Field(description="Tên layer, ví dụ: 'Database Fundamentals'")
    short_tag: str = Field(
        description="Mã ngắn của layer, ví dụ: '01-DB', '02-LLM'"
    )
    subtitle: str = Field(default="", description="Mô tả ngắn cho layer")


class CreateLayersBatchInput(BaseModel):
    """Input for batch-creating multiple layers in a topic."""

    topic_slug: str = Field(description="Slug của topic chứa các layer, ví dụ: 'be', 'fe'")
    layers: list[dict] = Field(
        description=(
            "Danh sách các layer cần tạo. Mỗi phần tử là dict có key: "
            "'title' (bắt buộc), 'short_tag' (tùy chọn), 'subtitle' (tùy chọn). "
            "Ví dụ: [{'title': 'mock 1'}, {'title': 'mock 2'}]"
        )
    )


class UpdateLayerInput(BaseModel):
    """Input for updating a layer."""

    layer_id: str = Field(description="ID của layer cần cập nhật")
    title: str = Field(default="", description="Tên mới (để trống nếu không đổi)")
    short_tag: str = Field(
        default="", description="Mã ngắn mới (để trống nếu không đổi)"
    )
    subtitle: str = Field(
        default="", description="Mô tả mới (để trống nếu không đổi)"
    )


class DeleteLayerInput(BaseModel):
    """Input for deleting a layer."""

    layer_id: str = Field(description="ID của layer cần xóa")


# ── Tool Definitions ────────────────────────────────────────────────────


@tool(args_schema=CreateLayerInput)
async def create_layer(
    topic_slug: str,
    title: str,
    short_tag: str,
    subtitle: str = "",
) -> str:
    """Tạo một Layer mới bên trong một Topic đã có.

    Layer đại diện cho một mảng kiến thức lớn (ví dụ: Database, LLM, RAG).
    Ví dụ: 'thêm layer Database vào topic ai-engineering'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    result = await adapter.create_layer(topic_slug, title, short_tag, subtitle)
    return (
        f"✅ Đã tạo layer '{result.get('title', title)}' "
        f"(shortTag: {result.get('shortTag', short_tag)}) "
        f"trong topic '{topic_slug}'"
    )


@tool(args_schema=CreateLayersBatchInput)
async def create_layers_batch(
    topic_slug: str,
    layers: list[dict],
) -> str:
    """Tạo nhiều Layer cùng lúc trong một Topic (batch).

    Sử dụng khi người dùng yêu cầu tạo NHIỀU layer trong một topic.
    Ví dụ: 'tạo 2 layer mock 1 và 2 trong be topic', 'thêm 3 layer A, B và C vào topic fe'.
    """
    import re
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    topic = await adapter.get_topic(topic_slug)
    if not topic:
        title = topic_slug.upper()
        short_code = title[:3]
        await adapter.create_topic(title, short_code, f"Topic {title}", [])
        topic = await adapter.get_topic(topic_slug)

    existing_layers = topic.get("layers", []) if topic else []
    current_count = len(existing_layers)

    created: list[str] = []
    for i, l in enumerate(layers):
        ltitle = l.get("title", "")
        clean_tag = re.sub(r"[^A-Za-z0-9]", "", ltitle).upper()[:3] or "LAY"
        default_tag = f"{current_count + i + 1:02d}-{clean_tag}"
        short_tag = l.get("short_tag") or default_tag
        res = await adapter.create_layer(topic_slug, ltitle, short_tag, l.get("subtitle", ""))
        created.append(f"{res.get('title', ltitle)} ({short_tag})")

    return f"✅ Đã tạo {len(created)} layer trong topic '{topic_slug}': {', '.join(created)}"



@tool(args_schema=UpdateLayerInput)
async def update_layer(
    layer_id: str,
    title: str = "",
    short_tag: str = "",
    subtitle: str = "",
) -> str:
    """Cập nhật thông tin một Layer (title, shortTag, subtitle).

    Ví dụ: 'đổi tên layer 01-DB thành Database Core'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    kwargs: dict = {}
    if title:
        kwargs["title"] = title
    if short_tag:
        kwargs["short_tag"] = short_tag
    if subtitle:
        kwargs["subtitle"] = subtitle
    result = await adapter.update_layer(layer_id, **kwargs)
    return f"✅ Đã cập nhật layer '{result.get('title', layer_id)}'"


@tool(args_schema=DeleteLayerInput)
async def delete_layer(layer_id: str) -> str:
    """Xóa một Layer và toàn bộ groups/items bên trong.

    Ví dụ: 'xóa layer có ID xyz'.
    """
    from rag_service.tools import get_adapter

    adapter = get_adapter()
    success = await adapter.delete_layer(layer_id)
    if success:
        return f"🗑️ Đã xóa layer '{layer_id}' và toàn bộ nội dung."
    return f"❌ Không thể xóa layer '{layer_id}'."
