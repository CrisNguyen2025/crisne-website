"""HTTP API Adapter — calls the Next.js REST API at /api/v1/roadmaps/*.

Maps 1:1 to the 14 endpoints already available in the crisne-website backend.
"""

from __future__ import annotations

import httpx

from rag_service.adapters.errors import DuplicateEntityError
from rag_service.auth import require_owner


class HttpApiAdapter:
    """Adapter that proxies all CUD operations through the Next.js REST API."""

    def __init__(self, base_url: str = "http://localhost:3000", admin_key: str = "") -> None:
        self._base_url = base_url.rstrip("/")
        headers = {"Content-Type": "application/json"}
        if admin_key:
            headers["x-admin-key"] = admin_key
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=10.0,
            headers=headers,
        )

    async def close(self) -> None:
        """Gracefully close the underlying HTTP client."""
        await self._client.aclose()

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        json: dict | None = None,
    ) -> dict:
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

    # ── Topics (Roadmaps) ────────────────────────────────────────────────

    async def list_topics(self) -> list[dict]:
        """GET /api/v1/roadmaps"""
        data = await self._request("GET", "/api/v1/roadmaps")
        return data.get("roadmaps", [])

    async def export_full_hierarchy(self) -> list[dict]:
        """GET /api/v1/roadmaps/full-export"""
        try:
            data = await self._request("GET", "/api/v1/roadmaps/full-export")
            return data.get("roadmaps", [])
        except Exception:
            # Fallback to fetching topics one by one
            topics = await self.list_topics()
            results = []
            for t in topics:
                full = await self.get_topic(t["slug"])
                if full:
                    results.append(full)
            return results

    async def get_topic(self, slug: str) -> dict | None:
        """GET /api/v1/roadmaps/{slug}"""
        try:
            return await self._request("GET", f"/api/v1/roadmaps/{slug}")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            raise

    async def create_topic(
        self,
        title: str,
        short_code: str,
        description: str = "",
        layers: list[dict] | None = None,
    ) -> dict:
        """POST /api/v1/roadmaps"""
        payload = {
            "title": title,
            "shortCode": short_code,
            "description": description,
            "layers": layers or [{"title": "General", "shortTag": "01-GEN"}],
        }
        data = await self._request("POST", "/api/v1/roadmaps", json=payload)
        return data.get("roadmap", data)

    async def update_topic(self, slug: str, **kwargs: object) -> dict:
        """PATCH /api/v1/roadmaps/{slug}"""
        payload: dict = {}
        if "title" in kwargs:
            payload["title"] = kwargs["title"]
        if "short_code" in kwargs:
            payload["shortCode"] = kwargs["short_code"]
        if "description" in kwargs:
            payload["description"] = kwargs["description"]
        if "is_locked" in kwargs:
            payload["isLocked"] = kwargs["is_locked"]
        data = await self._request("PATCH", f"/api/v1/roadmaps/{slug}", json=payload)
        return data.get("roadmap", data)

    async def delete_topic(self, slug: str) -> bool:
        """DELETE /api/v1/roadmaps/{slug}"""
        try:
            data = await self._request("DELETE", f"/api/v1/roadmaps/{slug}")
            return data.get("success", True)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return False
            raise

    # ── Layers ───────────────────────────────────────────────────────────

    async def create_layer(
        self,
        topic_slug: str,
        title: str,
        short_tag: str,
        subtitle: str = "",
    ) -> dict:
        """POST /api/v1/roadmaps/{slug}/layers"""
        payload = {
            "title": title,
            "shortTag": short_tag,
            "subtitle": subtitle,
        }
        data = await self._request(
            "POST", f"/api/v1/roadmaps/{topic_slug}/layers", json=payload
        )
        return data.get("layer", data)

    async def update_layer(self, layer_id: str, **kwargs: object) -> dict:
        """PATCH /api/v1/roadmaps/layers/{id}"""
        payload: dict = {}
        if "title" in kwargs:
            payload["title"] = kwargs["title"]
        if "short_tag" in kwargs:
            payload["shortTag"] = kwargs["short_tag"]
        if "subtitle" in kwargs:
            payload["subtitle"] = kwargs["subtitle"]
        data = await self._request(
            "PATCH", f"/api/v1/roadmaps/layers/{layer_id}", json=payload
        )
        return data.get("layer", data)

    async def delete_layer(self, layer_id: str) -> bool:
        """DELETE /api/v1/roadmaps/layers/{id}"""
        try:
            data = await self._request(
                "DELETE", f"/api/v1/roadmaps/layers/{layer_id}"
            )
            return data.get("success", True)
        except httpx.HTTPStatusError:
            return False

    # ── Groups ───────────────────────────────────────────────────────────

    async def create_group(
        self,
        layer_id: str,
        title: str,
        level: str = "",
    ) -> dict:
        """POST /api/v1/roadmaps/groups"""
        payload: dict = {"layerId": layer_id, "title": title}
        if level:
            payload["level"] = level
        data = await self._request("POST", "/api/v1/roadmaps/groups", json=payload)
        return data.get("group", data)

    async def update_group(self, group_id: str, title: str) -> dict:
        """PATCH /api/v1/roadmaps/groups/{id}"""
        data = await self._request(
            "PATCH", f"/api/v1/roadmaps/groups/{group_id}", json={"title": title}
        )
        return data.get("group", data)

    async def delete_group(self, group_id: str) -> bool:
        """DELETE /api/v1/roadmaps/groups/{id}"""
        try:
            data = await self._request(
                "DELETE", f"/api/v1/roadmaps/groups/{group_id}"
            )
            return data.get("success", True)
        except httpx.HTTPStatusError:
            return False

    # ── Items ────────────────────────────────────────────────────────────

    async def create_item(
        self,
        layer_id: str,
        level: str,
        title: str,
        description: str = "",
        content: str = "",
    ) -> dict:
        """POST /api/v1/roadmaps/items"""
        payload = {
            "layerId": layer_id,
            "level": level,
            "title": title,
            "description": description,
            "content": content or None,
        }
        data = await self._request("POST", "/api/v1/roadmaps/items", json=payload)
        return data.get("item", data)

    async def update_item(self, item_id: str, **kwargs: object) -> dict:
        """PATCH /api/v1/roadmaps/items/{id}"""
        payload: dict = {}
        if "title" in kwargs:
            payload["title"] = kwargs["title"]
        if "description" in kwargs:
            payload["description"] = kwargs["description"]
        if "level" in kwargs:
            payload["level"] = kwargs["level"]
        data = await self._request(
            "PATCH", f"/api/v1/roadmaps/items/{item_id}", json=payload
        )
        return data.get("item", data)

    async def delete_item(self, item_id: str) -> bool:
        """DELETE /api/v1/roadmaps/items/{id}"""
        try:
            data = await self._request(
                "DELETE", f"/api/v1/roadmaps/items/{item_id}"
            )
            return data.get("success", True)
        except httpx.HTTPStatusError:
            return False
