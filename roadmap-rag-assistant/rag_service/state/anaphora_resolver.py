"""Anaphora and Context Resolver — Resolves pronouns and contextual references.

Handles:
- "vào đó", "trong đó", "cho nó", "in it", "to that topic" -> active_topic_slug
- "thêm vào layer vừa tạo" -> active_layer_id
- Missing parent identifier -> automatically inferred from active conversation state
"""

from __future__ import annotations

from typing import Optional, Tuple
from rag_service.router.schemas import EntityLevel, StructuredRoadmapAction
from rag_service.state.session_store import SessionContext, session_store


class AnaphoraResolver:
    """Resolves implicit pronouns and conversational references into explicit database IDs."""

    @staticmethod
    def resolve_action(
        action: StructuredRoadmapAction,
        session_id: str,
    ) -> Tuple[StructuredRoadmapAction, Optional[str]]:
        """Resolve pronouns in action against session context.

        Returns (resolved_action, resolution_note).
        """
        ctx: SessionContext = session_store.get_or_create(session_id)
        note: Optional[str] = None
        target = action.target_parent_identifier

        is_anaphora = target in ["CONTEXT_ACTIVE", "đó", "nó", "this", "it", None]

        # 1. Resolving Layer parent (needs Topic slug)
        if action.entity_level == EntityLevel.LAYER:
            if is_anaphora or not target:
                if ctx.active_topic_slug:
                    action.target_parent_identifier = ctx.active_topic_slug
                    topic_name = ctx.active_topic_title or ctx.active_topic_slug
                    note = f"Tự động gán vào topic đang thao tác: **{topic_name}** (`{ctx.active_topic_slug}`)"
                else:
                    note = "Chưa có topic nào được chọn. Vui lòng chỉ định rõ tên topic (ví dụ: 'trong topic Backend')."

        # 2. Resolving Group or Item parent (needs Layer ID or Topic)
        elif action.entity_level in [EntityLevel.GROUP, EntityLevel.ITEM]:
            if is_anaphora or not target:
                if ctx.active_layer_id:
                    action.target_parent_identifier = ctx.active_layer_id
                    layer_name = ctx.active_layer_title or ctx.active_layer_id
                    note = f"Tự động gán vào layer gần nhất: **{layer_name}**"
                elif ctx.active_topic_slug:
                    action.target_parent_identifier = ctx.active_topic_slug
                    topic_name = ctx.active_topic_title or ctx.active_topic_slug
                    note = f"Tự động gán vào topic: **{topic_name}**"
                else:
                    note = "Chưa có layer hoặc topic nào được chọn. Vui lòng chỉ định rõ tên layer hoặc topic."

        return action, note
