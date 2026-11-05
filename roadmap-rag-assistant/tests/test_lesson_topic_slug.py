"""A lesson created by topic name goes to the topic's slug, and an "ok" with nothing waiting changes nothing.

2026-11-04, live (tests/manual/assistant-sections.md): "thêm bài Vector DB vào topic QA Sandbox mục RAG" was
previewed, then failed with 404 on POST /api/v1/roadmaps/items: the executor sent the title "QA Sandbox" as
roadmapSlug. And an "ok" sent after the preview was dropped was answered "Đã xóa bài học Reranking" by chitchat,
while nothing was deleted.
"""

from __future__ import annotations

import asyncio
import uuid

from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.commands import NOTHING_PENDING_REPLY
from rag_service.state import session_store

TOPICS = [
    {"id": "t-1", "slug": "qa-sandbox", "title": "QA Sandbox", "_count": {"items": 0}},
    {"id": "t-2", "slug": "ai-engineering", "title": "AI Engineering", "_count": {"items": 0}},
]


def _turn(agent: NextGenRoadmapAgent, text: str, thread_id: str, context: dict | None = None) -> tuple[str, list[dict]]:
    async def run():
        out = []
        payload = {"messages": [{"role": "user", "content": text}], "fast": True}
        if context:
            payload["context"] = context
        async for ev in agent.astream_events(
            payload,
            config={"configurable": {"thread_id": thread_id}},
        ):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


def _confirmed(agent: NextGenRoadmapAgent, text: str, thread: str, context: dict | None = None) -> str:
    first, _ = _turn(agent, text, thread, context=context)
    if not session_store.get_or_create(thread).pending_confirmation:
        return first
    reply, _ = _turn(agent, "ok", thread, context=context)
    return reply


def test_lesson_named_by_topic_title_is_created_in_its_slug(mock_adapter):
    mock_adapter.list_topics.return_value = TOPICS
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    _confirmed(agent, "thêm bài Vector DB vào topic QA Sandbox mục RAG", f"slug-{uuid.uuid4()}")
    mock_adapter.create_item.assert_awaited_once()
    assert mock_adapter.create_item.await_args.kwargs["topic_slug"] == "qa-sandbox"


def test_lesson_for_an_unknown_topic_is_asked_back(mock_adapter):
    mock_adapter.list_topics.return_value = TOPICS
    set_actor("owner")
    thread = f"slug-unknown-{uuid.uuid4()}"
    text, events = _turn(NextGenRoadmapAgent(llm_model=None), "thêm bài Vector DB vào topic Kafka Streams", thread)
    assert not [e for e in events if e.get("type") in ("action_preview", "tool_start")]
    assert not session_store.get_or_create(thread).pending_confirmation
    mock_adapter.create_item.assert_not_awaited()
    assert "qa-sandbox" in text


def test_ok_with_nothing_pending_changes_nothing(mock_adapter):
    set_actor("owner")
    thread = f"nothing-pending-{uuid.uuid4()}"
    text, events = _turn(NextGenRoadmapAgent(llm_model=None), "ok", thread)
    assert text.startswith(NOTHING_PENDING_REPLY.split("\n")[0])
    assert not [e for e in events if e.get("type") == "tool_start"]
    mock_adapter.delete_item.assert_not_awaited()
    mock_adapter.create_item.assert_not_awaited()


def test_lesson_added_with_page_context_does_not_warn_no_topic(mock_adapter):
    mock_adapter.list_topics.return_value = TOPICS
    set_actor("owner")
    thread = f"page-ctx-{uuid.uuid4()}"
    agent = NextGenRoadmapAgent(llm_model=None)
    preview, _ = _turn(
        agent,
        "thêm bài Tool Calling",
        thread,
        context={"roadmapSlug": "qa-sandbox"},
    )
    assert "Chưa có topic nào được chọn" not in preview
    reply = _turn(agent, "ok", thread, context={"roadmapSlug": "qa-sandbox"})[0]
    assert "Chưa có topic nào được chọn" not in reply
    mock_adapter.create_item.assert_awaited_once()
    assert mock_adapter.create_item.await_args.kwargs["topic_slug"] == "qa-sandbox"


def test_lesson_added_without_any_topic_asks_for_topic(mock_adapter):
    mock_adapter.list_topics.return_value = TOPICS
    set_actor("owner")
    thread = f"no-topic-{uuid.uuid4()}"
    agent = NextGenRoadmapAgent(llm_model=None)
    text, _ = _turn(agent, "thêm bài Tool Calling", thread)
    assert "qa-sandbox" in text
    mock_adapter.create_item.assert_not_awaited()


