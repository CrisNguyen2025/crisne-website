"""The Owner can correct the names on a create Preview; the confirming message carries them as `titles`.

2026-11-19, live: "tạo thêm topic Backend gíup tôi" previewed a topic named "Backend gíup tôi". The model only
suggests names, so the Owner edits them on the Preview. Only titles may change: action, level and parent stay.
"""

from __future__ import annotations

import asyncio
import uuid

from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.state import session_store


def _turn(
    text: str,
    thread_id: str,
    titles: list[str] | None = None,
    target: dict | None = None,
) -> tuple[str, list[dict]]:
    payload: dict = {"messages": [{"role": "user", "content": text}], "fast": True}
    if titles is not None:
        payload["titles"] = titles
    if target is not None:
        payload["target"] = target

    async def run():
        out = []
        async for ev in NextGenRoadmapAgent(llm_model=None).astream_events(
            payload, config={"configurable": {"thread_id": thread_id}}
        ):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


def _preview(text: str) -> str:
    thread = f"edit-titles-{uuid.uuid4()}"
    set_actor("owner")
    _, events = _turn(text, thread)
    preview = next(e for e in events if e.get("type") == "action_preview")
    assert preview["editable_titles"]
    return thread


def test_create_preview_carries_the_titles_to_edit():
    thread = f"edit-titles-{uuid.uuid4()}"
    set_actor("owner")
    _, events = _turn("tạo topic Kafka Streams", thread)
    preview = next(e for e in events if e.get("type") == "action_preview")
    assert preview["editable_titles"] == ["Kafka Streams"]


def test_delete_preview_has_no_titles_to_edit(mock_adapter):
    mock_adapter.get_topic.return_value = {"slug": "kafka", "title": "Kafka", "items": [], "sections": []}
    set_actor("owner")
    _, events = _turn("xóa topic Kafka", f"edit-titles-{uuid.uuid4()}")
    previews = [e for e in events if e.get("type") == "action_preview"]
    assert previews and all("editable_titles" not in e for e in previews)


def test_confirm_creates_the_edited_title(mock_adapter):
    thread = _preview("tạo topic Backend gíup tôi bạn")
    _turn("ok", thread, titles=["Backend Engineering"])
    kwargs = str(mock_adapter.create_topic.await_args)
    assert "Backend Engineering" in kwargs


def test_confirm_without_titles_keeps_the_previewed_name(mock_adapter):
    thread = _preview("tạo topic Kafka Streams")
    _turn("ok", thread)
    assert "Kafka Streams" in str(mock_adapter.create_topic.await_args)


def test_wrong_number_of_titles_runs_nothing_and_keeps_the_preview(mock_adapter):
    thread = _preview("tạo topic Kafka Streams")
    reply, _ = _turn("ok", thread, titles=["A", "B"])
    assert "chưa áp dụng được" in reply
    mock_adapter.create_topic.assert_not_awaited()
    assert session_store.get_or_create(thread).pending_confirmation is not None


def test_blank_or_pointing_title_is_rejected(mock_adapter):
    thread = _preview("tạo topic Kafka Streams")
    for bad in ("   ", "này"):
        reply, _ = _turn("ok", thread, titles=[bad])
        assert "chưa áp dụng được" in reply
    mock_adapter.create_topic.assert_not_awaited()


def test_edited_title_is_cleaned_like_an_extracted_one(mock_adapter):
    thread = _preview("tạo topic Kafka Streams")
    _turn("ok", thread, titles=["Backend gíup tôi"])
    sent = str(mock_adapter.create_topic.await_args)
    assert "Backend" in sent and "gíup" not in sent


def test_titles_never_turn_a_delete_into_a_create(mock_adapter):
    mock_adapter.get_topic.return_value = {"slug": "kafka", "title": "Kafka", "items": [], "sections": []}
    set_actor("owner")
    thread = f"edit-titles-{uuid.uuid4()}"
    _turn("xóa topic Kafka", thread)
    reply, _ = _turn("ok", thread, titles=["Kafka 2"])
    assert "chưa áp dụng được" in reply
    mock_adapter.create_topic.assert_not_awaited()
    mock_adapter.delete_topic.assert_not_awaited()


def test_create_lesson_preview_carries_editable_titles_and_target(mock_adapter):
    set_actor("owner")
    thread = f"edit-lesson-preview-{uuid.uuid4()}"
    _, events = _turn("thêm bài Reranking vào topic Test Topic mục RAG", thread)
    preview = next(e for e in events if e.get("type") == "action_preview")
    assert preview["editable_titles"] == ["Reranking"]
    assert preview["editable_target"] == {"topic": "test-topic", "section": "RAG"}


def test_confirm_create_lesson_applies_edited_target_topic_and_section(mock_adapter):
    mock_adapter.list_topics.return_value = [
        {"id": "t1", "slug": "test-topic", "title": "Test Topic", "_count": {"items": 1}},
        {"id": "t2", "slug": "ai-engineering", "title": "AI Engineering", "_count": {"items": 0}},
    ]
    set_actor("owner")
    thread = f"edit-target-{uuid.uuid4()}"
    _turn("thêm bài Reranking vào topic Test Topic mục RAG", thread)
    _turn("ok", thread, titles=["Cross-Encoder Reranking"], target={"topic": "AI Engineering", "section": "Retrieval"})
    mock_adapter.create_item.assert_awaited_once()
    kwargs = mock_adapter.create_item.await_args.kwargs
    assert kwargs["topic_slug"] == "ai-engineering"
    assert kwargs["section"] == "Retrieval"
    assert kwargs["title"] == "Cross-Encoder Reranking"


def test_confirm_create_lesson_can_clear_section_via_target(mock_adapter):
    set_actor("owner")
    thread = f"clear-sec-{uuid.uuid4()}"
    _turn("thêm bài Reranking vào topic Test Topic mục RAG", thread)
    _turn("ok", thread, target={"section": ""})
    kwargs = mock_adapter.create_item.await_args.kwargs
    assert kwargs["topic_slug"] == "test-topic"
    assert kwargs["section"] is None


def test_invalid_edited_target_topic_keeps_preview_pending(mock_adapter):
    set_actor("owner")
    thread = f"bad-target-{uuid.uuid4()}"
    _turn("thêm bài Reranking vào topic Test Topic mục RAG", thread)
    reply, events = _turn("ok", thread, target={"topic": "no-such-topic"})
    assert "Không tìm thấy topic" in reply and "Xác nhận thực hiện" in reply
    preview_ev = next(e for e in events if e.get("type") == "action_preview")
    assert preview_ev["editable_titles"] == ["Reranking"]
    assert preview_ev["editable_target"] == {"topic": "test-topic", "section": "RAG"}
    mock_adapter.create_item.assert_not_awaited()
    assert session_store.get_or_create(thread).pending_confirmation is not None
