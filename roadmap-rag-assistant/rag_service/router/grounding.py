"""Page-context grounding and scope guardrail helpers.

- build_grounding(): turns the page context sent by the web client (current roadmap, layer)
  into a short hint line, so references like "thêm vào layer này" resolve to the right target.
- OUT_OF_SCOPE_REPLY: fixed refusal used when a message is unrelated to roadmaps.
"""

from __future__ import annotations

from typing import Optional

OUT_OF_SCOPE_REPLY = (
    "Xin lỗi, tôi chỉ hỗ trợ các việc liên quan đến lộ trình học tập trên hệ thống này "
    "(topic, layer, nhóm và bài học).\n\n"
    "Bạn có thể thử:\n"
    "- 🔎 **Tìm kiếm**: `tìm bài học về Docker`\n"
    "- 🗺️ **Tạo topic**: `tạo topic AI Engineering`\n"
    "- 📖 **Thêm bài học**: `thêm bài học Vector Database vào layer này`"
)


def build_grounding(context: Optional[dict]) -> str:
    """Return a one-line hint describing the page the user is looking at, or '' if none."""
    if not context:
        return ""

    parts: list[str] = []
    slug = (context.get("roadmapSlug") or "").strip()
    layer_id = (context.get("layerId") or "").strip()
    item_id = (context.get("itemId") or "").strip()

    if slug:
        parts.append(f"roadmap='{slug}'")
    if layer_id:
        parts.append(f"layerId='{layer_id}'")
    if item_id:
        parts.append(f"itemId='{item_id}'")

    if not parts:
        return ""
    return f"[Ngữ cảnh trang hiện tại: {', '.join(parts)}. Khi người dùng nói 'này', 'đây', hãy dùng ngữ cảnh này.]"


def with_grounding(message: str, context: Optional[dict]) -> str:
    """Prefix the user message with the page context hint, for LLM-facing prompts only."""
    hint = build_grounding(context)
    return f"{hint}\n{message}" if hint else message
