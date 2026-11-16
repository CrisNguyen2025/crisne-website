"""Session Store & Conversational State Machine for Roadmap Assistant.

Maintains multi-turn context (active topic, active layer, pending confirmations)
across stateless chat messages.
"""

from __future__ import annotations

import time

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from rag_service.core.bounded import BoundedStore
from rag_service.core.thread_api import ThreadApi, default_thread_api
from rag_service.domains.roadmap.router.schemas import StructuredRoadmapAction


# A previewed change older than this is dropped: an "ok" an hour later must not run it
PENDING_TTL_SECONDS = 600.0
_PENDING_FIELDS = (
    "pending_confirmation",
    "pending_section_rename",
    "pending_content_draft",
    "pending_status_change",
)


def _now() -> float:
    """Clock for pending expiry; tests replace this, not time.monotonic (the event loop reads that one)."""
    return time.monotonic()


class SessionContext(BaseModel):
    session_id: str
    active_topic_slug: Optional[str] = None
    active_topic_title: Optional[str] = None
    last_action: Optional[StructuredRoadmapAction] = None
    pending_confirmation: Optional[StructuredRoadmapAction] = None
    # A previewed section rename (domains/roadmap/sections.py): {"topic", "title", "from", "to", "count", "merge"}
    pending_section_rename: Optional[Dict[str, Any]] = None
    # A drafted lesson body waiting for "ok" (lesson_content.py)
    pending_content_draft: Optional[Dict[str, Any]] = None
    # A previewed lesson status change waiting for "ok" (domains/roadmap/lesson_status.py)
    pending_status_change: Optional[Dict[str, Any]] = None
    recent_created_entities: List[dict] = Field(default_factory=list)
    # The open Topic was read from Turso (SessionStore.load): once per context, so a thread without one is not read again
    topic_loaded: bool = False
    # When each pending field was set (time.monotonic); stamped on assignment
    pending_since: Dict[str, float] = Field(default_factory=dict)

    def __setattr__(self, name: str, value: Any) -> None:
        super().__setattr__(name, value)
        if name in _PENDING_FIELDS:
            stamps = dict(self.pending_since)
            if value is None:
                stamps.pop(name, None)
            else:
                stamps[name] = _now()
            super().__setattr__("pending_since", stamps)

    def fresh_pending(self, name: str = "pending_confirmation") -> Any:
        """The pending value if it is still within PENDING_TTL_SECONDS; an expired one is cleared."""
        value = getattr(self, name)
        if value is not None and _now() - self.pending_since.get(name, 0.0) > PENDING_TTL_SECONDS:
            setattr(self, name, None)
            return None
        return value


class SessionStore:
    """In-memory multi-turn session storage.

    With an `api`, the Topic an Owner's thread has open is also kept in Turso (ADR-0012), so it survives a
    restart. Nothing else of the context is kept: a pending change must never outlive the process.
    """

    def __init__(self, api: Optional[ThreadApi] = None) -> None:
        # Bounded: every chat is a new thread, so a plain dict grew for as long as the process ran
        self._sessions: BoundedStore[SessionContext] = BoundedStore()
        self._api = api

    def get_or_create(self, session_id: str) -> SessionContext:
        """Retrieve existing session context or instantiate a new one."""
        sid = session_id or "default"
        return self._sessions.get_or_create(sid, lambda: SessionContext(session_id=sid))

    def set_active_topic(self, session_id: str, slug: str, title: str = "") -> None:
        ctx = self.get_or_create(session_id)
        ctx.active_topic_slug = slug
        if title:
            ctx.active_topic_title = title
        if self._api and slug and self._api.stored(session_id):
            self._api.write_later(
                "PATCH", session_id, {"activeTopicSlug": slug, "activeTopicTitle": ctx.active_topic_title}
            )

    async def load(self, session_id: str) -> None:
        """Read an Owner thread's open Topic from Turso, once per context (after a restart or a spin down)."""
        ctx = self.get_or_create(session_id)
        if ctx.topic_loaded or not self._api or not self._api.stored(session_id):
            return
        # Set before the call: two turns of one thread must not both read
        ctx.topic_loaded = True
        data = await self._api.read(session_id)
        state = data.get("state") if data else None
        # A Topic opened while the call was in flight is newer than the stored one
        if isinstance(state, dict) and not ctx.active_topic_slug and isinstance(state.get("activeTopicSlug"), str):
            ctx.active_topic_slug = state["activeTopicSlug"]
            title = state.get("activeTopicTitle")
            ctx.active_topic_title = title if isinstance(title, str) else None

    def set_last_action(self, session_id: str, action: StructuredRoadmapAction) -> None:
        ctx = self.get_or_create(session_id)
        ctx.last_action = action

    def set_pending_confirmation(self, session_id: str, action: Optional[StructuredRoadmapAction]) -> None:
        ctx = self.get_or_create(session_id)
        ctx.pending_confirmation = action

    def clear(self, session_id: str) -> None:
        self._sessions.pop(session_id)
        # Imported here: generation imports the agent's dependencies, which import this module.
        from rag_service.core.augmentation.history import history_store

        history_store.clear(session_id)


# Global singleton instance
session_store = SessionStore(default_thread_api())
