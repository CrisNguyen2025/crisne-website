"""Creates under noise, offline: a group or item with no level is asked for; the level is never defaulted.

Each base message runs as written and with noise: no diacritics, teencode, an emoji, a typo, all caps, a greeting.
The expectation is about the reply and the write, not the wording of the extraction.
"""

from __future__ import annotations

import asyncio
import re
import uuid

import pytest

from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router.grounding import NO_DEFAULT_LAYER_REPLY
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.state import session_store

ASKS_LEVEL = re.compile(r"level nào")


def _noise(text: str) -> dict[str, str]:
    # The typo lands on the object's last word, never on the verb: a broken verb is not a create at all
    words = text.split()
    before_level = words[: words.index("level")] if "level" in words else words
    candidates = [i for i in range(1, len(before_level)) if len(before_level[i]) > 4]
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


# (message, does it name a level?)
ITEM_NO_LEVEL = [
    "thêm bài học Docker Basics vào layer devops",
    "tạo item Redis trong layer 01-DB",
    "thêm bài Kafka vào layer devops nha",
]
ITEM_WITH_LEVEL = [
    "thêm bài học Docker Basics vào layer devops level core",
    "tạo item Redis trong layer 01-DB level advanced",
]
GROUP_NO_LEVEL = [
    "tạo nhóm Core trong layer devops",
    "tạo group Advanced trong layer 01-DB",
]
GROUP_WITH_LEVEL = [
    "tạo nhóm Core trong layer devops level core",
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


CASES = (
    [(m, "asks") for m in ITEM_NO_LEVEL + GROUP_NO_LEVEL]
    + [(m, "answers") for m in ITEM_WITH_LEVEL + GROUP_WITH_LEVEL + TOPIC]
)


@pytest.mark.parametrize("variant", ["orig", "no-diacritics", "teencode", "emoji", "typo", "upper", "greeting"])
@pytest.mark.parametrize("message,expect", CASES, ids=[m[:40] for m, _ in CASES])
def test_level_is_asked_exactly_when_it_is_missing(message, expect, variant):
    set_actor("owner")
    text = _noise(message)[variant]
    thread = f"noise-{uuid.uuid4()}"
    reply, events = _turn(NextGenRoadmapAgent(llm_model=None), text, thread)
    if expect == "asks":
        assert ASKS_LEVEL.search(reply), (text, reply[:120])
        assert not _writes(events), text
        assert session_store.get_or_create(thread).pending_level_choice
    else:
        assert not ASKS_LEVEL.search(reply), (text, reply[:120])


@pytest.mark.parametrize("variant", ["orig", "no-diacritics", "emoji", "typo", "upper"])
def test_answer_to_the_level_question_completes_the_create(variant):
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"noise-answer-{uuid.uuid4()}"
    _turn(agent, _noise(ITEM_NO_LEVEL[0])[variant], thread)
    reply, _ = _turn(agent, _noise("intermediate")[variant], thread)
    assert not ASKS_LEVEL.search(reply), reply[:120]
    assert session_store.get_or_create(thread).pending_level_choice is None


@pytest.mark.parametrize("variant", ["orig", "no-diacritics", "emoji", "upper"])
def test_default_layer_request_is_refused_under_noise(variant):
    set_actor("owner")
    reply, events = _turn(NextGenRoadmapAgent(llm_model=None), _noise("tạo layer mặc định")[variant], f"noise-layer-{uuid.uuid4()}")
    assert reply == NO_DEFAULT_LAYER_REPLY, reply[:120]
    assert not _writes(events)


def test_a_wrong_level_word_is_not_taken_as_an_answer():
    set_actor("owner")
    agent = NextGenRoadmapAgent(llm_model=None)
    thread = f"noise-wrong-{uuid.uuid4()}"
    _turn(agent, ITEM_NO_LEVEL[0], thread)
    reply, events = _turn(agent, "hôm nay trời đẹp ghê", thread)
    assert not _writes(events)
    assert session_store.get_or_create(thread).pending_level_choice is None or ASKS_LEVEL.search(reply) is None
