"""Sections through the chat (ADR-0009): list a topic's sections, rename one, and "mục X" is never a topic.

2026-11-04, live (tests/manual/assistant-sections.md): "topic QA Sandbox có những mục nào?" was answered "chưa có
thông tin chi tiết về các mục"; "đổi tên mục Tools thành Tooling" was refused as an update; and "thêm bài X mục
Tools" with the topic open asked "Không tìm thấy topic Tools".
"""

from __future__ import annotations

import asyncio
import uuid

from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
from rag_service.domains.roadmap.sections import asks_section_list, parse_section_rename, section_list_reply
from rag_service.state import session_store

TOPIC = {
    "slug": "test-topic",
    "title": "Test Topic",
    "items": [
        {"id": "i-1", "title": "Semantic Caching", "section": "Core Ops"},
        {"id": "i-2", "title": "QA Abot Test", "section": "Core Ops"},
        {"id": "i-3", "title": "Prompt Basics", "section": None},
        {"id": "i-4", "title": "Vector DB", "section": "RAG"},
    ],
    "sections": ["Core Ops", None, "RAG"],
}


def _turn(agent, text: str, thread: str, context: dict | None = None) -> tuple[str, list[dict]]:
    async def run():
        out = []
        payload = {"messages": [{"role": "user", "content": text}], "fast": True}
        if context:
            payload["context"] = context
        async for ev in agent.astream_events(payload, config={"configurable": {"thread_id": thread}}):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


# ── Listing ──


def test_listing_names_each_section_with_its_lessons():
    reply = section_list_reply(TOPIC)
    assert "Core Ops (2 bài)" in reply and "Chung (1 bài)" in reply and "RAG (1 bài)" in reply
    assert reply.index("- Core Ops") < reply.index("- Chung") < reply.index("- RAG")
    assert "có 2 mục, và 1 bài chưa vào mục nào" in reply


def test_listing_of_a_topic_without_sections_or_lessons():
    assert "chưa chia mục" in section_list_reply({"title": "T", "items": [{"title": "A", "section": None}]})
    assert "chưa có bài học nào" in section_list_reply({"title": "T", "items": []})


def test_section_list_questions_are_told_apart_from_searches():
    for text in ["topic Test Topic có những mục nào?", "các mục của topic Test Topic", "liệt kê mục", "co nhung muc nao"]:
        assert asks_section_list(text), text
    for text in ["mục RAG có những bài gì?", "thêm bài X vào mục nào?", "đổi tên mục RAG thành X"]:
        assert not asks_section_list(text), text


def test_chat_lists_sections_of_the_named_topic(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    text, events = _turn(NextGenRoadmapAgent(llm_model=None), "topic Test Topic có những mục nào?", f"s-{uuid.uuid4()}")
    assert "Core Ops (2 bài)" in text and "RAG (1 bài)" in text
    mock_adapter.get_topic.assert_awaited_with("test-topic")


def test_chat_lists_sections_of_the_open_topic(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    text, _ = _turn(
        NextGenRoadmapAgent(llm_model=None), "topic này có những mục nào?", f"s-{uuid.uuid4()}",
        context={"roadmapSlug": "test-topic"},
    )
    assert "Core Ops (2 bài)" in text


def test_chat_asks_which_topic_when_none_is_known(mock_adapter):
    text, _ = _turn(NextGenRoadmapAgent(llm_model=None), "có những mục nào?", f"s-{uuid.uuid4()}")
    assert "topic nào" in text and "test-topic" in text


# ── Rename ──


def test_rename_parsing():
    assert parse_section_rename("đổi tên mục RAG thành Retrieval trong topic AI Engineering") == {
        "src": "RAG", "dst": "Retrieval", "topic": "AI Engineering"
    }
    assert parse_section_rename("doi ten muc rag thanh Retrieval")["dst"] == "Retrieval"
    assert parse_section_rename('đổi tên mục "Core Ops" thành "Ops" của topic be')["src"] == "Core Ops"
    assert parse_section_rename("đổi tên bài Docker thành Docker 101") is None


def test_rename_is_previewed_then_runs_on_ok(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    mock_adapter.update_section.return_value = {"success": True, "renamed": 2, "section": "Ops"}
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"r-{uuid.uuid4()}"
    preview, events = _turn(agent, "đổi tên mục core ops thành Ops trong topic Test Topic", thread)
    assert [e for e in events if e.get("type") == "action_preview"]
    assert "`Core Ops` → `Ops`" in preview and "2 bài" in preview
    mock_adapter.update_section.assert_not_awaited()
    done, _ = _turn(agent, "ok", thread)
    mock_adapter.update_section.assert_awaited_once_with("test-topic", "Core Ops", "Ops")
    assert "Đã đổi tên mục" in done and "2 bài" in done


def test_rename_onto_an_existing_section_says_it_merges(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    preview, _ = _turn(NextGenRoadmapAgent(llm_model=None), "đổi tên mục Core Ops thành rag trong topic Test Topic",
                       f"r-{uuid.uuid4()}")
    assert "gộp" in preview and "`Core Ops` → `RAG`" in preview


def test_rename_of_a_missing_section_changes_nothing(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    thread = f"r-{uuid.uuid4()}"
    text, events = _turn(NextGenRoadmapAgent(llm_model=None), "đổi tên mục Kafka thành X trong topic Test Topic", thread)
    assert "không có mục `Kafka`" in text and "`Core Ops`" in text
    assert not [e for e in events if e.get("type") == "action_preview"]
    assert not session_store.get_or_create(thread).pending_section_rename


def test_rename_preview_is_dropped_by_another_message(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"r-{uuid.uuid4()}"
    _turn(agent, "đổi tên mục RAG thành Retrieval trong topic Test Topic", thread)
    _turn(agent, "thời tiết hôm nay thế nào?", thread)
    _turn(agent, "ok", thread)
    mock_adapter.update_section.assert_not_awaited()


def test_rename_is_owner_only(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("visitor")
    thread = f"r-{uuid.uuid4()}"
    text, _ = _turn(NextGenRoadmapAgent(llm_model=None), "đổi tên mục RAG thành Retrieval trong topic Test Topic", thread)
    assert "owner" in text
    assert not session_store.get_or_create(thread).pending_section_rename


# ── "mục X" is the section, not the topic ──


def test_section_named_after_muc_is_not_taken_for_the_topic(mock_adapter, monkeypatch):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    agent, thread = NextGenRoadmapAgent(llm_model=None), f"m-{uuid.uuid4()}"

    # What the LLM extractor returned live: the section as the topic, no section on the lesson
    async def extracted(*_a, **_k):
        return StructuredRoadmapAction(
            action=ActionType.CREATE, entity_level=EntityLevel.ITEM, target_parent_identifier="Tools",
            entities=[SingleEntity(title="Function Schema")],
        )

    monkeypatch.setattr(agent.extractor, "aextract", extracted)
    monkeypatch.setattr(agent.extractor, "from_verified", lambda *_a, **_k: asyncio.run(extracted()))
    first, _ = _turn(agent, "thêm bài Function Schema mục Tools", thread, context={"roadmapSlug": "test-topic"})
    assert "Không tìm thấy topic" not in first
    if session_store.get_or_create(thread).pending_confirmation:
        _turn(agent, "ok", thread, context={"roadmapSlug": "test-topic"})
    mock_adapter.create_item.assert_awaited_once()
    kwargs = mock_adapter.create_item.await_args.kwargs
    assert kwargs["topic_slug"] == "test-topic" and kwargs["section"] == "Tools"


# ── Pasted lists (the composer keeps their lines now) ──


def test_pasted_list_without_an_open_topic_asks_which_topic(mock_adapter):
    set_actor("owner")
    text, _ = _turn(NextGenRoadmapAgent(llm_model=None), "thêm:\n- Eval Set\n- Golden Answers", f"b-{uuid.uuid4()}")
    assert "chưa biết thêm vào topic nào" in text
    mock_adapter.create_item.assert_not_awaited()


def test_pasted_list_under_a_delete_verb_creates_nothing(mock_adapter):
    set_actor("owner")
    _turn(
        NextGenRoadmapAgent(llm_model=None), "xóa:\n- Eval Set\n- Golden Answers", f"b-{uuid.uuid4()}",
        context={"roadmapSlug": "test-topic"},
    )
    mock_adapter.create_item.assert_not_awaited()


def test_topic_with_section_in_title_extracts_correct_section_and_topic(mock_adapter):
    mock_adapter.list_topics.return_value = [
        {"id": "t-sec", "slug": "qa-section-test", "title": "QA Section Test", "_count": {"items": 0}}
    ]
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"sec-title-{uuid.uuid4()}"
    preview, _ = _turn(agent, "thêm bài RAG vào mục Core của topic QA Section Test", thread)
    assert "Core" in preview
    reply = _turn(agent, "ok", thread)[0]
    mock_adapter.create_item.assert_awaited_once()
    kwargs = mock_adapter.create_item.await_args.kwargs
    assert kwargs["topic_slug"] == "qa-section-test"
    assert kwargs["section"] == "Core"
    assert kwargs["title"] == "RAG"

