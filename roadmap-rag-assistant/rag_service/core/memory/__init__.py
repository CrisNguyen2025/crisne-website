"""Owner Memory core module (ADR-0015): persistent cross-Thread facts & preferences for the Owner only."""

from rag_service.core.memory.extractor import (
    MAX_PENDING_MEMORIES,
    MemorySuggestion,
    extract_memory_suggestions,
    has_memory_signal,
    maybe_suggest_memories,
)
from rag_service.core.memory.store import (
    KIND_LABELS,
    KIND_PRIORITY,
    OWNER_MEMORY_KINDS,
    OwnerMemoryApi,
    OwnerMemoryItem,
    OwnerMemoryStore,
    default_memory_api,
    format_owner_memory,
    owner_memory_store,
    select_owner_memories,
)

__all__ = [
    "KIND_LABELS",
    "KIND_PRIORITY",
    "MAX_PENDING_MEMORIES",
    "MemorySuggestion",
    "OWNER_MEMORY_KINDS",
    "OwnerMemoryApi",
    "OwnerMemoryItem",
    "OwnerMemoryStore",
    "default_memory_api",
    "extract_memory_suggestions",
    "format_owner_memory",
    "has_memory_signal",
    "maybe_suggest_memories",
    "owner_memory_store",
    "select_owner_memories",
]
