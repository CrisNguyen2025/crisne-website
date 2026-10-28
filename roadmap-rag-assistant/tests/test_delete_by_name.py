"""A lesson or group is deleted by its name, and a change the executor cannot run is never previewed.

2026-10-28, live: "xóa bài QA Abot Test" was confirmed and failed with "Không tìm thấy bài học `layer-04`" (the
executor sent the layer or the name where the API takes the item id), and "đổi tên bài …" was previewed, then
answered "chưa được hỗ trợ" after the owner confirmed it.
"""

from __future__ import annotations

import asyncio
import uuid

from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.state import session_store

TOPIC = {
    "slug": "test-topic",
    "title": "Test Topic",
    "layers": [
        {
            "id": "layer-ops",
            "shortTag": "04-OPS",
            "title": "Ops",
            "groups": [
                {
                    "id": "group-core",
                    "title": "Core Ops",
                    "level": "core",
                    "items": [
                        {"id": "item-sc", "title": "Semantic Caching", "layerId": "layer-ops"},
                        {"id": "item-qa", "title": "QA Abot Test", "layerId": "layer-ops"},
                    ],
                }
            ],
        }
    ],
}


def _turn(agent: NextGenRoadmapAgent, text: str, thread_id: str) -> tuple[str, list[dict]]:
    async def run():
        out = []
        async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": text}], "fast": True},
            config={"configurable": {"thread_id": thread_id}},
        ):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


def _confirmed(agent: NextGenRoadmapAgent, text: str) -> str:
    thread = f"delete-name-{uuid.uuid4()}"
    first, _ = _turn(agent, text, thread)
    if not session_store.get_or_create(thread).pending_confirmation:
        return first
    reply, _ = _turn(agent, "ok", thread)
    return reply


def test_lesson_is_deleted_by_its_id_when_named(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    reply = _confirmed(NextGenRoadmapAgent(llm_model=None), "xóa bài QA Abot Test")
    mock_adapter.delete_item.assert_awaited_once_with(item_id="item-qa")
    assert "QA Abot Test" in reply


def test_delete_preview_names_the_lesson_not_its_id(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    text, _ = _turn(NextGenRoadmapAgent(llm_model=None), "xóa bài QA Abot Test", f"delete-card-{uuid.uuid4()}")
    assert "QA Abot Test" in text and "item-qa" not in text


def test_group_is_deleted_by_its_id_when_named(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    _confirmed(NextGenRoadmapAgent(llm_model=None), "xóa nhóm Core Ops")
    mock_adapter.delete_group.assert_awaited_once_with(group_id="group-core")


def test_unknown_lesson_is_asked_back_and_nothing_is_deleted(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    thread = f"delete-unknown-{uuid.uuid4()}"
    text, events = _turn(NextGenRoadmapAgent(llm_model=None), "xóa bài Kafka Streams", thread)
    assert "Không tìm thấy bài học" in text
    assert not [e for e in events if e.get("type") == "action_preview"]
    assert not session_store.get_or_create(thread).pending_confirmation
    mock_adapter.delete_item.assert_not_awaited()


def test_update_is_answered_before_any_preview(mock_adapter):
    mock_adapter.get_topic.return_value = TOPIC
    set_actor("owner")
    thread = f"update-{uuid.uuid4()}"
    text, events = _turn(NextGenRoadmapAgent(llm_model=None), "đổi tên bài QA Abot Test thành QA Abot Renamed", thread)
    assert "chưa sửa được" in text
    assert not [e for e in events if e.get("type") in ("action_preview", "tool_start")]
    assert not session_store.get_or_create(thread).pending_confirmation
