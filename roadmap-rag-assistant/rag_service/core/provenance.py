from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

import httpx

from rag_service.auth import is_owner

log = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30.0
API_TIMEOUT_SECONDS = 5.0
MAX_SOURCES_PER_DOCUMENT = 4


@dataclass(frozen=True)
class ExternalSourceItem:
    source_name: str
    source_url: str
    source_title: str
    relation_type: str = "derived_from"
    collected_at: str = ""

    def to_dict(self) -> dict[str, str]:
        return {
            "source_name": self.source_name,
            "source_url": self.source_url,
            "source_title": self.source_title,
            "relation_type": self.relation_type,
            "collected_at": self.collected_at,
        }


def _escape_tag(text: str) -> str:
    return text.replace("</", "<\\/")


def _item_from_dict(raw: dict[str, Any]) -> Optional[ExternalSourceItem]:
    if not isinstance(raw, dict):
        return None
    source_name = str(raw.get("sourceName") or raw.get("source_name") or "").strip()
    source_url = str(raw.get("sourceUrl") or raw.get("source_url") or "").strip()
    source_title = str(raw.get("sourceTitle") or raw.get("source_title") or "").strip()
    if not source_name or not source_url:
        return None
    relation_type = str(raw.get("relationType") or raw.get("relation_type") or "derived_from").strip()
    collected_at = str(raw.get("collectedAt") or raw.get("collected_at") or "").strip()
    return ExternalSourceItem(
        source_name=source_name[:160],
        source_url=source_url[:500],
        source_title=(source_title or source_name)[:240],
        relation_type=relation_type[:40],
        collected_at=collected_at[:40],
    )


def format_lesson_provenance_lines(items: Sequence[ExternalSourceItem]) -> List[str]:
    if not items:
        return []
    lines = ["Nguồn gốc bên ngoài của tài liệu (Document → External Source):"]
    for item in list(items)[:MAX_SOURCES_PER_DOCUMENT]:
        lines.append(
            f"- {_escape_tag(item.source_name)} · {_escape_tag(item.source_title)}"
        )
    return lines


def format_fallback_provenance_footer(
    matches: Sequence[tuple[Any, float]],
    by_doc_id: Dict[str, List[ExternalSourceItem]],
) -> str:
    if not by_doc_id:
        return ""
    blocks: List[str] = []
    for doc, _ in matches:
        doc_id = str(getattr(doc, "id", ""))
        sources = by_doc_id.get(doc_id)
        if not sources:
            continue
        title = str(getattr(doc, "title", doc_id))
        joined = "; ".join(f"{s.source_name} ({s.source_title})" for s in sources[:MAX_SOURCES_PER_DOCUMENT])
        blocks.append(f"- **{title}** → {joined}")
    if not blocks:
        return ""
    return "\n\n**Nguồn gốc tài liệu (Owner):**\n" + "\n".join(blocks)


class LessonProvenanceApi:
    def __init__(
        self,
        base_url: str,
        admin_key: str,
        *,
        endpoint_path: str = "/api/v1/provenance",
        query_param: str = "ids",
        response_field: str = "byId",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {"Content-Type": "application/json", "x-admin-key": admin_key}
        self._endpoint_path = endpoint_path
        self._query_param = query_param
        self._response_field = response_field

    async def fetch_by_lessons(self, doc_ids: Sequence[str]) -> Optional[Dict[str, List[ExternalSourceItem]]]:
        clean_ids = [i.strip() for i in doc_ids if isinstance(i, str) and i.strip()][:10]
        if not clean_ids:
            return {}
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url,
                headers=self._headers,
                timeout=API_TIMEOUT_SECONDS,
            ) as client:
                resp = await client.get(
                    self._endpoint_path,
                    params={self._query_param: ",".join(clean_ids)},
                )
            resp.raise_for_status()
            payload = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("provenance: failed to load provenance (%s); continuing without it", exc)
            return None

        raw_map = payload.get(self._response_field) if isinstance(payload, dict) else None
        if not isinstance(raw_map, dict):
            return {}

        parsed: Dict[str, List[ExternalSourceItem]] = {}
        for did, raw_list in raw_map.items():
            if not isinstance(did, str) or not isinstance(raw_list, list):
                continue
            items = [item for raw in raw_list if (item := _item_from_dict(raw)) is not None]
            if items:
                parsed[did] = items
        return parsed


class LessonProvenanceStore:
    def __init__(self, api: Optional[LessonProvenanceApi] = None, cache_ttl: float = CACHE_TTL_SECONDS) -> None:
        self._api = api
        self._cache_ttl = cache_ttl
        self._cache: Dict[str, tuple[float, List[ExternalSourceItem]]] = {}
        self._local: Dict[str, List[ExternalSourceItem]] = {}

    def invalidate(self) -> None:
        self._cache.clear()

    def set_local(self, doc_id: str, items: Sequence[ExternalSourceItem]) -> None:
        self._local[doc_id] = list(items)

    def reset_local(self) -> None:
        self._local.clear()
        self.invalidate()

    def _read_cached_provenances(
        self, clean_ids: Sequence[str], now: float
    ) -> tuple[Dict[str, List[ExternalSourceItem]], List[str]]:
        result: Dict[str, List[ExternalSourceItem]] = {}
        missing: List[str] = []
        for did in clean_ids:
            cached = self._cache.get(did)
            if cached is not None and (now - cached[0]) < self._cache_ttl:
                if cached[1]:
                    result[did] = list(cached[1])
            else:
                missing.append(did)
        return result, missing

    async def get_for_lessons(self, doc_ids: Sequence[str]) -> Dict[str, List[ExternalSourceItem]]:
        if not is_owner():
            return {}
        clean_ids = list(dict.fromkeys(i.strip() for i in doc_ids if isinstance(i, str) and i.strip()))[:10]
        if not clean_ids:
            return {}

        if self._api is None:
            return {did: list(self._local[did]) for did in clean_ids if self._local.get(did)}

        now = time.monotonic()
        result, missing = self._read_cached_provenances(clean_ids, now)
        if not missing:
            return result

        fetched = await self._api.fetch_by_lessons(missing)
        if fetched is not None:
            for did in missing:
                items = fetched.get(did, [])
                self._cache[did] = (now, items)
                if items:
                    result[did] = list(items)

        return result


def default_provenance_api(
    *,
    endpoint_path: str = "/api/v1/provenance",
    query_param: str = "ids",
    response_field: str = "byId",
) -> Optional[LessonProvenanceApi]:
    from rag_service.config import settings

    if settings.rag_adapter_mode == "http" and settings.admin_api_key:
        return LessonProvenanceApi(
            settings.nextjs_api_base_url,
            settings.admin_api_key,
            endpoint_path=endpoint_path,
            query_param=query_param,
            response_field=response_field,
        )
    return None
