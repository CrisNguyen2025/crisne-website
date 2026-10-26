"""A level is never a default: a group or item with none is asked for, and the answer completes its message."""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path

import pytest

from rag_service.adapters.levels import LEVEL_CHOICES, default_group_title, normalize_level, require_level
from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router.grounding import BULK_LEVEL_ASK, NO_DEFAULT_LAYER_REPLY
from rag_service.state import session_store


LEVEL_CASES = json.loads((Path(__file__).parent / "data" / "level_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("raw,expected", LEVEL_CASES["normalize"])
def test_shared_level_cases(raw, expected):
    assert normalize_level(raw) == expected


@pytest.mark.parametrize("raw,title", LEVEL_CASES["default_title"])
def test_shared_group_titles(raw, title):
    assert default_group_title(raw) == title


def test_missing_level_stays_missing():
    assert normalize_level("") == ""
    assert normalize_level(None) == ""
    assert normalize_level("Cơ bản") == "core"
    with pytest.raises(ValueError):
        require_level("")


def test_choices_are_the_three_levels():
    assert LEVEL_CHOICES == ("core", "intermediate", "advanced")


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


def test_item_without_level_is_asked_and_nothing_is_written():
    set_actor("owner")
    thread = f"level-ask-{uuid.uuid4()}"
    text, events = _turn(NextGenRoadmapAgent(llm_model=None), "thêm bài học Docker Basics vào layer devops", thread)
    assert "level nào" in text and "`core`" in text and "`advanced`" in text
    assert not [e for e in events if e.get("type") in ("tool_start", "action_preview")]
    assert session_store.get_or_create(thread).pending_level_choice


def test_answer_with_a_level_completes_the_message_it_came_from():
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"level-answer-{uuid.uuid4()}"
    _turn(agent, "thêm bài học Docker Basics vào layer devops", thread)
    text, _ = _turn(agent, "core", thread)
    assert "level nào" not in text  # the level is taken: the question is not asked again
    assert session_store.get_or_create(thread).pending_level_choice is None


def test_cancel_drops_the_waiting_message():
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"level-cancel-{uuid.uuid4()}"
    _turn(agent, "thêm bài học Docker Basics vào layer devops", thread)
    text, events = _turn(agent, "hủy", thread)
    assert "Đã hủy" in text
    assert not [e for e in events if e.get("type") in ("tool_start", "action_preview")]
    assert session_store.get_or_create(thread).pending_level_choice is None


def test_default_layer_is_no_longer_offered():
    assert "mặc định" in NO_DEFAULT_LAYER_REPLY and "tạo layer Basics" in NO_DEFAULT_LAYER_REPLY
    assert "General" not in NO_DEFAULT_LAYER_REPLY


def test_bulk_import_without_a_level_asks_instead_of_core():
    assert "level nào" in BULK_LEVEL_ASK and "core" in BULK_LEVEL_ASK


def test_adapter_refuses_a_group_without_a_level():
    from rag_service.adapters.sqlite_adapter import SqliteAdapter
    from rag_service.write_grant import write_granted

    adapter = SqliteAdapter.__new__(SqliteAdapter)  # no database: the level is checked before any write
    with write_granted("test"), pytest.raises(ValueError):
        asyncio.run(adapter.create_group("layer-id", "Core", ""))
