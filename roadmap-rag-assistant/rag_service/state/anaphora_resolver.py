"""Anaphora and Context Resolver — Resolves pronouns and contextual references.

Handles:
- "vào đó", "trong đó", "cho nó", "in it", "to that topic" -> active_topic_slug
- "thêm bài vào topic vừa tạo" -> active_topic_slug
- Missing parent identifier -> automatically inferred from active conversation state
"""

from __future__ import annotations

from typing import Optional, Tuple
from rag_service.domains.roadmap.router.schemas import EntityLevel, StructuredRoadmapAction
from rag_service.state.session_store import SessionContext, session_store


class AnaphoraResolver:
    """Resolves implicit pronouns and conversational references into explicit database IDs."""

    @staticmethod
    def resolve_action(
        action: StructuredRoadmapAction,
        session_id: str,
        page_context: Optional[dict] = None,
    ) -> Tuple[StructuredRoadmapAction, Optional[str]]:
        """Resolve pronouns in action against session context and page context.

        Returns (resolved_action, resolution_note).
        """
        ctx: SessionContext = session_store.get_or_create(session_id)
        note: Optional[str] = None
        target = action.target_parent_identifier

        is_anaphora = target in ["CONTEXT_ACTIVE", "đó", "nó", "this", "it", None]

        # A lesson belongs to a topic (ADR-0009): an anaphoric or missing topic is the open one
        if action.entity_level == EntityLevel.ITEM and (is_anaphora or not target):
            page_slug = ((page_context or {}).get("roadmapSlug") or "").strip() if page_context else ""
            active_slug = page_slug or ctx.active_topic_slug
            if active_slug:
                action.target_parent_identifier = active_slug
                if page_slug:
                    topic_name = (page_context.get("roadmapTitle") or "").strip() or page_slug
                else:
                    topic_name = ctx.active_topic_title or ctx.active_topic_slug
                note = f"Tự động gắn vào topic: **{topic_name}**"
            else:
                note = "Chưa có topic nào được chọn. Vui lòng chỉ định rõ tên topic."

        return action, note
