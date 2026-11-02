"""HTTP API Adapter — calls the Next.js REST API at /api/v1/roadmaps/*.

Maps 1:1 to the endpoints of the crisne-website backend (ADR-0009: a topic's lessons, each with a section).
"""

from __future__ import annotations

import httpx

from rag_service.adapters.errors import DuplicateEntityError
from rag_service.auth import require_owner
from rag_service.write_grant import guard_writes


@guard_writes
class HttpApiAdapter:
    """Adapter that proxies all CUD operations through the Next.js REST API."""

    def __init__(self, base_url: str = "http://localhost:3000", admin_key: str = "") -> None:
        self._base_url = base_url.rstrip("/")
        headers = {"Content-Type": "application/json"}
        if admin_key:
            headers["x-admin-key"] = admin_key
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=10.0, headers=headers)

    async def close(self) -> None:
        """Gracefully close the underlying HTTP client."""
        await self._client.aclose()

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _request(self, method: str, path: str, json: dict | None = None) -> dict:
        # Every write sends ADMIN_API_KEY: only the site owner may trigger one
        if method.upper() != "GET":
            require_owner()
        resp = await self._client.request(method, path, json=json)
        if resp.status_code == 409:
            body = resp.json() if resp.content else {}
            if body.get("code") == "DUPLICATE":
                existing = body.get("existing") or {}
                raise DuplicateEntityError(body.get("kind", "entity"), existing.get("title", ""), existing)
        resp.raise_for_status()
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()

    # ── Topics ───────────────────────────────────────────────────────────

    async def list_topics(self) -> list[dict]:
        """GET /api/v1/roadmaps"""
        data = await self._request("GET", "/api/v1/roadmaps")
        return data.get("roadmaps", [])

    async def export_full_hierarchy(self) -> list[dict]:
        """GET /api/v1/roadmaps/full-export: every topic with its lessons.

        Raises unless the response holds a `roadmaps` list: an empty list is the only way to say "no roadmap".
        """
        data = await self._request("GET", "/api/v1/roadmaps/full-export")
        roadmaps = data.get("roadmaps")
        if not isinstance(roadmaps, list):
            raise ValueError("full-export response has no 'roadmaps' list")
        return roadmaps

    async def get_topic(self, slug: str) -> dict | None:
        """GET /api/v1/roadmaps/{slug}: the topic, its lessons in page order, and its sections."""
        try:
            data = await self._request("GET", f"/api/v1/roadmaps/{slug}")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            raise
        return {**data.get("roadmap", {}), "items": data.get("items", []), "sections": data.get("sections", [])}

    async def create_topic(self, title: str, description: str = "") -> dict:
        """POST /api/v1/roadmaps"""
        data = await self._request("POST", "/api/v1/roadmaps", json={"title": title, "description": description})
        return data.get("roadmap", data)

    async def update_topic(self, slug: str, **kwargs: object) -> dict:
        """PATCH /api/v1/roadmaps/{slug}"""
        payload = {k: v for k, v in kwargs.items() if k in ("title", "description", "isLocked")}
        data = await self._request("PATCH", f"/api/v1/roadmaps/{slug}", json=payload)
        return data.get("roadmap", data)

    async def delete_topic(self, slug: str) -> bool:
        """DELETE /api/v1/roadmaps/{slug}"""
        try:
            await self._request("DELETE", f"/api/v1/roadmaps/{slug}")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return False
            raise
        return True

    # ── Lessons ──────────────────────────────────────────────────────────

    async def create_item(
        self,
        topic_slug: str,
        section: str | None,
        title: str,
        description: str = "",
        content: str = "",
    ) -> dict:
        """POST /api/v1/roadmaps/items"""
        payload = {"roadmapSlug": topic_slug, "section": section, "title": title, "description": description}
        if content:
            payload["content"] = content
        data = await self._request("POST", "/api/v1/roadmaps/items", json=payload)
        return data.get("item", data)

    async def update_item(self, item_id: str, **kwargs: object) -> dict:
        """PATCH /api/v1/roadmaps/items/{id}"""
        payload = {k: v for k, v in kwargs.items() if k in ("title", "description", "section")}
        data = await self._request("PATCH", f"/api/v1/roadmaps/items/{item_id}", json=payload)
        return data.get("item", data)

    async def delete_item(self, item_id: str) -> bool:
        """DELETE /api/v1/roadmaps/items/{id}"""
        await self._request("DELETE", f"/api/v1/roadmaps/items/{item_id}")
        return True

    async def update_section(self, topic_slug: str, from_name: str, to_name: str) -> dict:
        """PATCH /api/v1/roadmaps/{slug}/sections"""
        return await self._request(
            "PATCH", f"/api/v1/roadmaps/{topic_slug}/sections", json={"from": from_name, "to": to_name}
        )

    async def update_item_order(self, topic_slug: str, ordered_ids: list[str]) -> bool:
        """POST /api/v1/roadmaps/items/reorder"""
        await self._request("POST", "/api/v1/roadmaps/items/reorder", json={"orderedItemIds": ordered_ids})
        return True
