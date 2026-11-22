"""Phase 0 verification tests: active_lesson anaphora, /chat/context cold-start load, trace history snippet."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import httpx
import pytest

from rag_service.api.server import app
from rag_service.core.augmentation import history as history_mod
from rag_service.core.augmentation.context import GenerationRequest
from rag_service.core.augmentation.history import HttpHistoryStore
from rag_service.core.thread_api import ThreadApi
from rag_service.domains.roadmap.pipeline import generation_pipeline
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
from rag_service.execution.executor import ActionExecutor
from rag_service.state import session_store
from rag_service.state.session_store import SessionStore
from tests.test_generation_pipeline import DOC, RecordingLLM
from tests.test_owner_thread_state import FakeApi


@pytest.mark.asyncio
async def test_chat_context_loads_owner_history_from_turso_on_cold_start(monkeypatch, owner_headers, visitor_headers):
    fake_api = FakeApi()
    fake_api.messages = [
        {"role": "user", "content": "Docker là gì?"},
        {"role": "assistant", "content": "Docker đóng gói ứng dụng vào container."},
    ]
    client_api = ThreadApi("http://next.test", "admin-key")
    transport = httpx.MockTransport(fake_api.handle)
    monkeypatch.setattr(
        client_api,
        "_client",
        lambda timeout: httpx.AsyncClient(transport=transport, base_url="http://next.test", headers=client_api._headers),
    )
    cold_history = HttpHistoryStore(client_api)
    monkeypatch.setattr(history_mod, "history_store", cold_history)
    monkeypatch.setattr("rag_service.context_usage.history_store", cold_history)

    owner_tid = f"owner:{uuid.uuid4()}"
    visitor_tid = f"visitor:{uuid.uuid4()}"

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http_client:
        res_owner = await http_client.post("/chat/context", json={"thread_id": owner_tid}, headers=owner_headers)
        assert res_owner.status_code == 200
        owner_msgs = next(p for p in res_owner.json()["parts"] if p["key"] == "messages")
        assert owner_msgs["count"] == 2

        calls_after_owner = len(fake_api.requests)
        res_visitor = await http_client.post("/chat/context", json={"thread_id": visitor_tid}, headers=visitor_headers)
        assert res_visitor.status_code == 200
        visitor_msgs = next(p for p in res_visitor.json()["parts"] if p["key"] == "messages")
        assert visitor_msgs["count"] == 0
        # Visitor must never trigger a Turso lookup
        assert len(fake_api.requests) == calls_after_owner


@pytest.mark.asyncio
async def test_session_store_restores_active_lesson_and_section(monkeypatch):
    fake_api = FakeApi()
    fake_api.state = {
        "activeTopicSlug": "ai-architecture",
        "activeTopicTitle": "AI Architecture",
        "activeLessonId": "lesson-42",
        "activeLessonTitle": "Hybrid Search",
        "activeSection": "RAG",
    }
    client_api = ThreadApi("http://next.test", "admin-key")
    monkeypatch.setattr(
        client_api,
        "_client",
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(fake_api.handle), base_url="http://next.test", headers=client_api._headers),
    )
    sessions = SessionStore(client_api)
    tid = f"owner:{uuid.uuid4()}"
    await sessions.load(tid)

    ctx = sessions.get_or_create(tid)
    assert ctx.active_topic_slug == "ai-architecture"
    assert ctx.active_lesson_id == "lesson-42"
    assert ctx.active_lesson_title == "Hybrid Search"
    assert ctx.active_section == "RAG"


@pytest.mark.asyncio
async def test_active_lesson_anaphora_works_for_status_and_edit_without_page_item(mock_adapter, owner_headers, write_grant):
    mock_adapter.create_item.return_value = {
        "id": "created-lesson-1",
        "title": "Hybrid Search",
        "section": "RAG",
        "roadmapSlug": "test-topic",
    }
    mock_adapter.get_topic.return_value = {
        "id": "test-id-1",
        "slug": "test-topic",
        "title": "Test Topic",
        "items": [
            {"id": "created-lesson-1", "title": "Hybrid Search", "section": "RAG", "status": "target", "order": 1}
        ],
        "sections": ["RAG", "Retrieval"],
    }

    tid = f"owner:{uuid.uuid4()}"
    executor = ActionExecutor(adapter=mock_adapter)
    action = StructuredRoadmapAction(
        action=ActionType.CREATE,
        entity_level=EntityLevel.ITEM,
        target_parent_identifier="test-topic",
        entities=[SingleEntity(title="Hybrid Search", section="RAG")],
        raw_intent_summary="Thêm bài Hybrid Search",
    )
    ok, _ = await executor.aexecute(action, session_id=tid)
    assert ok is True
    assert session_store.get_or_create(tid).active_lesson_id == "created-lesson-1"

    # Follow-up on the Topic page (NO itemId in page_context): "đánh dấu bài vừa tạo là đang học"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=owner_headers) as client:
        r_status = await client.post(
            "/chat/stream",
            json={
                "message": "đánh dấu bài vừa tạo là đang học",
                "thread_id": tid,
                "context": {"roadmapSlug": "test-topic"},
            },
        )
        assert r_status.status_code == 200
        assert "event: action_preview" in r_status.text
        assert "Hybrid Search" in r_status.text
        # Drop pending status change and test rename anaphora
        r_edit = await client.post(
            "/chat/stream",
            json={
                "message": "đổi tên bài đó thành Hybrid Retrieval",
                "thread_id": tid,
                "context": {"roadmapSlug": "test-topic"},
            },
        )
        assert r_edit.status_code == 200
        assert "event: action_preview" in r_edit.text
        assert "Hybrid Retrieval" in r_edit.text


@pytest.mark.asyncio
async def test_generation_pipeline_records_conversation_history_in_step_metadata(monkeypatch):
    captured_metadata: list[dict] = []

    def fake_end_step(obs, **update):
        if "metadata" in update:
            captured_metadata.append(update["metadata"])

    monkeypatch.setattr("rag_service.core.generation.pipeline.end_step", fake_end_step)

    tid = f"owner:{uuid.uuid4()}"
    history_mod.history_store.append(tid, "user", "Câu hỏi cũ " + ("x" * 200))
    history_mod.history_store.append(tid, "assistant", "Trả lời gần nhất quan trọng")

    llm = RecordingLLM("Docker đóng gói ứng dụng. [[doc-1]]\n<sources>doc-1</sources>")
    req = GenerationRequest(mode="rag", query="Cụ thể hơn?", thread_id=tid, sources=[(DOC, 0.9)])
    _ = [ev async for ev in generation_pipeline.astream(llm, req)]

    assert captured_metadata
    sections = captured_metadata[-1]["sections"]
    assert "conversation_history" in sections
    assert "Trả lời gần nhất quan trọng" in sections["conversation_history"]
    assert len(sections["conversation_history"]) <= 4002
