"""Dry-Run Validator & Action Diff Card Generator.

Generates structured Markdown preview cards before committing mutations,
preventing unintended database modifications and providing clarity to the user.
"""

from __future__ import annotations

from typing import Optional, Tuple
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, StructuredRoadmapAction


class DryRunValidator:
    """Validates actions and formats user-facing preview diff cards."""

    @staticmethod
    def format_preview_card(action: StructuredRoadmapAction, note: Optional[str] = None) -> str:
        """Render a clean Telegram-style Action Card for user review."""
        action_verbs = {
            ActionType.CREATE: ("➕ TẠO MỚI", "Sẽ tạo mới"),
            ActionType.UPDATE: ("✏️ CẬP NHẬT", "Sẽ sửa đổi"),
            ActionType.DELETE: ("🗑️ XÓA DỮ LIỆU", "Sẽ xóa vĩnh viễn"),
        }
        badge, desc = action_verbs.get(action.action, ("📋 THAO TÁC", "Sẽ thực hiện"))

        lines = [
            f"**{badge} {len(action.entities)} {action.entity_level.value.upper()}**",
        ]
        if note:
            lines.append(f"_{note}_")

        # A delete holds the id of the entity itself there, not where it lives: the card names it below
        if (
            action.target_parent_identifier
            and action.entity_level != EntityLevel.TOPIC
            and action.action != ActionType.DELETE
        ):
            lines.append(f"- **Vị trí đích (Parent):** `{action.target_parent_identifier}`")

        lines.append("- **Danh sách thực thể:**")
        for idx, ent in enumerate(action.entities, 1):
            details = []
            if ent.short_code:
                details.append(f"Mã: `{ent.short_code}`")
            if ent.level and action.entity_level in [EntityLevel.GROUP, EntityLevel.ITEM]:
                details.append(f"Level: `{ent.level}`")
            detail_str = f" ({', '.join(details)})" if details else ""
            lines.append(f"  {idx}. **{ent.title}**{detail_str}")

        if action.action == ActionType.DELETE:
            lines.append("\n⚠️ **CẢNH BÁO NGUY HIỂM:** Thao tác xóa sẽ loại bỏ toàn bộ dữ liệu con bên trong (nếu có)!")

        return "\n".join(lines)
