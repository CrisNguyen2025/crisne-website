"""Session Store & Conversational State Machine for Roadmap Assistant.

Maintains multi-turn context (active topic, active layer, pending confirmations)
across stateless chat messages.
"""

from __future__ import annotations

from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from rag_service.router.schemas import StructuredRoadmapAction


class SessionContext(BaseModel):
    session_id: str
    active_topic_slug: Optional[str] = None
    active_topic_title: Optional[str] = None
    active_layer_id: Optional[str] = None
    active_layer_title: Optional[str] = None
    last_action: Optional[StructuredRoadmapAction] = None
    pending_confirmation: Optional[StructuredRoadmapAction] = None
    # Item create waiting for the user to pick/create a layer, plus the topic to create it in.
    pending_layer_choice: Optional[StructuredRoadmapAction] = None
    pending_layer_topic: Optional[str] = None
    # Existing layers offered for that create, answerable by number or name.
    pending_layer_options: List[dict] = Field(default_factory=list)
    recent_created_entities: List[dict] = Field(default_factory=list)


class SessionStore:
    """In-memory multi-turn session storage."""

    def __init__(self) -> None:
        self._sessions: Dict[str, SessionContext] = {}

    def get_or_create(self, session_id: str) -> SessionContext:
        """Retrieve existing session context or instantiate a new one."""
        sid = session_id or "default"
        if sid not in self._sessions:
            self._sessions[sid] = SessionContext(session_id=sid)
        return self._sessions[sid]

    def set_active_topic(self, session_id: str, slug: str, title: str = "") -> None:
        ctx = self.get_or_create(session_id)
        ctx.active_topic_slug = slug
        if title:
            ctx.active_topic_title = title

    def set_active_layer(self, session_id: str, layer_id: str, title: str = "") -> None:
        ctx = self.get_or_create(session_id)
        ctx.active_layer_id = layer_id
        if title:
            ctx.active_layer_title = title

    def set_last_action(self, session_id: str, action: StructuredRoadmapAction) -> None:
        ctx = self.get_or_create(session_id)
        ctx.last_action = action

    def set_pending_confirmation(self, session_id: str, action: Optional[StructuredRoadmapAction]) -> None:
        ctx = self.get_or_create(session_id)
        ctx.pending_confirmation = action

    def clear(self, session_id: str) -> None:
        if session_id in self._sessions:
            del self._sessions[session_id]
        # Imported here: generation imports the agent's dependencies, which import this module.
        from rag_service.core.augmentation.history import history_store

        history_store.clear(session_id)


# Global singleton instance
session_store = SessionStore()
