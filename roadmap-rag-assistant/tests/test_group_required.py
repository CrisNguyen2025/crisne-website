"""A lesson goes to a named group, or the layer's only one; otherwise it is asked for (ADR-0008)."""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path

import pytest

from rag_service.adapters.groups import GroupChoiceRequired, pick_group
from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router.entity_extractor import StructuredEntityExtractor, named_group
from rag_service.domains.roadmap.router.grounding import NO_DEFAULT_LAYER_REPLY
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, SingleEntity, StructuredRoadmapAction
from rag_service.state import session_store

GROUP_CASES = json.loads((Path(__file__).parent / "data" / "group_cases.json").read_text(encoding="utf-8"))
LAYERS = {"test-topic": {"slug": "test-topic", "title": "Test Topic", "layers": [{"id": "layer-id", "shortTag": "01-NL", "title": "New Layer"}]}}


@pytest.mark.parametrize("case", GROUP_CASES["pick"], ids=[c["name"] for c in GROUP_CASES["pick"]])
def test_shared_group_cases(case):
    groups = [{"id": f"g{i}", "title": t} for i, t in enumerate(case["groups"], 1)]
    kind, picked = pick_group(groups, group_id=case.get("groupId"), group_title=case.get("groupTitle"))
    want_kind, want = case["expect"]
    assert kind == want_kind
    assert (picked["title"] if kind == "existing" else picked) == want


# ── Extraction: the group a message names fills the lesson, never a default ──


def _lesson(title: str, layer: str) -> StructuredRoadmapAction:
    return StructuredRoadmapAction(
        action=ActionType.CREATE, entity_level=EntityLevel.ITEM, target_parent_identifier=layer,
        entities=[SingleEntity(title=title)],
    )


@pytest.mark.parametrize(
    "text,group",
    [
        ("thêm bài KV cache vào nhóm Inference của layer 02", "Inference"),
        ('thêm bài KV cache vào layer 02 vào nhóm "Inference"', "Inference"),
        ("add lesson X to group Fundamentals in layer 01-LLM", "Fundamentals"),
        ("thêm bài KV cache vào layer 02", ""),
        # "tạo nhóm X" creates the group itself: X is not a lesson's group
        ("tạo nhóm Production trong layer 02", ""),
    ],
)
def test_named_group(text, group):
    assert named_group(text) == group


def test_group_named_in_the_message_fills_a_model_reading_without_one():
    text = 'thêm bài "QA Abot Test" vào nhóm Core của layer 04-ops'
    action = StructuredEntityExtractor().from_verified(_lesson("QA Abot Test", "04-ops"), text=text)
    assert [e.group_title for e in action.entities] == ["Core"]
    action = StructuredEntityExtractor().from_verified(_lesson("QA Abot Test", "04-ops"), text="thêm bài QA")
    assert not action.entities[0].group_title


def test_group_clause_is_not_left_on_the_layer_or_the_title():
    text = 'thêm bài "QA Abot Test" vào nhóm Core của layer 04-ops'
    action = StructuredEntityExtractor().from_verified(_lesson("QA Abot Test vào nhóm Core", "04-ops"), text=text)
    assert action.target_parent_identifier == "04-ops"
    assert [(e.title, e.group_title) for e in action.entities] == [("QA Abot Test", "Core")]


def test_deterministic_reading_keeps_the_layer_and_the_group():
    action = asyncio.run(StructuredEntityExtractor().aextract("thêm bài KV cache vào nhóm Inference của layer 02"))
    assert action.entity_level == EntityLevel.ITEM and action.target_parent_identifier == "02"
    assert [(e.title, e.group_title) for e in action.entities] == [("KV cache", "Inference")]


def test_a_group_create_needs_no_group_title():
    action = asyncio.run(StructuredEntityExtractor().aextract("tạo nhóm Production trong layer 02"))
    assert action.entity_level == EntityLevel.GROUP
    assert [(e.title, e.group_title) for e in action.entities] == [("Production", None)]


# ── The chat: asked when the layer does not settle the group, the answer completes the create ──


@pytest.fixture
def layer_with_two_groups(mock_adapter):
    mock_adapter.list_topics.return_value = [{"slug": "test-topic", "title": "Test Topic"}]
    mock_adapter.get_topic.side_effect = lambda slug: LAYERS.get(slug)

    async def create_item(layer_id, group_title, title, description="", content=""):
        if not group_title:
            raise GroupChoiceRequired(["Core", "Production"])
        return {"id": f"id-{title}", "title": title, "layerId": layer_id, "groupId": f"g-{group_title}"}

    mock_adapter.create_item.side_effect = create_item
    return mock_adapter


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


def _create(agent, thread, text="thêm bài học Docker Basics vào layer 01-NL"):
    """Runs the create, confirming the preview when the write gate shows one."""
    reply, events = _turn(agent, text, thread)
    if any(e.get("type") == "action_preview" for e in events):
        reply, events = _turn(agent, "ok", thread)
    return reply, events


def test_lesson_without_a_group_is_asked_and_nothing_is_written(layer_with_two_groups):
    set_actor("owner")
    thread = f"group-ask-{uuid.uuid4()}"
    reply, _ = _create(NextGenRoadmapAgent(llm_model=None), thread)
    assert "nhóm nào" in reply and "**Core**" in reply and "**Production**" in reply
    ctx = session_store.get_or_create(thread)
    assert ctx.pending_group_choice and ctx.pending_group_options == ["Core", "Production"]


@pytest.mark.parametrize("answer,group", [("2", "Production"), ("core", "Core"), ("nhóm Deep Dive", "Deep Dive")])
def test_answer_completes_the_create_it_came_from(layer_with_two_groups, answer, group):
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"group-answer-{uuid.uuid4()}"
    _create(agent, thread)
    reply, _ = _turn(agent, answer, thread)
    assert "nhóm nào" not in reply
    assert layer_with_two_groups.create_item.call_args.kwargs["group_title"] == group
    assert session_store.get_or_create(thread).pending_group_choice is None


def test_cancel_drops_the_waiting_lesson(layer_with_two_groups):
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"group-cancel-{uuid.uuid4()}"
    _create(agent, thread)
    calls = layer_with_two_groups.create_item.call_count
    reply, _ = _turn(agent, "hủy", thread)
    assert "Đã hủy" in reply
    assert layer_with_two_groups.create_item.call_count == calls
    assert session_store.get_or_create(thread).pending_group_choice is None


def test_an_unrelated_message_is_not_taken_as_a_group(layer_with_two_groups):
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"group-unrelated-{uuid.uuid4()}"
    _create(agent, thread)
    calls = layer_with_two_groups.create_item.call_count
    _turn(agent, "hôm nay trời đẹp ghê", thread)
    assert layer_with_two_groups.create_item.call_count == calls
    assert session_store.get_or_create(thread).pending_group_choice is None


def test_a_named_group_is_written_without_asking(layer_with_two_groups):
    set_actor("owner")
    thread = f"group-named-{uuid.uuid4()}"
    reply, _ = _create(NextGenRoadmapAgent(llm_model=None), thread, "thêm bài học Docker Basics vào nhóm Production của layer 01-NL")
    assert "nhóm nào" not in reply
    assert layer_with_two_groups.create_item.call_args.kwargs["group_title"] == "Production"


def test_default_layer_is_no_longer_offered():
    assert "mặc định" in NO_DEFAULT_LAYER_REPLY and "tạo layer Basics" in NO_DEFAULT_LAYER_REPLY
    assert "General" not in NO_DEFAULT_LAYER_REPLY
