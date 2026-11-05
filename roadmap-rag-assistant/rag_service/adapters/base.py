"""Abstract base adapter — Protocol interface for all data operations.

Both HttpApiAdapter and SqliteAdapter implement this protocol so tools remain agnostic about the
underlying data source. A topic holds its lessons directly; a lesson may name a section (ADR-0009).

Write methods are named create_*, update_* or delete_*: the write guard (rag_service/write_grant.py)
covers exactly those prefixes, so every write goes through it.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class BaseAdapter(Protocol):
    """Protocol that every roadmap data adapter must satisfy."""

    # ── Topics ───────────────────────────────────────────────────────────

    async def list_topics(self) -> list[dict]:
        """All topics with basic metadata and their lesson count."""
        ...

    async def get_topic(self, slug: str) -> dict | None:
        """A topic with its lessons in page order and its sections. None if not found."""
        ...

    async def create_topic(self, title: str, description: str = "") -> dict:
        """Create a topic. Raises DuplicateEntityError when a topic has the same title."""
        ...

    async def update_topic(self, slug: str, **kwargs: object) -> dict:
        """Update title, description or isLocked. Returns the updated topic."""
        ...

    async def delete_topic(self, slug: str) -> bool:
        """Delete a topic and its lessons. False if not found."""
        ...

    # ── Lessons ──────────────────────────────────────────────────────────

    async def create_item(
        self,
        topic_slug: str,
        section: str | None,
        title: str,
        description: str = "",
        content: str = "",
    ) -> dict:
        """Add a lesson to a topic, into `section` (or outside any section). Raises DuplicateEntityError
        when the topic already has a lesson with that title."""
        ...

    async def update_item(self, item_id: str, **kwargs: object) -> dict:
        """Update title, description or section. A section moves the lesson; blank takes it out."""
        ...

    async def update_item_content(self, item_id: str, content: str) -> dict:
        """Replace a lesson's rich-text body (HTML)."""
        ...

    async def delete_item(self, item_id: str) -> bool:
        """Delete a lesson by ID. True on success."""
        ...

    async def update_section(self, topic_slug: str, from_name: str, to_name: str) -> dict:
        """Rename a section: every lesson in it moves to the new name (merging if the name exists)."""
        ...

    async def update_item_order(self, topic_slug: str, ordered_ids: list[str]) -> bool:
        """Set the page order of a topic's lessons."""
        ...
