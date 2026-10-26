"""A chat turn waits at most SYNC_WAIT_SECONDS for the first index; the sync itself keeps running."""

from __future__ import annotations

import asyncio
import time

from rag_service.domains.roadmap.retrieval import engine as engine_module
from rag_service.domains.roadmap.retrieval.engine import rag_engine


def test_turn_does_not_wait_longer_than_the_bound(monkeypatch):
    monkeypatch.setattr(engine_module, "SYNC_WAIT_SECONDS", 0.2)
    monkeypatch.setattr(rag_engine, "_is_synced", False)
    finished = []

    async def slow_sync():
        await asyncio.sleep(1.0)  # a re-index stuck on quota
        finished.append(True)
        return 0

    monkeypatch.setattr(rag_engine, "sync_live_database", slow_sync)
    monkeypatch.setattr(rag_engine, "_sync_task", None)

    async def run():
        t0 = time.monotonic()
        await rag_engine._wait_for_index()
        waited = time.monotonic() - t0
        assert waited < 0.8, waited
        assert not finished  # the turn moved on; the sync is still running
        await rag_engine._sync_task  # and it completes in the background
        assert finished

    asyncio.run(run())


def test_synced_index_is_not_waited_for(monkeypatch):
    monkeypatch.setattr(rag_engine, "_is_synced", True)
    monkeypatch.setattr(rag_engine, "_sync_task", None)

    async def run():
        t0 = time.monotonic()
        await rag_engine._wait_for_index()
        assert time.monotonic() - t0 < 0.05

    asyncio.run(run())
