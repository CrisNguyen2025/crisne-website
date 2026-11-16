"""Client of the Next.js thread routes (ADR-0012): where an Owner's thread is kept in Turso.

Shared by the conversation history and the state a thread keeps (what that state is, the domain decides),
so both read the same way and write through one queue. Reads are awaited; writes are sent in the background, in order, and a failed call only
logs: the caller always has the data in RAM.
"""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from typing import Deque, Optional, Tuple
from urllib.parse import quote

import httpx

from rag_service.auth import is_owner

# Only an Owner's thread is stored; the Next.js proxy prefixes every thread id with its Actor
OWNER_THREAD_PREFIX = "owner:"
READ_TIMEOUT_SECONDS = 2.0
WRITE_TIMEOUT_SECONDS = 10.0
# Writes waiting for the network; past this the oldest are dropped, the data stays in RAM
MAX_PENDING_WRITES = 1000

log = logging.getLogger(__name__)


class ThreadApi:
    def __init__(self, base_url: str, admin_key: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {"Content-Type": "application/json", "x-admin-key": admin_key}
        self._pending: Deque[Tuple[str, str, Optional[dict]]] = deque(maxlen=MAX_PENDING_WRITES)
        self._worker: Optional[asyncio.Task] = None

    @staticmethod
    def stored(thread_id: str) -> bool:
        """Whether this thread may leave RAM. Checked at the call, while the request's Actor is still set:
        the background writer cannot see it."""
        return is_owner() and (thread_id or "").startswith(OWNER_THREAD_PREFIX)

    @staticmethod
    def _path(thread_id: str) -> str:
        return f"/api/v1/threads/{quote(thread_id, safe='')}"

    async def read(self, thread_id: str) -> Optional[dict]:
        """The thread's `messages` and `state`, or None when the API cannot be reached."""
        try:
            async with self._client(READ_TIMEOUT_SECONDS) as client:
                resp = await client.get(self._path(thread_id))
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("thread: could not read %s (%s); continuing from RAM", thread_id, exc)
            return None
        return data if isinstance(data, dict) else None

    def write_later(self, method: str, thread_id: str, body: Optional[dict] = None) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # No event loop to send from: this change stays in RAM
        self._pending.append((method, self._path(thread_id), body))
        if self._worker is None or self._worker.done():
            self._worker = loop.create_task(self._drain())

    async def flush(self) -> None:
        """Wait until every queued write was sent (tests, and a clean shutdown)."""
        if self._worker is not None:
            await self._worker

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self._base_url, headers=self._headers, timeout=timeout)

    async def _drain(self) -> None:
        # One writer, so a thread's changes reach the API in the order they were made
        while self._pending:
            method, path, body = self._pending.popleft()
            try:
                async with self._client(WRITE_TIMEOUT_SECONDS) as client:
                    resp = await client.request(method, path, json=body)
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                log.warning("thread: %s %s failed (%s); kept in RAM only", method, path, exc)


def default_thread_api() -> Optional[ThreadApi]:
    """The API client when the Next.js app can be reached with the admin key, else None (RAM only)."""
    from rag_service.config import settings

    if settings.rag_adapter_mode == "http" and settings.admin_api_key:
        return ThreadApi(settings.nextjs_api_base_url, settings.admin_api_key)
    return None
