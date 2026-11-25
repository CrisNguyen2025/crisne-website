"""Owner Memory store & prompt formatting (ADR-0015, domain-neutral core).

All entries live behind an authenticated JSON API; strict Actor isolation (ADR-0002): every read
and write checks `is_owner()` first so Visitors never trigger a request or receive memory in prompts.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any, List, Optional, Sequence, Tuple

import httpx

from rag_service.auth import is_owner

log = logging.getLogger(__name__)

OWNER_MEMORY_KINDS = ("profile", "techstack", "goal", "preference", "learning_note")

KIND_LABELS = {
    "profile": "Hồ sơ",
    "techstack": "Techstack",
    "goal": "Mục tiêu",
    "preference": "Quy ước",
    "learning_note": "Ghi chú học tập",
}

# Injection priority: interaction preferences and active stack first, then goals, profile, notes
KIND_PRIORITY = {
    "preference": 0,
    "techstack": 1,
    "goal": 2,
    "profile": 3,
    "learning_note": 4,
}

DEFAULT_MAX_ITEMS = 15
DEFAULT_MAX_CHARS = 1500
CACHE_TTL_SECONDS = 60.0
API_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class OwnerMemoryItem:
    id: str
    kind: str
    content: str
    scope: Optional[str] = None
    source: str = "explicit"
    status: str = "active"
    replaces_memory_id: Optional[str] = None


def _escape_tag(text: str) -> str:
    return text.replace("</", "<\\/")


def _item_from_dict(raw: dict[str, Any], scope_field: str = "scope") -> Optional[OwnerMemoryItem]:
    if not isinstance(raw, dict):
        return None
    mid = str(raw.get("id") or "").strip()
    kind = str(raw.get("kind") or "").strip()
    content = str(raw.get("content") or "").strip()
    if not mid or kind not in OWNER_MEMORY_KINDS or not content:
        return None
    raw_scope = raw.get(scope_field) if scope_field in raw else raw.get("scope")
    scope = str(raw_scope).strip().lower() if isinstance(raw_scope, str) and raw_scope.strip() else None
    source = str(raw.get("source") or "explicit").strip()
    status = str(raw.get("status") or "active").strip()
    raw_replaces = raw.get("replacesMemoryId") or raw.get("replaces_memory_id")
    replaces_id = str(raw_replaces).strip() if isinstance(raw_replaces, str) and raw_replaces.strip() else None
    return OwnerMemoryItem(
        id=mid,
        kind=kind,
        content=content,
        scope=scope,
        source=source,
        status=status,
        replaces_memory_id=replaces_id,
    )


def select_owner_memories(
    items: Sequence[OwnerMemoryItem],
    *,
    scope: Optional[str] = None,
    max_items: int = DEFAULT_MAX_ITEMS,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> List[OwnerMemoryItem]:
    """Filter active memories applicable to `scope` within strict item and character caps."""
    if not items or max_items <= 0 or max_chars <= 0:
        return []

    wanted = (scope or "").strip().lower() or None
    eligible = [
        m
        for m in items
        if m.status == "active" and (m.scope is None or (wanted is not None and m.scope == wanted))
    ]
    if not eligible:
        return []

    # Scoped items matching the active scope appear before global items of the same priority
    eligible.sort(
        key=lambda m: (
            0 if (wanted and m.scope == wanted) else 1,
            KIND_PRIORITY.get(m.kind, 99),
        )
    )

    selected: List[OwnerMemoryItem] = []
    total_chars = 0
    for item in eligible:
        if len(selected) >= max_items:
            break
        line_len = len(_format_line(item)) + 1
        if selected and total_chars + line_len > max_chars:
            continue
        if not selected and line_len > max_chars:
            selected.append(item)
            total_chars += line_len
            break
        selected.append(item)
        total_chars += line_len
    return selected


def _format_line(item: OwnerMemoryItem) -> str:
    # Deliberately omit database IDs in the prompt so the LLM never cites a memory ID as [[id]]
    scope_part = f" · scope:{item.scope}" if item.scope else ""
    return f"- [{item.kind}{scope_part}] {_escape_tag(item.content)}"


def format_owner_memory(
    items: Sequence[OwnerMemoryItem],
    *,
    note: str = "",
    scope: Optional[str] = None,
    max_items: int = DEFAULT_MAX_ITEMS,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> Tuple[str, List[str]]:
    """Build `<owner_memory>` block and return `(formatted_block, selected_ids)`.

    Returns `("", [])` when no active memory applies.
    """
    selected = select_owner_memories(items, scope=scope, max_items=max_items, max_chars=max_chars)
    if not selected:
        return "", []
    lines = [_format_line(m) for m in selected]
    body = "<owner_memory>\n" + "\n".join(lines) + "\n</owner_memory>"
    block = f"{note}\n{body}" if note else body
    return block, [m.id for m in selected]


class OwnerMemoryApi:
    """HTTP client for the host app's `/api/v1/memories` endpoint (authenticated with `x-admin-key`)."""

    def __init__(self, base_url: str, admin_key: str, *, scope_field: str = "scope") -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {"Content-Type": "application/json", "x-admin-key": admin_key}
        self._scope_field = scope_field

    @property
    def scope_field(self) -> str:
        return self._scope_field

    def set_scope_field(self, field_name: str) -> None:
        self._scope_field = field_name

    def _client(self, timeout: float = API_TIMEOUT_SECONDS) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self._base_url, headers=self._headers, timeout=timeout)

    async def list_memories(self, status: str = "active") -> Optional[List[OwnerMemoryItem]]:
        try:
            async with self._client() as client:
                resp = await client.get("/api/v1/memories", params={"status": status})
            resp.raise_for_status()
            payload = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("owner_memory: failed to read memories (%s); continuing without memory", exc)
            return None
        raw_items = payload.get("memories") if isinstance(payload, dict) else None
        if not isinstance(raw_items, list):
            return []
        parsed = [_item_from_dict(row, self._scope_field) for row in raw_items]
        return [item for item in parsed if item is not None]

    async def create_memory(
        self,
        *,
        kind: str,
        content: str,
        scope: Optional[str] = None,
        source: str = "explicit",
        status: str = "active",
        replaces_memory_id: Optional[str] = None,
    ) -> Optional[OwnerMemoryItem]:
        body: dict[str, Any] = {
            "kind": kind,
            "content": content,
            self._scope_field: scope,
            "source": source,
            "status": status,
        }
        if replaces_memory_id:
            body["replacesMemoryId"] = replaces_memory_id
        async with self._client(timeout=10.0) as client:
            resp = await client.post("/api/v1/memories", json=body)
        resp.raise_for_status()
        payload = resp.json()
        raw = payload.get("memory") if isinstance(payload, dict) else None
        return _item_from_dict(raw, self._scope_field) if isinstance(raw, dict) else None

    async def archive_memory(self, memory_id: str) -> bool:
        async with self._client(timeout=10.0) as client:
            resp = await client.patch(f"/api/v1/memories/{memory_id}", json={"status": "archived"})
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True


class OwnerMemoryStore:
    """Owner-only memory store with short TTL RAM cache (API-backed or in-memory for tests)."""

    def __init__(self, api: Optional[OwnerMemoryApi] = None, cache_ttl: float = CACHE_TTL_SECONDS) -> None:
        self._api = api
        self._cache_ttl = cache_ttl
        self._cache: Optional[List[OwnerMemoryItem]] = None
        self._cached_at: float = 0.0
        # Local fallback store used when api is None (tests / offline mode)
        self._local: List[OwnerMemoryItem] = []

    def invalidate(self) -> None:
        self._cache = None
        self._cached_at = 0.0

    def configure_scope_field(self, field_name: str) -> None:
        """Configure the host API JSON field name used for scope."""
        if self._api is not None:
            self._api.set_scope_field(field_name)

    def reset_local(self) -> None:
        self._local.clear()
        self.invalidate()

    async def list_active(self, scope: Optional[str] = None) -> List[OwnerMemoryItem]:
        """Return active memories for the Owner only; always empty for Visitors."""
        if not is_owner():
            return []
        items = await self._load_active()
        if not scope:
            return list(items)
        wanted = scope.strip().lower()
        return [m for m in items if m.scope is None or m.scope == wanted]

    async def list_pending(self) -> List[OwnerMemoryItem]:
        if not is_owner():
            return []
        if self._api is None:
            return [m for m in self._local if m.status == "pending"]
        loaded = await self._api.list_memories(status="pending")
        return loaded or []

    async def _load_active(self) -> List[OwnerMemoryItem]:
        if self._api is None:
            return [m for m in self._local if m.status == "active"]
        now = time.monotonic()
        if self._cache is not None and (now - self._cached_at) < self._cache_ttl:
            return list(self._cache)
        loaded = await self._api.list_memories(status="active")
        if loaded is None:
            return list(self._cache) if self._cache is not None else []
        self._cache = loaded
        self._cached_at = now
        return list(loaded)

    async def create(
        self,
        *,
        kind: str,
        content: str,
        scope: Optional[str] = None,
        source: str = "explicit",
        status: str = "active",
        replaces_memory_id: Optional[str] = None,
    ) -> OwnerMemoryItem:
        if not is_owner():
            raise PermissionError("Only the Owner may write OwnerMemory.")
        clean_content = " ".join(content.split()).strip()[:300]
        clean_scope = scope.strip().lower() if isinstance(scope, str) and scope.strip() else None
        clean_replaces = (
            replaces_memory_id.strip()
            if isinstance(replaces_memory_id, str) and replaces_memory_id.strip()
            else None
        )
        if self._api is None:
            for existing in self._local:
                if (
                    existing.status == status
                    and existing.scope == clean_scope
                    and existing.content.lower() == clean_content.lower()
                ):
                    return existing
            created = OwnerMemoryItem(
                id=str(uuid.uuid4()),
                kind=kind,
                content=clean_content,
                scope=clean_scope,
                source=source,
                status=status,
                replaces_memory_id=clean_replaces,
            )
            self._local.insert(0, created)
            return created
        created_item = await self._api.create_memory(
            kind=kind,
            content=clean_content,
            scope=clean_scope,
            source=source,
            status=status,
            replaces_memory_id=clean_replaces,
        )
        self.invalidate()
        if created_item is None:
            raise RuntimeError("Failed to create OwnerMemory via API.")
        return created_item

    async def archive(self, memory_id: str) -> bool:
        if not is_owner():
            raise PermissionError("Only the Owner may archive OwnerMemory.")
        if self._api is None:
            for i, item in enumerate(self._local):
                if item.id == memory_id:
                    self._local[i] = OwnerMemoryItem(
                        id=item.id,
                        kind=item.kind,
                        content=item.content,
                        scope=item.scope,
                        source=item.source,
                        status="archived",
                    )
                    return True
            return False
        ok = await self._api.archive_memory(memory_id)
        self.invalidate()
        return ok


def default_memory_api(*, scope_field: str = "scope") -> Optional[OwnerMemoryApi]:
    from rag_service.config import settings

    if settings.rag_adapter_mode == "http" and settings.admin_api_key:
        return OwnerMemoryApi(settings.nextjs_api_base_url, settings.admin_api_key, scope_field=scope_field)
    return None


owner_memory_store = OwnerMemoryStore(default_memory_api())
