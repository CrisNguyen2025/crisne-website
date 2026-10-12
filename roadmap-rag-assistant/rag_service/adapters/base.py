"""Abstract base adapter — Protocol interface for all data operations.

Both HttpApiAdapter and SqliteAdapter implement this protocol so tools
remain completely agnostic about the underlying data source.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class BaseAdapter(Protocol):
    """Protocol that every roadmap data adapter must satisfy."""

    # ── Topics (Roadmaps) ────────────────────────────────────────────────

    async def list_topics(self) -> list[dict]:
        """Return a list of all topics with basic metadata."""
        ...

    async def get_topic(self, slug: str) -> dict | None:
        """Fetch full topic hierarchy by slug. Returns None if not found."""
        ...

    async def create_topic(
        self,
        title: str,
        short_code: str,
        description: str = "",
        layers: list[dict] | None = None,
    ) -> dict:
        """Create a new topic/roadmap with optional initial layers.

        Each layer dict should have keys: title, shortTag, subtitle (optional).
        If *layers* is None or empty, the adapter should create a default layer.
        Returns the created topic dict.
        """
        ...

    async def update_topic(self, slug: str, **kwargs: object) -> dict:
        """Update topic fields (title, shortCode, description, isLocked).

        Returns the updated topic dict.
        """
        ...

    async def delete_topic(self, slug: str) -> bool:
        """Delete a topic by slug. Returns True on success, False if not found."""
        ...

    # ── Layers ───────────────────────────────────────────────────────────

    async def create_layer(
        self,
        topic_slug: str,
        title: str,
        short_tag: str,
        subtitle: str = "",
    ) -> dict:
        """Create a new layer inside a topic. Returns the created layer dict."""
        ...

    async def update_layer(self, layer_id: str, **kwargs: object) -> dict:
        """Update layer fields (title, shortTag, subtitle).

        Returns the updated layer dict.
        """
        ...

    async def delete_layer(self, layer_id: str) -> bool:
        """Delete a layer by ID. Returns True on success."""
        ...

    # ── Groups ───────────────────────────────────────────────────────────

    async def create_group(
        self,
        layer_id: str,
        title: str,
        level: str = "",
    ) -> dict:
        """Create a new group inside a layer. Returns the created group dict."""
        ...

    async def update_group(self, group_id: str, title: str) -> dict:
        """Update a group's title. Returns the updated group dict."""
        ...

    async def delete_group(self, group_id: str) -> bool:
        """Delete a group by ID. Returns True on success."""
        ...

    # ── Items ────────────────────────────────────────────────────────────

    async def create_item(
        self,
        layer_id: str,
        level: str,
        title: str,
        description: str = "",
    ) -> dict:
        """Create a new item in a layer/group. Returns the created item dict."""
        ...

    async def update_item(self, item_id: str, **kwargs: object) -> dict:
        """Update item fields (title, description, level).

        Returns the updated item dict.
        """
        ...

    async def delete_item(self, item_id: str) -> bool:
        """Delete an item by ID. Returns True on success."""
        ...
