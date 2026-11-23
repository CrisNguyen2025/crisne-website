from __future__ import annotations

from typing import Any

import httpx

from news_worker.schemas import ClaimedJob, JobCompletePayload


class NextJsJobClient:
    def __init__(self, base_url: str, admin_api_key: str, timeout: float = 15.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.admin_api_key = admin_api_key
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-admin-key": self.admin_api_key,
        }

    async def claim_next_job(self) -> ClaimedJob | None:
        client = self._get_client()
        res = await client.post(
            f"{self.base_url}/api/news/jobs/claim",
            headers=self._headers(),
        )
        res.raise_for_status()
        data = res.json()
        raw_job = data.get("job")
        if not raw_job:
            return None
        return ClaimedJob.model_validate(raw_job)

    async def complete_job(self, job_id: str, payload: JobCompletePayload) -> dict[str, Any]:
        client = self._get_client()
        res = await client.post(
            f"{self.base_url}/api/news/jobs/{job_id}/complete",
            headers=self._headers(),
            json=payload.model_dump(exclude_none=True),
        )
        res.raise_for_status()
        return dict(res.json())
