"""Tests for the Server-Sent Events (SSE) streaming endpoint."""

from __future__ import annotations

import json
from types import SimpleNamespace
import uuid

import httpx

from tests.conftest import stream_confirmed
import pytest

from rag_service.api.server import app
from rag_service.auth import OWNER_ONLY_MESSAGE
from rag_service.core.memory import owner_memory_store
from rag_service.state.session_store import session_store


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
async def test_chat_stream_old_plan_command_is_a_read_only_question(mock_adapter, owner_headers):
    """/plan is gone: the text is read as a learning-plan question, answered from the lessons, nothing written."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        resp = await client.post(
            "/chat/stream",
            json={"message": "/plan tạo lộ trình AI", "thread_id": "test-plan"},
        )
        assert resp.status_code == 200
        body = resp.text
        assert "preview_roadmap_plan" not in body
        assert "event: done" in body
        mock_adapter.create_topic.assert_not_called()


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


def _extract_action_previews(sse_body: str) -> list[dict]:
    out: list[dict] = []
    for block in sse_body.split("\n\n"):
        if block.startswith("event: action_preview\n"):
            data_line = block.split("data: ", 1)[1].splitlines()[0]
            out.append(json.loads(data_line))
    return out


@pytest.mark.asyncio
async def test_chat_confirm_executes_all_pending_slots(mock_adapter, owner_headers):
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "test-topic",
        "title": "Test Topic",
        "items": [{"id": "item-1", "title": "Existing Lesson", "section": "Core", "content": ""}],
        "sections": ["Core"],
    }
    mock_adapter.update_item.return_value = {"id": "item-1", "title": "Edited Lesson", "section": "Core"}
    mock_adapter.update_item_content.return_value = {"id": "item-1", "title": "Existing Lesson"}
    mock_adapter.update_section.return_value = {"success": True, "renamed": 2, "section": "Ops"}
    mock_adapter.create_item.return_value = {"id": "new-item-1", "slug": "fencing-token", "title": "Fencing Token"}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        # 1. pending_lesson_edit (with edited titles override)
        tid = f"confirm-edit-{uuid.uuid4()}"
        session_store.get_or_create(tid).pending_lesson_edit = {
            "item_id": "item-1",
            "topic_slug": "test-topic",
            "topic_title": "Test Topic",
            "old_title": "Existing Lesson",
            "old_section": "Core",
            "new_title": "Draft Rename",
            "new_section": "Core",
        }
        r_edit = (await client.post("/chat/confirm", json={"thread_id": tid, "titles": ["Edited Lesson"]})).json()
        assert r_edit["success"] is True and r_edit["kind"] == "lesson_edit"
        assert r_edit["changes"]["updated"] == 1 and r_edit["changes"]["entries"][0]["op"] == "update"
        assert session_store.get_or_create(tid).pending_lesson_edit is None

        # 2. pending_content_draft
        tid_c = f"confirm-content-{uuid.uuid4()}"
        session_store.get_or_create(tid_c).pending_content_draft = {
            "topic": "test-topic",
            "topic_title": "Test Topic",
            "item_id": "item-1",
            "title": "Existing Lesson",
            "html": "<h2>Tổng quan</h2><p>Chi tiết</p>",
            "write_mode": "append",
            "target_h2": "Tổng quan",
        }
        r_content = (await client.post("/chat/confirm", json={"thread_id": tid_c})).json()
        assert r_content["success"] is True and r_content["kind"] == "content_draft"
        assert r_content["changes"]["level"] == "content"
        assert r_content["changes"]["entries"][0]["level"] == "content"

        # 3. pending_memory_change
        tid_m = f"confirm-mem-{uuid.uuid4()}"
        session_store.get_or_create(tid_m).pending_memory_change = {
            "op": "create",
            "kind": "techstack",
            "content": "Đang dùng FastAPI",
            "scope_topic_slug": None,
        }
        r_mem = (await client.post("/chat/confirm", json={"thread_id": tid_m})).json()
        assert r_mem["success"] is True and r_mem["kind"] == "memory_change"
        assert r_mem["changes"]["entries"][0]["level"] == "memory"
        assert [m.content for m in await owner_memory_store.list_active()] == ["Đang dùng FastAPI"]

        # 4. pending_section_rename & pending_status_change & pending_concept_promotion
        tid_s = f"confirm-sec-{uuid.uuid4()}"
        session_store.get_or_create(tid_s).pending_section_rename = {
            "topic": "test-topic",
            "title": "Test Topic",
            "from": "Core",
            "to": "Ops",
            "count": 2,
            "merge": None,
        }
        r_sec = (await client.post("/chat/confirm", json={"thread_id": tid_s})).json()
        assert r_sec["success"] is True and r_sec["kind"] == "section_rename"
        assert r_sec["changes"]["entries"][0]["level"] == "section"

        tid_st = f"confirm-st-{uuid.uuid4()}"
        session_store.get_or_create(tid_st).pending_status_change = {
            "item_id": "item-1",
            "item_title": "Existing Lesson",
            "topic_slug": "test-topic",
            "old_status": "target",
            "new_status": "known",
        }
        r_st = (await client.post("/chat/confirm", json={"thread_id": tid_st})).json()
        assert r_st["success"] is True and r_st["kind"] == "status_change"
        assert r_st["changes"]["entries"][0]["op"] == "update"

        tid_cp = f"confirm-cp-{uuid.uuid4()}"
        session_store.get_or_create(tid_cp).pending_concept_promotion = {
            "mode": "create",
            "topic": "test-topic",
            "topic_title": "Test Topic",
            "section": "Core",
            "title": "Fencing Token",
            "status": "target",
            "description": "Token ngăn stale writer",
            "html": "<h2>Tổng quan</h2><p>Fencing</p>",
            "related_lessons": [],
        }
        r_cp = (await client.post("/chat/confirm", json={"thread_id": tid_cp})).json()
        assert r_cp["success"] is True and r_cp["kind"] == "concept_promotion"
        assert r_cp["changes"]["entries"][0]["op"] == "create"


@pytest.mark.asyncio
async def test_chat_cancel_clears_any_pending_slot_and_blocks_visitor(mock_adapter, owner_headers, visitor_headers):
    tid = f"cancel-any-{uuid.uuid4()}"
    session_store.get_or_create(tid).pending_content_draft = {"item_id": "item-1", "topic": "test-topic", "html": "<p>x</p>"}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        denied = (await client.post("/chat/cancel", headers=visitor_headers, json={"thread_id": tid})).json()
        assert denied == {"success": False, "message": OWNER_ONLY_MESSAGE}
        assert session_store.get_or_create(tid).pending_content_draft is not None

        ok = (await client.post("/chat/cancel", headers=owner_headers, json={"thread_id": tid})).json()
        assert ok["success"] is True and ok["kind"] == "content_draft"
        assert session_store.get_or_create(tid).pending_content_draft is None


@pytest.mark.asyncio
async def test_chat_plan_guards_actor_and_write_tools(owner_headers, visitor_headers, monkeypatch):
    from rag_service.api import routes as routes_mod

    class WritePickingLLM:
        async def ainvoke(self, prompt: str):
            return SimpleNamespace(content='{"tool": "create_layer", "args": {"title": "Hack"}, "reply": "ok"}')

    agent = routes_mod._get_agent()
    monkeypatch.setattr(agent, "llm", WritePickingLLM())

    tools = [
        {"name": "list_roadmaps", "description": "List", "inputSchema": {"type": "object", "properties": {}}},
        {"name": "create_layer", "description": "Create", "inputSchema": {"type": "object", "properties": {"title": {}}}},
    ]
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for headers in (visitor_headers, owner_headers):
            res = (await client.post("/chat/plan", headers=headers, json={"message": "tạo topic mới", "tools": tools})).json()
            assert res["tool"] is None


@pytest.mark.asyncio
async def test_stream_action_preview_emits_structured_metadata(mock_adapter, owner_headers):
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "test-topic",
        "title": "Test Topic",
        "items": [{"id": "item-1", "title": "Existing Lesson", "section": "Core Ops", "status": "known"}],
        "sections": ["Core Ops"],
    }
    cases = [
        ("tạo topic Kafka Streams", "cud", True),
        ("đổi tên bài Existing Lesson thành Existing v2 trong topic Test Topic", "lesson_edit", True),
        ("đánh dấu bài Existing Lesson là đang học", "status_change", False),
        ("nhớ giúp mình là mình dùng Rust", "memory_change", False),
        ("đổi tên mục Core Ops thành Ops trong topic Test Topic", "section_rename", True),
    ]
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        for idx, (msg, expected_kind, expects_titles) in enumerate(cases):
            tid = f"prev-meta-{idx}-{uuid.uuid4()}"
            resp = await client.post(
                "/chat/stream",
                json={"message": msg, "thread_id": tid, "context": {"roadmapSlug": "test-topic"}},
            )
            assert resp.status_code == 200
            previews = _extract_action_previews(resp.text)
            assert len(previews) == 1
            prev = previews[0]
            assert prev["action_id"] == tid
            assert prev["kind"] == expected_kind
            assert prev["confirmable"] is True
            if expects_titles:
                assert prev.get("editable_titles")
            if expected_kind == "status_change":
                assert "Xác nhận thực hiện" in prev["preview"]
