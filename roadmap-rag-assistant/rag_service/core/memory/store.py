"""Owner Memory store & prompt formatting (ADR-0015, domain-neutral core).

All entries live behind an authenticated JSON API; strict Actor isolation (ADR-0002): every read
and write checks `is_owner()` first so Visitors never trigger a request or receive memory in prompts.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
import re
import time
import unicodedata
import uuid
from dataclasses import dataclass, replace
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
DECAY_HALF_LIFE_DAYS = 30.0
STALE_OBSERVATION_DAYS = 60.0
STALE_OBSERVATION_MIN_SCORE = 0.25


@dataclass(frozen=True)
class OwnerMemorySettings:
    memory_enabled: bool = True
    auto_observe_enabled: bool = True
    last_synthesized_at: Optional[str] = None
    last_synthesis_hash: Optional[str] = None


@dataclass(frozen=True)
class OwnerMemoryItem:
    id: str
    kind: str
    content: str
    scope: Optional[str] = None
    source: str = "explicit"
    status: str = "active"
    replaces_memory_id: Optional[str] = None
    last_used_at: Optional[str] = None
    use_count: int = 0
    confidence: Optional[float] = None
    valid_to: Optional[str] = None
    evidence_snippet: Optional[str] = None
    source_thread_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


_OPEN_CONTROL_TAG_RE = re.compile(
    r"<(owner_memory|conversation_history|user_memory|context|document|turn|system|instructions?|prompt|developer|assistant|tool)\b",
    re.IGNORECASE,
)


def _escape_tag(text: str) -> str:
    escaped = (text or "").replace("</", "<\\/")
    return _OPEN_CONTROL_TAG_RE.sub(r"<\\\1", escaped)


def _memory_tokens(text: str) -> set[str]:
    decomposed = unicodedata.normalize("NFKD", (text or "").replace("đ", "d").replace("Đ", "D"))
    flat = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()
    return {tok for tok in re.findall(r"[a-z0-9]+", flat) if len(tok) >= 2}


def _parse_iso_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _is_expired(valid_to: Optional[str], now: datetime) -> bool:
    dt = _parse_iso_dt(valid_to)
    return dt is not None and dt <= now


def _age_days(item: OwnerMemoryItem, now: datetime) -> float:
    ts = _parse_iso_dt(item.last_used_at) or _parse_iso_dt(item.updated_at) or _parse_iso_dt(item.created_at)
    if ts is None:
        return 0.0
    delta = (now - ts).total_seconds() / 86400.0
    return max(delta, 0.0)


def _decay_weight(item: OwnerMemoryItem, now: datetime) -> float:
    days = _age_days(item, now)
    if days <= 0.0:
        return 1.0
    return 0.5 ** (days / DECAY_HALF_LIFE_DAYS)


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
    raw_last_used = raw.get("lastUsedAt") or raw.get("last_used_at")
    last_used_at = str(raw_last_used).strip() if isinstance(raw_last_used, str) and raw_last_used.strip() else None
    raw_use_count = raw.get("useCount") if "useCount" in raw else raw.get("use_count")
    try:
        use_count = max(int(raw_use_count), 0) if raw_use_count is not None else 0
    except (TypeError, ValueError):
        use_count = 0
    raw_conf = raw.get("confidence")
    confidence: Optional[float] = None
    if isinstance(raw_conf, (int, float)) and not isinstance(raw_conf, bool):
        confidence = float(raw_conf)
    raw_valid_to = raw.get("validTo") if "validTo" in raw else raw.get("valid_to")
    valid_to = str(raw_valid_to).strip() if isinstance(raw_valid_to, str) and raw_valid_to.strip() else None
    raw_evidence = raw.get("evidenceSnippet") if "evidenceSnippet" in raw else raw.get("evidence_snippet")
    evidence_snippet = str(raw_evidence).strip() if isinstance(raw_evidence, str) and raw_evidence.strip() else None
    raw_thread = raw.get("sourceThreadId") if "sourceThreadId" in raw else raw.get("source_thread_id")
    source_thread_id = str(raw_thread).strip() if isinstance(raw_thread, str) and raw_thread.strip() else None
    raw_created = raw.get("createdAt") or raw.get("created_at")
    created_at = str(raw_created).strip() if isinstance(raw_created, str) and raw_created.strip() else None
    raw_updated = raw.get("updatedAt") or raw.get("updated_at")
    updated_at = str(raw_updated).strip() if isinstance(raw_updated, str) and raw_updated.strip() else None
    return OwnerMemoryItem(
        id=mid,
        kind=kind,
        content=content,
        scope=scope,
        source=source,
        status=status,
        replaces_memory_id=replaces_id,
        last_used_at=last_used_at,
        use_count=use_count,
        confidence=confidence,
        valid_to=valid_to,
        evidence_snippet=evidence_snippet,
        source_thread_id=source_thread_id,
        created_at=created_at,
        updated_at=updated_at,
    )


def _is_dynamic_item(item: OwnerMemoryItem) -> bool:
    return item.source in ("suggested", "observed") or item.kind == "learning_note"


def _dynamic_relevance_score(
    item: OwnerMemoryItem,
    *,
    overlap: int,
    now: datetime,
) -> float:
    conf = item.confidence if item.confidence is not None else 0.85
    decay = _decay_weight(item, now)
    base = float(overlap) if overlap > 0 else 1.0
    return base * decay * conf


def _selection_sort_key(
    item: OwnerMemoryItem,
    *,
    wanted: Optional[str],
    query_tokens: set[str],
    now: datetime,
) -> tuple[int, int, float, int, str]:
    scope_rank = 0 if (wanted and item.scope == wanted) else 1
    priority = KIND_PRIORITY.get(item.kind, 99)
    if item.source == "explicit" and item.kind == "preference":
        return (0, scope_rank, 0.0, priority, item.id)
    if not query_tokens:
        if not _is_dynamic_item(item):
            return (1, scope_rank, 0.0, priority, item.id)
        score = _dynamic_relevance_score(item, overlap=0, now=now)
        return (2, scope_rank, -score, priority, item.id)

    overlap = len(query_tokens & _memory_tokens(item.content))
    if overlap > 0:
        score = _dynamic_relevance_score(item, overlap=overlap, now=now)
        origin_rank = 0 if item.source == "explicit" else 1
        return (1, origin_rank, -score, scope_rank * 100 + priority, item.id)
    return (2, scope_rank, 0.0, priority, item.id)


def _passes_threshold_gate(
    item: OwnerMemoryItem,
    *,
    query_tokens: set[str],
    now: datetime,
) -> bool:
    if not _is_dynamic_item(item):
        return True
    if not query_tokens:
        return True
    overlap = len(query_tokens & _memory_tokens(item.content))
    if overlap <= 0:
        return False
    if item.source == "observed" and _age_days(item, now) > STALE_OBSERVATION_DAYS and item.use_count < 2:
        return _dynamic_relevance_score(item, overlap=overlap, now=now) >= STALE_OBSERVATION_MIN_SCORE
    return True


def _prefix_stable_key(item: OwnerMemoryItem, *, wanted: Optional[str]) -> tuple[int, int, int, str]:
    # Pin deterministic explicit core entries ahead of dynamic items so prompt prefixes stay cacheable.
    origin_tier = 0 if item.source == "explicit" else 1
    scope_rank = 0 if (wanted and item.scope == wanted) else 1
    priority = KIND_PRIORITY.get(item.kind, 99)
    return (origin_tier, scope_rank, priority, item.id)


def select_owner_memories(
    items: Sequence[OwnerMemoryItem],
    *,
    scope: Optional[str] = None,
    query: Optional[str] = None,
    max_items: int = DEFAULT_MAX_ITEMS,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> List[OwnerMemoryItem]:
    """Filter active unexpired memories for `scope`/`query` within budget while keeping explicit prefixes stable."""
    if not items or max_items <= 0 or max_chars <= 0:
        return []

    now = datetime.now(timezone.utc)
    wanted = (scope or "").strip().lower() or None
    q_tokens = _memory_tokens(query) if query and query.strip() else set()
    eligible = [
        m
        for m in items
        if m.status == "active"
        and (m.scope is None or (wanted is not None and m.scope == wanted))
        and not _is_expired(m.valid_to, now)
        and _passes_threshold_gate(m, query_tokens=q_tokens, now=now)
    ]
    if not eligible:
        return []

    eligible.sort(key=lambda m: _selection_sort_key(m, wanted=wanted, query_tokens=q_tokens, now=now))

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

    selected.sort(key=lambda m: _prefix_stable_key(m, wanted=wanted))
    return selected


def _format_line(item: OwnerMemoryItem) -> str:
    # Deliberately omit database IDs in the prompt so the LLM never cites a memory ID as [[id]]
    scope_part = f" · scope:{_escape_tag(item.scope)}" if item.scope else ""
    return f"- [{_escape_tag(item.kind)}{scope_part}] {_escape_tag(item.content)}"


def format_owner_memory_detailed(
    items: Sequence[OwnerMemoryItem],
    *,
    note: str = "",
    scope: Optional[str] = None,
    query: Optional[str] = None,
    max_items: int = DEFAULT_MAX_ITEMS,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> Tuple[str, List[OwnerMemoryItem]]:
    """Build `<owner_memory>` block and return `(formatted_block, selected_items)`."""
    selected = select_owner_memories(
        items,
        scope=scope,
        query=query,
        max_items=max_items,
        max_chars=max_chars,
    )
    if not selected:
        return "", []
    lines = [_format_line(m) for m in selected]
    body = "<owner_memory>\n" + "\n".join(lines) + "\n</owner_memory>"
    block = f"{note}\n{body}" if note else body
    return block, selected


def format_owner_memory(
    items: Sequence[OwnerMemoryItem],
    *,
    note: str = "",
    scope: Optional[str] = None,
    query: Optional[str] = None,
    max_items: int = DEFAULT_MAX_ITEMS,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> Tuple[str, List[str]]:
    """Build `<owner_memory>` block and return `(formatted_block, selected_ids)`.

    Returns `("", [])` when no active memory applies.
    """
    block, selected = format_owner_memory_detailed(
        items,
        note=note,
        scope=scope,
        query=query,
        max_items=max_items,
        max_chars=max_chars,
    )
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

    @staticmethod
    def _parse_settings_dict(raw: Any) -> OwnerMemorySettings:
        if not isinstance(raw, dict):
            return OwnerMemorySettings()
        last_obs = raw.get("lastSynthesizedAt") or raw.get("last_synthesized_at")
        last_hash = raw.get("lastSynthesisHash") or raw.get("last_synthesis_hash")
        return OwnerMemorySettings(
            memory_enabled=bool(raw.get("memoryEnabled", True)),
            auto_observe_enabled=bool(raw.get("autoObserveEnabled", True)),
            last_synthesized_at=str(last_obs).strip() if isinstance(last_obs, str) and last_obs.strip() else None,
            last_synthesis_hash=str(last_hash).strip() if isinstance(last_hash, str) and last_hash.strip() else None,
        )

    async def list_memories_with_settings(
        self, status: str = "active"
    ) -> tuple[Optional[List[OwnerMemoryItem]], Optional[OwnerMemorySettings]]:
        params: dict[str, str] = {"status": status}
        if status == "active":
            params["includeSettings"] = "1"
        try:
            async with self._client() as client:
                resp = await client.get("/api/v1/memories", params=params)
            resp.raise_for_status()
            payload = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("owner_memory: failed to read memories (%s); continuing without memory", exc)
            return None, None
        raw_items = payload.get("memories") if isinstance(payload, dict) else None
        parsed_settings = (
            self._parse_settings_dict(payload.get("settings"))
            if isinstance(payload, dict) and isinstance(payload.get("settings"), dict)
            else None
        )
        if not isinstance(raw_items, list):
            return [], parsed_settings
        parsed = [_item_from_dict(row, self._scope_field) for row in raw_items]
        return [item for item in parsed if item is not None], parsed_settings

    async def list_memories(self, status: str = "active") -> Optional[List[OwnerMemoryItem]]:
        items, _ = await self.list_memories_with_settings(status=status)
        return items

    async def create_memory(
        self,
        *,
        kind: str,
        content: str,
        scope: Optional[str] = None,
        source: str = "explicit",
        status: str = "active",
        replaces_memory_id: Optional[str] = None,
        confidence: Optional[float] = None,
        valid_to: Optional[str] = None,
        evidence_snippet: Optional[str] = None,
        source_thread_id: Optional[str] = None,
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
        if confidence is not None:
            body["confidence"] = confidence
        if valid_to is not None:
            body["validTo"] = valid_to
        if evidence_snippet:
            body["evidenceSnippet"] = evidence_snippet
        if source_thread_id:
            body["sourceThreadId"] = source_thread_id
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

    async def get_activity_snapshot(self) -> Optional[dict[str, Any]]:
        try:
            async with self._client(timeout=10.0) as client:
                resp = await client.get("/api/v1/memories/activity-snapshot")
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            payload = resp.json()
            return payload if isinstance(payload, dict) else None
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("owner_memory: failed to fetch activity snapshot (%s)", exc)
            return None

    async def log_activity_event(self, payload: dict[str, Any]) -> bool:
        try:
            async with self._client(timeout=5.0) as client:
                resp = await client.post("/api/v1/memories/activity-events", json=payload)
            resp.raise_for_status()
            return True
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("owner_memory: failed to log activity event (%s)", exc)
            return False

    async def touch_memories(self, memory_ids: Sequence[str]) -> bool:
        ids = [mid.strip() for mid in memory_ids if isinstance(mid, str) and mid.strip()]
        if not ids:
            return False
        try:
            async with self._client(timeout=5.0) as client:
                resp = await client.patch("/api/v1/memories", json={"ids": ids[:50]})
            resp.raise_for_status()
            return True
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("owner_memory: failed to touch lastUsedAt (%s)", exc)
            return False

    async def update_memory(
        self,
        memory_id: str,
        *,
        kind: Optional[str] = None,
        content: Optional[str] = None,
        status: Optional[str] = None,
        confidence: Optional[float] = None,
        valid_to: Optional[str] = None,
    ) -> Optional[OwnerMemoryItem]:
        body: dict[str, Any] = {}
        if kind is not None:
            body["kind"] = kind
        if content is not None:
            body["content"] = content
        if status is not None:
            body["status"] = status
        if confidence is not None:
            body["confidence"] = confidence
        if valid_to is not None:
            body["validTo"] = valid_to
        if not body:
            return None
        async with self._client(timeout=10.0) as client:
            resp = await client.patch(f"/api/v1/memories/{memory_id}", json=body)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        payload = resp.json()
        raw = payload.get("memory") if isinstance(payload, dict) else None
        return _item_from_dict(raw, self._scope_field) if isinstance(raw, dict) else None

    async def get_settings(self) -> OwnerMemorySettings:
        try:
            async with self._client(timeout=5.0) as client:
                resp = await client.get("/api/v1/memories/settings")
            if resp.status_code == 404:
                return OwnerMemorySettings()
            resp.raise_for_status()
            payload = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("owner_memory: settings unavailable (%s); failing open to defaults", exc)
            return OwnerMemorySettings()
        raw = payload.get("settings") if isinstance(payload, dict) else None
        if not isinstance(raw, dict):
            return OwnerMemorySettings()
        last_obs = raw.get("lastSynthesizedAt") or raw.get("last_synthesized_at")
        last_hash = raw.get("lastSynthesisHash") or raw.get("last_synthesis_hash")
        return OwnerMemorySettings(
            memory_enabled=bool(raw.get("memoryEnabled", True)),
            auto_observe_enabled=bool(raw.get("autoObserveEnabled", True)),
            last_synthesized_at=str(last_obs).strip() if isinstance(last_obs, str) and last_obs.strip() else None,
            last_synthesis_hash=str(last_hash).strip() if isinstance(last_hash, str) and last_hash.strip() else None,
        )

    async def update_settings(
        self,
        *,
        memory_enabled: Optional[bool] = None,
        auto_observe_enabled: Optional[bool] = None,
        last_synthesized_at: Optional[str] = None,
        last_synthesis_hash: Optional[str] = None,
    ) -> Optional[OwnerMemorySettings]:
        body: dict[str, Any] = {}
        if memory_enabled is not None:
            body["memoryEnabled"] = memory_enabled
        if auto_observe_enabled is not None:
            body["autoObserveEnabled"] = auto_observe_enabled
        if last_synthesized_at is not None:
            body["lastSynthesizedAt"] = last_synthesized_at
        if last_synthesis_hash is not None:
            body["lastSynthesisHash"] = last_synthesis_hash
        if not body:
            return None
        try:
            async with self._client(timeout=5.0) as client:
                resp = await client.patch("/api/v1/memories/settings", json=body)
            resp.raise_for_status()
            payload = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.debug("owner_memory: failed to update settings (%s)", exc)
            return None
        raw = payload.get("settings") if isinstance(payload, dict) else None
        if not isinstance(raw, dict):
            return None
        last_obs = raw.get("lastSynthesizedAt") or raw.get("last_synthesized_at")
        last_hash = raw.get("lastSynthesisHash") or raw.get("last_synthesis_hash")
        return OwnerMemorySettings(
            memory_enabled=bool(raw.get("memoryEnabled", True)),
            auto_observe_enabled=bool(raw.get("autoObserveEnabled", True)),
            last_synthesized_at=str(last_obs).strip() if isinstance(last_obs, str) and last_obs.strip() else None,
            last_synthesis_hash=str(last_hash).strip() if isinstance(last_hash, str) and last_hash.strip() else None,
        )


class OwnerMemoryStore:
    """Owner-only memory store with short TTL RAM cache (API-backed or in-memory for tests)."""

    def __init__(self, api: Optional[OwnerMemoryApi] = None, cache_ttl: float = CACHE_TTL_SECONDS) -> None:
        self._api = api
        self._cache_ttl = cache_ttl
        self._cache: Optional[List[OwnerMemoryItem]] = None
        self._cached_at: float = 0.0
        self._settings: Optional[OwnerMemorySettings] = None
        self._settings_cached_at: float = 0.0
        # Local fallback store used when api is None (tests / offline mode)
        self._local: List[OwnerMemoryItem] = []
        self._local_settings: OwnerMemorySettings = OwnerMemorySettings()
        self._touch_tasks: set[asyncio.Task[Any]] = set()

    def invalidate(self) -> None:
        self._cache = None
        self._cached_at = 0.0
        self._settings = None
        self._settings_cached_at = 0.0

    def configure_scope_field(self, field_name: str) -> None:
        """Configure the host API JSON field name used for scope."""
        if self._api is not None:
            self._api.set_scope_field(field_name)

    def reset_local(self) -> None:
        self._local.clear()
        self._local_settings = OwnerMemorySettings()
        self.invalidate()

    def set_local_settings(
        self,
        *,
        memory_enabled: Optional[bool] = None,
        auto_observe_enabled: Optional[bool] = None,
        last_synthesized_at: Optional[str] = None,
        last_synthesis_hash: Optional[str] = None,
    ) -> OwnerMemorySettings:
        cur = self._local_settings
        self._local_settings = OwnerMemorySettings(
            memory_enabled=cur.memory_enabled if memory_enabled is None else memory_enabled,
            auto_observe_enabled=cur.auto_observe_enabled if auto_observe_enabled is None else auto_observe_enabled,
            last_synthesized_at=cur.last_synthesized_at if last_synthesized_at is None else last_synthesized_at,
            last_synthesis_hash=cur.last_synthesis_hash if last_synthesis_hash is None else last_synthesis_hash,
        )
        return self._local_settings

    async def get_settings(self) -> OwnerMemorySettings:
        if not is_owner():
            return OwnerMemorySettings(memory_enabled=False, auto_observe_enabled=False)
        if self._api is None or not hasattr(self._api, "get_settings"):
            return self._local_settings
        now = time.monotonic()
        if self._settings is not None and (now - self._settings_cached_at) < self._cache_ttl:
            return self._settings
        loaded = await self._api.get_settings()
        self._settings = loaded
        self._settings_cached_at = now
        return loaded

    async def update_settings(
        self,
        *,
        memory_enabled: Optional[bool] = None,
        auto_observe_enabled: Optional[bool] = None,
        last_synthesized_at: Optional[str] = None,
        last_synthesis_hash: Optional[str] = None,
    ) -> OwnerMemorySettings:
        if not is_owner():
            raise PermissionError("Only the Owner may update OwnerMemory settings.")
        if self._api is None or not hasattr(self._api, "update_settings"):
            return self.set_local_settings(
                memory_enabled=memory_enabled,
                auto_observe_enabled=auto_observe_enabled,
                last_synthesized_at=last_synthesized_at,
                last_synthesis_hash=last_synthesis_hash,
            )
        updated = await self._api.update_settings(
            memory_enabled=memory_enabled,
            auto_observe_enabled=auto_observe_enabled,
            last_synthesized_at=last_synthesized_at,
            last_synthesis_hash=last_synthesis_hash,
        )
        self._settings_cached_at = 0.0
        if updated is not None:
            self._settings = updated
            self._settings_cached_at = time.monotonic()
            return updated
        return await self.get_settings()

    async def is_memory_enabled(self) -> bool:
        if not is_owner():
            return False
        return (await self.get_settings()).memory_enabled

    async def is_auto_observe_enabled(self) -> bool:
        if not is_owner():
            return False
        cfg = await self.get_settings()
        return cfg.memory_enabled and cfg.auto_observe_enabled

    def _stamp_local_touch(self, memory_ids: Sequence[str], stamped_at: str) -> None:
        id_set = set(memory_ids)
        if not id_set:
            return
        if self._local:
            self._local = [
                replace(item, last_used_at=stamped_at, use_count=item.use_count + 1)
                if item.id in id_set
                else item
                for item in self._local
            ]
        if self._cache is not None:
            self._cache = [
                replace(item, last_used_at=stamped_at, use_count=item.use_count + 1)
                if item.id in id_set
                else item
                for item in self._cache
            ]

    def record_usage(self, memory_ids: Sequence[str]) -> Optional[str]:
        """Record actual prompt usage for the exact selected memory IDs."""
        clean_ids = [mid.strip() for mid in memory_ids if isinstance(mid, str) and mid.strip()]
        return self._schedule_touch(clean_ids)

    def _schedule_touch(self, memory_ids: Sequence[str]) -> Optional[str]:
        if not memory_ids or not is_owner():
            return None
        stamped_at = datetime.now(timezone.utc).isoformat()
        self._stamp_local_touch(memory_ids, stamped_at)
        if self._api is not None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return stamped_at
            task = loop.create_task(self._api.touch_memories(list(memory_ids)))
            self._touch_tasks.add(task)
            task.add_done_callback(self._touch_tasks.discard)
        return stamped_at

    async def flush_touches(self) -> None:
        if self._touch_tasks:
            await asyncio.gather(*list(self._touch_tasks), return_exceptions=True)

    async def list_active(
        self,
        scope: Optional[str] = None,
        *,
        query: Optional[str] = None,
        touch: bool = True,
    ) -> List[OwnerMemoryItem]:
        """Return active memories for the Owner only; always empty for Visitors or when disabled."""
        if not is_owner():
            return []
        if (
            self._settings is not None
            and (time.monotonic() - self._settings_cached_at) < self._cache_ttl
            and not self._settings.memory_enabled
        ):
            return []
        if self._api is None or not hasattr(self._api, "list_memories_with_settings"):
            if not await self.is_memory_enabled():
                return []
            items = await self._load_active()
        else:
            items = await self._load_active()
            if self._settings is not None and not self._settings.memory_enabled:
                return []

        if query and query.strip():
            selected = select_owner_memories(items, scope=scope, query=query)
            if touch:
                stamped_at = self.record_usage([m.id for m in selected])
                if stamped_at is not None:
                    return [replace(m, last_used_at=stamped_at) for m in selected]
            return selected
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
        if hasattr(self._api, "list_memories_with_settings"):
            loaded, loaded_settings = await self._api.list_memories_with_settings(status="active")
            if loaded_settings is not None:
                self._settings = loaded_settings
                self._settings_cached_at = now
            elif self._settings is None:
                self._settings = OwnerMemorySettings()
                self._settings_cached_at = now
        else:
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
        confidence: Optional[float] = None,
        valid_to: Optional[str] = None,
        evidence_snippet: Optional[str] = None,
        source_thread_id: Optional[str] = None,
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
        clean_evidence = (
            " ".join(evidence_snippet.split()).strip()[:200]
            if isinstance(evidence_snippet, str) and evidence_snippet.strip()
            else None
        )
        clean_thread = (
            source_thread_id.strip()[:120]
            if isinstance(source_thread_id, str) and source_thread_id.strip()
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
                confidence=confidence,
                valid_to=valid_to,
                evidence_snippet=clean_evidence,
                source_thread_id=clean_thread,
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
            confidence=confidence,
            valid_to=valid_to,
            evidence_snippet=clean_evidence,
            source_thread_id=clean_thread,
        )
        if created_item is None:
            raise RuntimeError("Failed to create OwnerMemory via API.")
        if created_item.status == "active":
            self.invalidate()
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

    async def update_item(
        self,
        memory_id: str,
        *,
        kind: Optional[str] = None,
        content: Optional[str] = None,
        status: Optional[str] = None,
        confidence: Optional[float] = None,
        valid_to: Optional[str] = None,
    ) -> Optional[OwnerMemoryItem]:
        if not is_owner():
            raise PermissionError("Only the Owner may update OwnerMemory.")
        if self._api is None or not hasattr(self._api, "update_memory"):
            for i, item in enumerate(self._local):
                if item.id == memory_id:
                    updated = replace(
                        item,
                        kind=kind if kind is not None else item.kind,
                        content=content if content is not None else item.content,
                        status=status if status is not None else item.status,
                        confidence=confidence if confidence is not None else item.confidence,
                        valid_to=valid_to if valid_to is not None else item.valid_to,
                    )
                    self._local[i] = updated
                    return updated
            return None
        updated_api = await self._api.update_memory(
            memory_id,
            kind=kind,
            content=content,
            status=status,
            confidence=confidence,
            valid_to=valid_to,
        )
        self.invalidate()
        return updated_api


def default_memory_api(*, scope_field: str = "scope") -> Optional[OwnerMemoryApi]:
    from rag_service.config import settings

    if settings.rag_adapter_mode == "http" and settings.admin_api_key:
        return OwnerMemoryApi(settings.nextjs_api_base_url, settings.admin_api_key, scope_field=scope_field)
    return None


owner_memory_store = OwnerMemoryStore(default_memory_api())
