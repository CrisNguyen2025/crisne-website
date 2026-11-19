"""Edit existing lessons through chat with Preview (rename, move section, clear section) and manual Preview edits."""

from __future__ import annotations

import asyncio
import uuid

import pytest

from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.lesson_edit import parse_lesson_edit
from rag_service.state import session_store

TOPIC = {
    "slug": "test-topic",
    "title": "Test Topic",
    "items": [
        {"id": "item-sc", "slug": "semantic-caching", "title": "Semantic Caching", "section": "Core Ops"},
        {"id": "item-qa", "slug": "qa-abot-test", "title": "QA Abot Test", "section": "RAG"},
        {"id": "item-gen", "slug": "prompt-basics", "title": "Prompt Basics", "section": None},
    ],
    "sections": ["Core Ops", "RAG", None],
}


def _turn(
    agent: NextGenRoadmapAgent,
    text: str,
    thread: str,
    *,
    context: dict | None = None,
    titles: list[str] | None = None,
    target: dict | None = None,
) -> tuple[str, list[dict]]:
    async def run():
        out = []
        payload: dict = {"messages": [{"role": "user", "content": text}], "fast": True}
        if context is not None:
            payload["context"] = context
        if titles is not None:
            payload["titles"] = titles
        if target is not None:
            payload["target"] = target
        async for ev in agent.astream_events(payload, config={"configurable": {"thread_id": thread}}):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


def test_parse_lesson_edit_variants_and_guards():
    assert parse_lesson_edit("đổi tên bài Semantic Caching thành Caching trong topic Test Topic") == {
        "src": "Semantic Caching",
        "new_title": "Caching",
        "new_section": None,
        "clear_section": False,
        "topic": "Test Topic",
    }
    assert parse_lesson_edit("chuyển bài QA Abot Test sang mục Core Ops trong topic Test Topic") == {
        "src": "QA Abot Test",
        "new_title": None,
        "new_section": "Core Ops",
        "clear_section": False,
        "topic": "Test Topic",
    }
    assert parse_lesson_edit("bỏ mục của bài QA Abot Test") == {
        "src": "QA Abot Test",
        "new_title": None,
        "new_section": None,
        "clear_section": True,
        "topic": None,
    }
    assert parse_lesson_edit("đổi tên bài này thành Prompt Engineering")["src"] == ""
    assert parse_lesson_edit("sửa bài QA Abot Test sang mục Evaluation")["new_section"] == "Evaluation"

    # Guards: status changes, topic/layer moves, questions, negations, and multi-clause sentences
    assert parse_lesson_edit("chuyển bài Vector Search sang đã nắm") is None
    assert parse_lesson_edit("chuyển bài Vector Search sang mục tiêu trong topic AI") is None
    assert parse_lesson_edit("chuyển bài Docker Compose sang topic Backend") is None
    assert parse_lesson_edit("chuyển bài RAG sang layer AI") is None
    assert parse_lesson_edit("đừng đổi tên bài RAG thành Caching") is None
    assert parse_lesson_edit("tại sao đổi tên bài RAG thành Caching?") is None
    assert parse_lesson_edit("đổi tên bài Kafka thành Kafka, rồi tìm bài về Docker") is None


def test_rename_lesson_preview_and_confirm(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    mock_adapter.update_item.return_value = {"id": "item-qa", "title": "QA Abot v2", "section": "RAG"}
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"edit-{uuid.uuid4()}"

    preview, events = _turn(agent, "đổi tên bài QA Abot Test thành QA Abot v2", thread)
    preview_ev = next(e for e in events if e.get("type") == "action_preview")
    assert preview_ev["editable_titles"] == ["QA Abot v2"]
    assert preview_ev["editable_target"] == {"section": "RAG"}
    assert "QA Abot Test" in preview and "QA Abot v2" in preview
    mock_adapter.update_item.assert_not_awaited()

    reply, _ = _turn(agent, "ok", thread)
    mock_adapter.update_item.assert_awaited_once_with("item-qa", title="QA Abot v2")
    assert "Đã đổi tên bài" in reply


def test_move_lesson_section_and_manual_edit_on_preview(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    mock_adapter.update_item.return_value = {"id": "item-sc", "title": "Semantic Caching Pro", "section": "Retrieval"}
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"move-{uuid.uuid4()}"

    preview, events = _turn(agent, "chuyển bài Semantic Caching sang mục RAG", thread)
    preview_ev = next(e for e in events if e.get("type") == "action_preview")
    assert preview_ev["editable_titles"] == ["Semantic Caching"]
    assert preview_ev["editable_target"] == {"section": "RAG"}
    assert "`Core Ops` → `RAG`" in preview

    reply, _ = _turn(
        agent,
        "ok",
        thread,
        titles=["Semantic Caching Pro"],
        target={"section": "Retrieval"},
    )
    mock_adapter.update_item.assert_awaited_once_with(
        "item-sc", title="Semantic Caching Pro", section="Retrieval"
    )
    assert "Đã cập nhật bài" in reply


def test_clear_lesson_section_to_general(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    mock_adapter.update_item.return_value = {"id": "item-qa", "title": "QA Abot Test", "section": None}
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"clear-{uuid.uuid4()}"

    preview, events = _turn(agent, "bỏ mục của bài QA Abot Test", thread)
    preview_ev = next(e for e in events if e.get("type") == "action_preview")
    assert preview_ev["editable_target"] == {"section": ""}
    assert "`RAG` → `Chung`" in preview

    reply, _ = _turn(agent, "ok", thread)
    mock_adapter.update_item.assert_awaited_once_with("item-qa", section=None)
    assert "Đã chuyển bài" in reply


def test_edit_current_lesson_using_page_context(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    mock_adapter.update_item.return_value = {"id": "item-gen", "title": "Prompt Design", "section": None}
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"ctx-{uuid.uuid4()}"

    _, events = _turn(
        agent,
        "đổi tên bài này thành Prompt Design",
        thread,
        context={"roadmapSlug": "test-topic", "itemId": "item-gen"},
    )
    assert [e for e in events if e.get("type") == "action_preview"]
    _turn(agent, "ok", thread)
    mock_adapter.update_item.assert_awaited_once_with("item-gen", title="Prompt Design")


def test_section_rename_preview_allows_manual_title_override(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    mock_adapter.update_section.return_value = {"renamed": 1, "section": "Core Retrieval"}
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"sec-edit-{uuid.uuid4()}"

    _, events = _turn(agent, "đổi tên mục RAG thành Retrieval trong topic Test Topic", thread)
    preview_ev = next(e for e in events if e.get("type") == "action_preview")
    assert preview_ev["editable_titles"] == ["Retrieval"]

    _turn(agent, "ok", thread, titles=["Core Retrieval"])
    mock_adapter.update_section.assert_awaited_once_with("test-topic", "RAG", "Core Retrieval")


def test_lesson_edit_is_owner_only(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("visitor")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"vis-{uuid.uuid4()}"

    reply, events = _turn(agent, "đổi tên bài QA Abot Test thành QA v2", thread)
    assert "owner" in reply.lower()
    assert not [e for e in events if e.get("type") == "action_preview"]
    assert session_store.get_or_create(thread).pending_lesson_edit is None


def test_lesson_edit_unknown_or_duplicate_lesson_creates_no_preview(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)

    missing_reply, missing_events = _turn(agent, "đổi tên bài Nonexistent thành Foo", f"miss-{uuid.uuid4()}")
    assert "Không tìm thấy bài học" in missing_reply
    assert not [e for e in missing_events if e.get("type") == "action_preview"]

    dup_reply, dup_events = _turn(
        agent, "đổi tên bài QA Abot Test thành Semantic Caching trong topic Test Topic", f"dup-{uuid.uuid4()}"
    )
    assert "đã có bài" in dup_reply
    assert not [e for e in dup_events if e.get("type") == "action_preview"]


def test_invalid_edited_title_on_lesson_edit_reprompts_with_editable_preview(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"reprompt-{uuid.uuid4()}"

    _turn(agent, "đổi tên bài QA Abot Test thành QA Abot v2", thread)
    reply, events = _turn(agent, "ok", thread, titles=["   "])
    assert "chưa áp dụng được" in reply and "Xác nhận thực hiện" in reply
    preview_ev = next(e for e in events if e.get("type") == "action_preview")
    assert preview_ev["editable_titles"] == ["QA Abot v2"]
    assert preview_ev["editable_target"] == {"section": "RAG"}
    assert session_store.get_or_create(thread).pending_lesson_edit is not None
    mock_adapter.update_item.assert_not_awaited()
