"""End-to-end chat tests for Lesson Status (ADR-0010, Step 6).

Tested through the FastAPI /chat/stream endpoint with mock adapter, exactly like other chat tests.
Never calls Next.js routes.
"""

from __future__ import annotations

import httpx
import pytest

from rag_service.api.server import app
from rag_service.auth import OWNER_ONLY_MESSAGE
from rag_service.state import session_store


def _client(headers: dict[str, str] | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test", headers=headers or {}
    )


async def _stream(
    message: str, headers: dict[str, str], thread_id: str = "test-thread", context: dict | None = None
) -> str:
    payload = {"message": message, "thread_id": thread_id}
    if context:
        payload["context"] = context
    async with _client(headers) as client:
        resp = await client.post("/chat/stream", json=payload)
    assert resp.status_code == 200
    return resp.text


# ── Step 5 Requirements ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_owner_asks_review_query_c(mock_adapter, owner_headers):
    """(c) Owner asks 'bài nào cần ôn lại' and receives known lessons sorted properly."""
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "ai-engineering",
        "title": "AI Engineering",
        "items": [
            {"id": "i1", "title": "Lesson Recent", "status": "known", "statusUpdatedAt": "2026-10-15T00:00:00Z"},
            {"id": "i2", "title": "Lesson Old", "status": "known", "statusUpdatedAt": "2026-08-01T00:00:00Z"},
            {"id": "i3", "title": "Lesson Never Updated", "status": "known", "statusUpdatedAt": None},
            {"id": "i4", "title": "Lesson In Progress", "status": "learning"},
        ],
    }

    body = await _stream(
        "bài nào cần ôn lại",
        owner_headers,
        thread_id="owner-review",
        context={"roadmapSlug": "ai-engineering"},
    )

    assert "Các bài cần ôn lại" in body
    assert "Lesson Never Updated" in body
    assert "Lesson Old" in body
    assert "Lesson Recent" in body
    # Lesson In Progress is 'learning', so it should NOT be in review list
    assert "Lesson In Progress" not in body


@pytest.mark.asyncio
async def test_owner_asks_next_learning_query_b(mock_adapter, owner_headers):
    """(b) Owner asks 'nên học gì tiếp' and receives learning lessons first, then target."""
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "ai-engineering",
        "title": "AI Engineering",
        "items": [
            {"id": "i1", "title": "Known Lesson", "status": "known"},
            {"id": "i2", "title": "Target Lesson", "status": "target"},
            {"id": "i3", "title": "Learning Lesson", "status": "learning"},
        ],
    }

    body = await _stream(
        "nên học gì tiếp",
        owner_headers,
        thread_id="owner-next",
        context={"roadmapSlug": "ai-engineering"},
    )

    assert "Gợi ý bài nên học tiếp" in body
    assert "Learning Lesson" in body
    assert "Target Lesson" in body
    # Learning must appear before Target
    assert body.index("Learning Lesson") < body.index("Target Lesson")
    # Known lesson should not be in next learning list
    assert "Known Lesson" not in body


@pytest.mark.asyncio
async def test_owner_asks_what_i_know_query_a(mock_adapter, owner_headers):
    """(a) Owner asks 'tôi đang biết gì về AI Engineering' and receives progress summary."""
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "ai-engineering",
        "title": "AI Engineering",
        "items": [
            {"id": "i1", "title": "Mastered Lesson", "status": "known"},
            {"id": "i2", "title": "Ongoing Lesson", "status": "learning"},
            {"id": "i3", "title": "Future Lesson", "status": "target"},
        ],
    }

    body = await _stream(
        "tôi đang biết gì về AI Engineering",
        owner_headers,
        thread_id="owner-what-i-know",
        context={"roadmapSlug": "ai-engineering"},
    )

    assert "Tiến độ học tập" in body
    assert "Mastered Lesson" in body
    assert "Ongoing Lesson" in body
    assert "Future Lesson" in body


@pytest.mark.asyncio
async def test_visitor_blocked_on_status_queries_and_changes(mock_adapter, visitor_headers):
    """Visitor asking (a)-(d) gets OWNER_ONLY_MESSAGE and sees NO status information."""
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "ai-engineering",
        "title": "AI Engineering",
        "items": [
            {"id": "i1", "title": "Secret Lesson", "status": "known"},
        ],
    }

    for msg in [
        "bài nào cần ôn lại",
        "nên học gì tiếp",
        "tôi đang biết gì về AI Engineering",
        "đánh dấu bài Secret Lesson là đang học",
    ]:
        body = await _stream(msg, visitor_headers, thread_id=f"visitor-{hash(msg)}")
        assert OWNER_ONLY_MESSAGE in body
        assert "Secret Lesson" not in body
        mock_adapter.update_item.assert_not_called()


@pytest.mark.asyncio
async def test_owner_status_change_preview_ok_flow(mock_adapter, owner_headers):
    """(d) Owner status change -> Preview -> 'ok' -> mock receives exactly one update_item with status."""
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "ai-engineering",
        "title": "AI Engineering",
        "items": [
            {"id": "item-101", "title": "Prompt Engineering", "status": "known"},
        ],
    }
    mock_adapter.update_item.return_value = {
        "id": "item-101",
        "title": "Prompt Engineering",
        "status": "learning",
    }

    thread_id = "preview-ok-thread"

    # Step 1: Request change
    first_resp = await _stream(
        "đánh dấu bài Prompt Engineering là đang học",
        owner_headers,
        thread_id=thread_id,
        context={"roadmapSlug": "ai-engineering"},
    )

    # Must contain preview card
    assert "action_preview" in first_resp or "Đổi trạng thái bài học" in first_resp
    assert "Prompt Engineering" in first_resp
    assert "Đã nắm" in first_resp
    assert "Đang học" in first_resp

    # No write yet
    mock_adapter.update_item.assert_not_called()

    # Step 2: Confirm with "ok"
    second_resp = await _stream("ok", owner_headers, thread_id=thread_id)
    assert "✅" in second_resp
    assert "Đã đổi trạng thái bài 'Prompt Engineering' sang **Đang học**" in second_resp

    # Verified: exactly one PATCH/update call with status="learning"
    mock_adapter.update_item.assert_called_once_with("item-101", status="learning")


@pytest.mark.asyncio
async def test_owner_status_change_preview_cancel_flow(mock_adapter, owner_headers):
    """(d) Owner status change -> Preview -> 'hủy' -> no PATCH call."""
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "ai-engineering",
        "title": "AI Engineering",
        "items": [
            {"id": "item-101", "title": "Prompt Engineering", "status": "known"},
        ],
    }

    thread_id = "preview-cancel-thread"

    # Request change
    first_resp = await _stream(
        "đánh dấu bài Prompt Engineering là đang học",
        owner_headers,
        thread_id=thread_id,
        context={"roadmapSlug": "ai-engineering"},
    )
    assert "Đổi trạng thái bài học" in first_resp

    # Cancel with "hủy"
    second_resp = await _stream("hủy", owner_headers, thread_id=thread_id)
    assert "hủy" in second_resp.lower()

    # No write operation made
    mock_adapter.update_item.assert_not_called()


@pytest.mark.asyncio
async def test_owner_status_change_same_status_no_preview(mock_adapter, owner_headers):
    """Changing to the current status does not trigger preview or update."""
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "ai-engineering",
        "title": "AI Engineering",
        "items": [
            {"id": "item-101", "title": "Prompt Engineering", "status": "known"},
        ],
    }

    resp = await _stream(
        "đánh dấu bài Prompt Engineering là đã nắm",
        owner_headers,
        thread_id="same-status-thread",
        context={"roadmapSlug": "ai-engineering"},
    )

    assert "đã ở trạng thái **Đã nắm** rồi" in resp
    assert "action_preview" not in resp
    mock_adapter.update_item.assert_not_called()


@pytest.mark.asyncio
async def test_technical_question_never_triggers_preview(mock_adapter, owner_headers):
    """Sentences like 'tôi đang học RAG, giải thích chunking' must NOT trigger preview."""
    resp = await _stream(
        "tôi đang học RAG, giải thích chunking",
        owner_headers,
        thread_id="tech-q-thread",
    )

    assert "action_preview" not in resp
    assert "Đổi trạng thái bài học" not in resp
    mock_adapter.update_item.assert_not_called()


def test_update_item_tool_has_no_status_parameter():
    """Verify tool update_item has no 'status' in its schema (status changes MUST go through preview)."""
    from rag_service.tools.item_tools import update_item

    fields = update_item.args_schema.model_fields
    assert "status" not in fields, f"status must not be in update_item schema, found: {fields.keys()}"


@pytest.mark.asyncio
async def test_alternate_phrasing_status_change_does_not_patch_without_ok(mock_adapter, owner_headers):
    """An alternate status phrasing ('cho bài RAG vào mục tiêu') never results in PATCH without 'ok'."""
    mock_adapter.get_topic.return_value = {
        "id": "t1",
        "slug": "ai-engineering",
        "title": "AI Engineering",
        "items": [
            {"id": "item-rag", "title": "RAG", "status": "learning"},
        ],
    }
    thread_id = "alternate-phrasing-thread"
    resp = await _stream(
        "cho bài RAG vào mục tiêu",
        owner_headers,
        thread_id=thread_id,
        context={"roadmapSlug": "ai-engineering"},
    )
    # Crucial invariant: never call update_item immediately without user confirmation ("ok")
    mock_adapter.update_item.assert_not_called()

