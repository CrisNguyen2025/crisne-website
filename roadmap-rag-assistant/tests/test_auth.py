"""Access control: only the Next.js proxy may call the service, only the owner may write."""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from rag_service.adapters.http_adapter import HttpApiAdapter
from rag_service.adapters.sqlite_adapter import SqliteAdapter
from rag_service.api.server import app
from rag_service.auth import (
    OWNER_ONLY_MESSAGE,
    current_actor,
    is_valid_internal_key,
    parse_actor,
)
from rag_service.domains.roadmap.router.schemas import (
    ActionType,
    EntityLevel,
    SingleEntity,
    StructuredRoadmapAction,
)
from rag_service.state import session_store


@pytest.fixture
def visitor_headers(owner_headers) -> dict[str, str]:
    """Headers the Next.js proxy sends for an anonymous visitor."""
    return {**owner_headers, "x-actor": "visitor"}


@pytest.fixture
def as_visitor():
    """Undo the owner default from conftest for code called outside a request."""
    token = current_actor.set("visitor")
    yield
    current_actor.reset(token)


def _client(headers: dict[str, str] | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test", headers=headers or {}
    )


async def _stream(message: str, headers: dict[str, str], thread_id: str) -> str:
    async with _client(headers) as client:
        resp = await client.post("/chat/stream", json={"message": message, "thread_id": thread_id})
    assert resp.status_code == 200
    return resp.text


# ── Internal key: the service is reachable only through the Next.js proxy ──────


@pytest.mark.asyncio
@pytest.mark.parametrize("headers", [{}, {"x-internal-key": "wrong-key"}])
async def test_rejects_requests_without_the_internal_key(headers):
    async with _client(headers) as client:
        resp = await client.post("/chat/stream", json={"message": "liệt kê topic"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_rejects_every_request_when_no_key_is_configured(monkeypatch):
    from rag_service.config import settings

    monkeypatch.setattr(settings, "internal_api_key", "")
    async with _client({"x-internal-key": ""}) as client:
        resp = await client.post("/chat", json={"message": "liệt kê topic"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_health_stays_open_for_uptime_checks():
    async with _client() as client:
        resp = await client.get("/health")
    assert resp.status_code == 200


def test_internal_key_and_actor_parsing():
    assert is_valid_internal_key("k", "k")
    assert not is_valid_internal_key("k", "")
    assert not is_valid_internal_key(None, "k")
    assert parse_actor("owner") == "owner"
    # Anything but the exact value is a visitor
    assert parse_actor("Owner") == "visitor"
    assert parse_actor(None) == "visitor"


# ── Visitors may read but never write ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_visitor_cannot_create_topics(mock_adapter, visitor_headers):
    body = await _stream("tạo cho tôi 3 topic A, B và C", visitor_headers, "visitor-create")

    assert OWNER_ONLY_MESSAGE.split()[1] in body  # streamed token by token
    mock_adapter.create_topic.assert_not_called()


@pytest.mark.asyncio
async def test_visitor_cannot_skip_delete_confirmation_with_ngay(mock_adapter, visitor_headers):
    body = await _stream("xóa topic test-topic ngay", visitor_headers, "visitor-delete")

    assert "owner" in body
    mock_adapter.delete_topic.assert_not_called()


@pytest.mark.asyncio
async def test_visitor_cannot_generate_a_roadmap_from_a_template(mock_adapter, visitor_headers):
    body = await _stream("/goal template ai-engineering", visitor_headers, "visitor-goal")

    assert "owner" in body
    assert "generate_roadmap_from_template" not in body
    mock_adapter.create_topic.assert_not_called()


@pytest.mark.asyncio
async def test_visitor_can_still_read(mock_adapter, visitor_headers):
    body = await _stream("liệt kê topic", visitor_headers, "visitor-read")

    assert "list_topics" in body
    mock_adapter.list_topics.assert_called()


@pytest.mark.asyncio
async def test_owner_can_create_topics(mock_adapter, owner_headers):
    await _stream("tạo cho tôi 3 topic A, B và C", owner_headers, "owner-create")

    mock_adapter.create_topic.assert_called()


@pytest.mark.asyncio
async def test_visitor_cannot_confirm_a_pending_action(mock_adapter, visitor_headers):
    thread_id = "visitor-confirm"
    session_store.get_or_create(thread_id).pending_confirmation = StructuredRoadmapAction(
        action=ActionType.DELETE,
        entity_level=EntityLevel.TOPIC,
        entities=[SingleEntity(title="test-topic")],
    )

    async with _client(visitor_headers) as client:
        resp = await client.post("/chat/confirm", json={"thread_id": thread_id})

    assert resp.json() == {"success": False, "message": OWNER_ONLY_MESSAGE}
    mock_adapter.delete_topic.assert_not_called()


# ── Hard gate in the adapters: every write path ends here ──────────────────────


@pytest.mark.asyncio
async def test_http_adapter_refuses_writes_for_visitors(as_visitor):
    adapter = HttpApiAdapter("http://next.test", admin_key="admin")
    adapter._client = AsyncMock()
    adapter._client.request.return_value = httpx.Response(
        200, json={"roadmaps": []}, request=httpx.Request("GET", "http://next.test/api/v1/roadmaps")
    )

    with pytest.raises(PermissionError):
        await adapter.create_topic(title="X", short_code="X")
    adapter._client.request.assert_not_called()

    # Reads still go through
    assert await adapter.list_topics() == []


@pytest.mark.asyncio
async def test_sqlite_adapter_refuses_writes_for_visitors(as_visitor, tmp_path):
    adapter = SqliteAdapter(str(tmp_path / "unused.db"))

    with pytest.raises(PermissionError):
        await adapter.delete_topic("test-topic")
