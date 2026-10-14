"""Tool registry — exports ALL_TOOLS list and adapter singleton management.

Every tool module imports `get_adapter()` from here to access the active
data adapter (HTTP or SQLite).  The adapter is initialised at server startup
via `init_adapter()`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from rag_service.adapters.base import BaseAdapter

from rag_service.tools.topic_tools import (
    create_topic,
    create_topics_batch,
    delete_topic,
    list_topics,
)
from rag_service.tools.layer_tools import (
    create_layer,
    create_layers_batch,
    delete_layer,
    update_layer,
)
from rag_service.tools.group_tools import (
    create_group,
    delete_group,
    update_group,
)
from rag_service.tools.item_tools import (
    create_item,
    create_items_batch,
    import_items_from_text,
    delete_item,
    update_item,
)

from rag_service.tools.rag_tools import (
    generate_roadmap_from_template,
    preview_roadmap_plan,
    search_roadmap_templates,
)
from rag_service.tools.layer_resolver import resolve_layer_id

ALL_TOOLS = [
    # Topics
    create_topic,
    create_topics_batch,
    list_topics,
    delete_topic,
    # Layers
    create_layer,
    create_layers_batch,
    update_layer,
    delete_layer,
    # Groups
    create_group,
    update_group,
    delete_group,
    # Items
    create_item,
    create_items_batch,
    import_items_from_text,
    update_item,
    delete_item,
    # Mini-RAG & Document Generation
    search_roadmap_templates,
    generate_roadmap_from_template,
    preview_roadmap_plan,
]

# ── Adapter singleton ───────────────────────────────────────────────────

_adapter: BaseAdapter | None = None


def init_adapter(adapter: BaseAdapter) -> None:
    """Set the active adapter instance (called once at startup)."""
    global _adapter
    _adapter = adapter


def get_adapter() -> BaseAdapter:
    """Return the active adapter instance. Auto-initializes from settings if not set."""
    global _adapter
    if _adapter is None:
        from rag_service.config import settings
        if settings.rag_adapter_mode == "http":
            from rag_service.adapters.http_adapter import HttpApiAdapter
            _adapter = HttpApiAdapter(settings.nextjs_api_base_url, settings.admin_api_key)
        else:
            from rag_service.adapters.sqlite_adapter import SqliteAdapter
            _adapter = SqliteAdapter(settings.sqlite_db_path)
    return _adapter
