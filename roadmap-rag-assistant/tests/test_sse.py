"""Tests for the Server-Sent Events (SSE) streaming endpoint."""

from __future__ import annotations

import httpx

from tests.conftest import stream_confirmed
import pytest

from rag_service.api.server import app


@pytest.mark.asyncio
async def test_chat_stream_endpoint_returns_sse(mock_adapter, owner_headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        resp = await client.post("/chat/stream", json={"message": "hybrid search là gì", "thread_id": "test-stream-ct"})
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        # A new topic without an explicit name is previewed first; the confirmed turn runs it
        body = await stream_confirmed(client, "tạo cho tôi 3 topic A, B và C", "test-stream")
        assert "event: tool_start" in body
        assert "event: tool_end" in body
        assert "event: token" in body
        assert "event: done" in body
        assert "create_topic" in body  # a confirmed batch reports the singular tool name


@pytest.mark.asyncio
async def test_chat_stream_plan_mode(mock_adapter, owner_headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        resp = await client.post(
            "/chat/stream",
            json={"message": "/plan tạo lộ trình AI", "thread_id": "test-plan"},
        )
        assert resp.status_code == 200
        body = resp.text
        assert "event: tool_start" in body
        assert "preview_roadmap_plan" in body
        assert "event: done" in body


@pytest.mark.asyncio
async def test_chat_confirm_and_cancel_endpoints(mock_adapter, owner_headers):
    from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
    from rag_service.state.session_store import session_store

    thread_id = "test-confirm-thread"
    # Set pending confirmation
    act = StructuredRoadmapAction(
        action=ActionType.DELETE,
        entity_level=EntityLevel.TOPIC,
        target_parent_identifier="mock-topic",
        entities=[SingleEntity(title="mock-topic", short_code="MOC")],
        raw_intent_summary="DELETE TOPIC mock-topic",
    )
    session_store.set_pending_confirmation(thread_id, act)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        # Confirm
        resp = await client.post("/chat/confirm", json={"thread_id": thread_id})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "Đã xóa topic" in data["message"]
        # Pending confirmation should now be cleared
        assert session_store.get_or_create(thread_id).pending_confirmation is None

        # Re-set pending confirmation and test Cancel
        session_store.set_pending_confirmation(thread_id, act)
        resp_cancel = await client.post("/chat/cancel", json={"thread_id": thread_id})
        assert resp_cancel.status_code == 200
        data_cancel = resp_cancel.json()
        assert data_cancel["success"] is True
        assert "Đã hủy bỏ" in data_cancel["message"]
        assert session_store.get_or_create(thread_id).pending_confirmation is None



TRACE_ID = "0123456789abcdef0123456789abcdef"


class FakeObservation:
    trace_id = TRACE_ID

    def start_observation(self, **kwargs):
        return FakeObservation()

    def update(self, **kwargs):
        pass

    def end(self):
        pass


class FakeLangfuse:
    def start_observation(self, **kwargs):
        return FakeObservation()


async def _done_payload(owner_headers, thread_id: str) -> dict:
    import json

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        resp = await client.post("/chat/stream", json={"message": "xin chào", "thread_id": thread_id})
    return json.loads(resp.text.split("event: done\ndata: ")[1].split("\n")[0])


@pytest.mark.asyncio
async def test_done_carries_the_turn_trace_id_for_feedback(mock_adapter, owner_headers, monkeypatch):
    from rag_service import observability

    monkeypatch.setattr(observability, "get_langfuse", lambda: FakeLangfuse())
    assert (await _done_payload(owner_headers, "trace-on"))["trace_id"] == TRACE_ID


@pytest.mark.asyncio
async def test_trace_id_is_sent_before_the_reply(mock_adapter, owner_headers, monkeypatch):
    from rag_service import observability

    monkeypatch.setattr(observability, "get_langfuse", lambda: FakeLangfuse())
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        resp = await client.post("/chat/stream", json={"message": "xin chào", "thread_id": "trace-first"})
    body = resp.text
    # A reply stopped mid-stream never gets `done`, but can still be rated
    assert f'event: trace\ndata: {{"trace_id": "{TRACE_ID}"}}' in body
    assert body.index("event: trace") < body.index("event: token")


@pytest.mark.asyncio
async def test_done_has_no_trace_id_when_tracing_is_off(mock_adapter, owner_headers, monkeypatch):
    from rag_service import observability

    monkeypatch.setattr(observability, "get_langfuse", lambda: None)
    assert "trace_id" not in await _done_payload(owner_headers, "trace-off")
