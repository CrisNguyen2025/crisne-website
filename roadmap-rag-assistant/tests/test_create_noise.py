"""Creates under noise, offline: a lesson whose group the layer does not settle is asked for (ADR-0008).

Each base message runs as written and with noise: no diacritics, teencode, an emoji, a typo, all caps, a greeting.
The expectation is about the reply and the write, not the wording of the extraction.
"""

from __future__ import annotations

import asyncio
import re
import uuid

import pytest

from rag_service.adapters.groups import GroupChoiceRequired
from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router.grounding import NO_DEFAULT_LAYER_REPLY
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.state import session_store

ASKS_GROUP = re.compile(r"nhóm nào|chưa có nhóm nào")
TOPICS = {"test-topic": {"slug": "test-topic", "title": "Test Topic", "layers": [{"id": "layer-id", "shortTag": "01-NL", "title": "New Layer"}]}}


@pytest.fixture(autouse=True)
def layer_with_two_groups(mock_adapter):
    mock_adapter.list_topics.return_value = [{"slug": "test-topic", "title": "Test Topic"}]
    mock_adapter.get_topic.side_effect = lambda slug: TOPICS.get(slug)

    async def create_item(layer_id, group_title, title, description="", content=""):
        if not group_title:
            raise GroupChoiceRequired(["Core", "Production"])
        return {"id": f"id-{title}", "title": title, "layerId": layer_id, "groupId": f"g-{group_title}"}

    mock_adapter.create_item.side_effect = create_item
    return mock_adapter


def _noise(text: str) -> dict[str, str]:
    # The typo lands on the object's last word, never on the verb or a layer tag: a broken verb is not a create
    words = text.split()
    keywords = {"layer", "nhóm", "group", "trong"}
    candidates = [
        i for i in range(1, len(words))
        if len(words[i]) > 4 and words[i].lower() not in keywords and not any(c.isdigit() for c in words[i])
    ]
    if candidates:
        k = candidates[-1]
        typo = " ".join(words[:k] + [words[k][:-2] + words[k][-1] + words[k][-2]] + words[k + 1:])
    else:
        typo = text  # a one-word answer has no object to misspell
    teencode = text.replace("không", "ko").replace("mình", "mk").replace("được", "dc")
    return {
        "orig": text,
        "no-diacritics": fold(text),
        "teencode": teencode,
        "emoji": text + " 😅",
        "typo": typo,
        "upper": text.upper(),
        "greeting": "ê ad ơi " + text,
    }


ITEM_NO_GROUP = [
    "thêm bài học Docker Basics vào layer 01-NL",
    "tạo item Redis trong layer 01-NL",
    "thêm bài Kafka vào layer 01-NL nha",
]
ITEM_WITH_GROUP = [
    "thêm bài học Docker Basics vào nhóm Production của layer 01-NL",
    "tạo item Redis trong layer 01-NL vào nhóm Core",
]
GROUP = [
    "tạo nhóm Core trong layer 01-NL",
    "tạo group Advanced trong layer 01-NL",
]
TOPIC = [
    "tạo topic Data Engineering",
    "tạo topic AI Engineering",
]


def _turn(agent, text: str, thread: str):
    async def run():
        out = []
        async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": text}], "fast": True},
            config={"configurable": {"thread_id": thread}},
        ):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


def _writes(events) -> list:
    return [e for e in events if e.get("type") in ("tool_start", "action_preview")]


def _run(agent, text: str, thread: str):
    """The create, with its preview confirmed when the write gate shows one."""
    reply, events = _turn(agent, text, thread)
    if any(e.get("type") == "action_preview" for e in events):
        reply, events = _turn(agent, "ok", thread)
    return reply, events


CASES = [(m, "asks") for m in ITEM_NO_GROUP] + [(m, "answers") for m in ITEM_WITH_GROUP + GROUP + TOPIC]


@pytest.mark.parametrize("variant", ["orig", "no-diacritics", "teencode", "emoji", "typo", "upper", "greeting"])
@pytest.mark.parametrize("message,expect", CASES, ids=[m[:40] for m, _ in CASES])
def test_group_is_asked_exactly_when_the_layer_does_not_settle_it(message, expect, variant):
    set_actor("owner")
    text = _noise(message)[variant]
    thread = f"noise-{uuid.uuid4()}"
    reply, _ = _run(NextGenRoadmapAgent(llm_model=None), text, thread)
    if expect == "asks":
        assert ASKS_GROUP.search(reply), (text, reply[:120])
        assert session_store.get_or_create(thread).pending_group_choice
    else:
        assert not ASKS_GROUP.search(reply), (text, reply[:120])


@pytest.mark.parametrize("variant", ["orig", "no-diacritics", "emoji", "typo", "upper"])
def test_answer_to_the_group_question_completes_the_create(variant, layer_with_two_groups):
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"noise-answer-{uuid.uuid4()}"
    _run(agent, _noise(ITEM_NO_GROUP[0])[variant], thread)
    reply, _ = _turn(agent, _noise("production")[variant], thread)
    assert not ASKS_GROUP.search(reply), reply[:120]
    assert layer_with_two_groups.create_item.call_args.kwargs["group_title"] == "Production"
    assert session_store.get_or_create(thread).pending_group_choice is None


@pytest.mark.parametrize("variant", ["orig", "no-diacritics", "emoji", "upper"])
def test_default_layer_request_is_refused_under_noise(variant):
    set_actor("owner")
    reply, events = _turn(NextGenRoadmapAgent(llm_model=None), _noise("tạo layer mặc định")[variant], f"noise-layer-{uuid.uuid4()}")
    assert reply == NO_DEFAULT_LAYER_REPLY, reply[:120]
    assert not _writes(events)


def test_an_unrelated_message_is_not_taken_as_a_group(layer_with_two_groups):
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"noise-wrong-{uuid.uuid4()}"
    _run(agent, ITEM_NO_GROUP[0], thread)
    calls = layer_with_two_groups.create_item.call_count
    _, events = _turn(agent, "hôm nay trời đẹp ghê", thread)
    assert not _writes(events)
    assert layer_with_two_groups.create_item.call_count == calls
