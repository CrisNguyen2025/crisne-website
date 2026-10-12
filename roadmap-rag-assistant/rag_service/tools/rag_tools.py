"""RAG & Fast Document Generation tools for the LangChain agent.

Tools:
  - search_roadmap_templates     : Search roadmap templates in the Mini-RAG knowledge base
  - generate_roadmap_from_template: Automatically construct an entire roadmap hierarchy from a template
  - preview_roadmap_plan         : Generate a preview tree for /plan mode
"""

from __future__ import annotations

from langchain.tools import tool
from pydantic import BaseModel, Field

from rag_service.rag.rag_engine import rag_engine


class SearchTemplatesInput(BaseModel):
    """Input for searching roadmap templates."""

    query: str = Field(
        description="Từ khóa tìm kiếm template, ví dụ: 'AI', 'Next.js', 'DevOps', 'Microservices'"
    )
    limit: int = Field(default=3, description="Số lượng kết quả tối đa trả về")


class GenerateFromTemplateInput(BaseModel):
    """Input for generating a complete roadmap from a template."""

    template_id: str = Field(
        description="ID của template (ví dụ: 'ai-engineering', 'nextjs-fullstack', 'cloud-devops')"
    )
    custom_title: str = Field(
        default="",
        description="Tên tùy chỉnh cho roadmap (nếu để trống sẽ dùng tên mặc định của template)",
    )


class PreviewPlanInput(BaseModel):
    """Input for previewing a roadmap plan."""

    query_or_template_id: str = Field(
        description="Tên template ID hoặc từ khóa chủ đề cần lập kế hoạch (ví dụ: 'ai-engineering', 'nextjs')"
    )


@tool(args_schema=SearchTemplatesInput)
async def search_roadmap_templates(query: str, limit: int = 3) -> str:
    """Tìm kiếm các template lộ trình/tài liệu mẫu trong kho tri thức Mini-RAG.

    Sử dụng khi người dùng muốn tham khảo mẫu lộ trình có sẵn hoặc tìm blueprint phù hợp.
    Ví dụ: 'tìm mẫu lộ trình AI', 'có template DevOps nào không?'.
    """
    results = rag_engine.search(query, limit=limit)
    if not results:
        available = rag_engine.list_templates()
        names = [f"'{t['id']}' ({t['title']})" for t in available]
        return f"🔍 Không tìm thấy template khớp với '{query}'. Các mẫu hiện có: {', '.join(names)}"

    lines = [f"🔍 Tìm thấy {len(results)} template phù hợp:"]
    for t, score in results:
        lines.append(
            f"- **ID**: `{t.get('id')}` | **Tên**: {t.get('title')} | "
            f"**Layers**: {len(t.get('layers', []))} | **Lĩnh vực**: {t.get('domain', '')}\n"
            f"  _{t.get('description', '')}_"
        )
    return "\n".join(lines)


@tool(args_schema=PreviewPlanInput)
async def preview_roadmap_plan(query_or_template_id: str) -> str:
    """Tạo bản thảo xem trước cấu trúc chi tiết của lộ trình (phục vụ chế độ /plan).

    Hiển thị toàn bộ các Layer, Group, Item dự kiến mà chưa ghi vào database.
    Ví dụ: '/plan tạo tài liệu Next.js Fullstack', 'xem trước kế hoạch AI Roadmap'.
    """
    template = rag_engine.get_template(query_or_template_id)
    if not template:
        matches = rag_engine.search(query_or_template_id, limit=1)
        if matches:
            template = matches[0][0]

    if not template:
        return f"⚠️ Không tìm thấy template phù hợp với '{query_or_template_id}' để lập plan."

    preview_text = rag_engine.format_plan_preview(template)
    return (
        f"{preview_text}\n\n"
        f"💡 Bạn có thể nói: 'Hãy tạo lộ trình này bằng template {template.get('id')}' "
        f"để hoàn tất tạo tài liệu tự động!"
    )


@tool(args_schema=GenerateFromTemplateInput)
async def generate_roadmap_from_template(
    template_id: str, custom_title: str = ""
) -> str:
    """Tạo nhanh toàn bộ một tài liệu/lộ trình hoàn chỉnh (Topic + Layers + Groups + Items) từ template.

    Đây là công cụ Mini-RAG cốt lõi giúp sinh nhanh toàn bộ document chỉ với 1 lệnh.
    Ví dụ: 'tạo tài liệu từ template ai-engineering', 'sinh nhanh roadmap nextjs-fullstack'.
    """
    from rag_service.tools import get_adapter

    template = rag_engine.get_template(template_id)
    if not template:
        matches = rag_engine.search(template_id, limit=1)
        if matches:
            template = matches[0][0]

    if not template:
        return f"❌ Không tìm thấy template '{template_id}'. Hãy dùng search_roadmap_templates để tra cứu."

    adapter = get_adapter()
    title = custom_title.strip() or template.get("title", "Roadmap")
    short_code = template.get("shortCode", title[:3].upper())
    description = template.get("description", "")

    # Step 1: Create Topic with its Layers
    raw_layers = template.get("layers", [])
    initial_layers = [
        {
            "title": layer.get("title", ""),
            "shortTag": layer.get("shortTag", f"{idx+1:02d}-LAY"),
            "subtitle": layer.get("subtitle", ""),
        }
        for idx, layer in enumerate(raw_layers)
    ]

    created_topic = await adapter.create_topic(
        title=title,
        short_code=short_code,
        description=description,
        layers=initial_layers,
    )
    topic_slug = created_topic.get("slug", "")

    # Step 2: Query full topic to retrieve layer IDs
    full_topic = await adapter.get_topic(topic_slug)
    layer_map: dict[str, str] = {}
    if full_topic and "layers" in full_topic:
        for lyr in full_topic["layers"]:
            tag = lyr.get("shortTag", "")
            layer_map[tag] = lyr.get("id", "")

    # Step 3: Populate groups and items into each layer
    items_created_count = 0
    for layer in raw_layers:
        tag = layer.get("shortTag", "")
        layer_id = layer_map.get(tag)
        if not layer_id:
            continue

        for group in layer.get("groups", []):
            level = group.get("level", "core")
            for item in group.get("items", []):
                item_title = item.get("title", "")
                item_desc = item.get("description", "")
                await adapter.create_item(
                    layer_id=layer_id,
                    level=level,
                    title=item_title,
                    description=item_desc,
                )
                items_created_count += 1

    return (
        f"🎉 **Đã khởi tạo thành công tài liệu/lộ trình từ template '{template.get('id')}'!**\n"
        f"- **Topic**: {title} (slug: `{topic_slug}`)\n"
        f"- **Layers**: {len(raw_layers)} layer đã tạo\n"
        f"- **Items**: {items_created_count} mục kiến thức chi tiết đã được điền đầy đủ!"
    )
