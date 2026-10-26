"""Threads: every conversation has its own id, and a previewed change expires."""

from __future__ import annotations

import httpx
import pytest

from rag_service.api.schemas import ActionConfirmRequest, ChatRequest
from rag_service.api.server import app
import sys

from rag_service.state import session_store

# rag_service.state exports the store instance under the module's name; the module itself is here
session_module = sys.modules["rag_service.state.session_store"]


@pytest.mark.parametrize("thread", ["default", "DEFAULT", "visitor:default", "owner:default", "", "  "])
def test_shared_or_empty_thread_is_refused(thread):
    with pytest.raises(ValueError):
        ChatRequest(message="x", thread_id=thread)
    with pytest.raises(ValueError):
        ActionConfirmRequest(thread_id=thread)


def test_missing_thread_is_refused():
    with pytest.raises(ValueError):
        ChatRequest(message="x")


@pytest.mark.asyncio
async def test_api_answers_422_without_a_thread(owner_headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        missing = await client.post("/chat/stream", json={"message": "RAG là gì"})
        shared = await client.post("/chat/stream", json={"message": "RAG là gì", "thread_id": "owner:default"})
    assert missing.status_code == 422 and shared.status_code == 422


def test_preview_older_than_the_ttl_is_dropped(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(session_module, "_now", lambda: clock[0])
    ctx = session_store.get_or_create("ttl-thread")
    ctx.pending_confirmation = object()
    assert ctx.fresh_pending() is not None
    clock[0] += session_module.PENDING_TTL_SECONDS + 1
    assert ctx.fresh_pending() is None
    assert ctx.pending_confirmation is None


@pytest.mark.asyncio
async def test_late_ok_does_not_run_an_expired_preview(monkeypatch, mock_adapter, owner_headers):
    clock = [1000.0]
    monkeypatch.setattr(session_module, "_now", lambda: clock[0])
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        await client.post("/chat/stream", json={"message": "tạo cho tôi 3 topic A, B và C", "thread_id": "late-ok"})
        assert session_store.get_or_create("late-ok").pending_confirmation is not None
        clock[0] += session_module.PENDING_TTL_SECONDS + 1
        await client.post("/chat/stream", json={"message": "ok", "thread_id": "late-ok"})
    mock_adapter.create_topic.assert_not_called()
