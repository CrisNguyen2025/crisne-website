"""A request for help that names nothing gets the command list; a sentence is never offered as a lesson title.

2026-11-04, live (trace 7d306a87dcf7841014dcc17065094187): "tôi cần hỗ trợ học tập" was routed as a domain gap
with the whole message as its focus, found nothing, and was answered "Roadmap chưa có bài học về **tôi cần hỗ trợ
học tập**" with the suggestion "thêm bài tôi cần hỗ trợ học tập vào topic …".
"""

from __future__ import annotations

import asyncio
import uuid

import pytest

from rag_service.auth import set_actor
from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router.grounding import domain_gap_reply, looks_like_title
from rag_service.domains.roadmap.router.understanding import understand
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese


def _reply(text: str) -> tuple[str, list[dict]]:
    agent = NextGenRoadmapAgent(llm_model=None)

    async def run():
        out = []
        async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": text}], "fast": True},
            config={"configurable": {"thread_id": f"help-{uuid.uuid4()}"}},
        ):
            out.append(ev)
        return out

    events = asyncio.run(run())
    return "".join(e.get("delta", "") for e in events if e.get("type") == "token"), events


@pytest.mark.parametrize(
    "text",
    ["tôi cần hỗ trợ học tập", "toi can ho tro hoc tap", "tôi cần hỗ trợ", "hỗ trợ học tập", "giúp mình với", "hướng dẫn tôi"],
)
def test_help_request_without_subject_asks_usage(text):
    assert understand(normalize_vietnamese(text)).asks_usage


@pytest.mark.parametrize(
    "text",
    ["tôi cần hỗ trợ về RAG", "hướng dẫn tôi học Docker", "hỗ trợ học tập về Kafka", "giúp tôi thêm bài Docker"],
)
def test_help_request_with_a_subject_is_not_usage(text):
    assert not understand(normalize_vietnamese(text)).asks_usage


def test_help_request_gets_the_command_list(mock_adapter):
    set_actor("owner")
    text, events = _reply("tôi cần hỗ trợ học tập")
    assert "Roadmap chưa có bài học" not in text
    assert "thêm bài tôi cần" not in text
    assert "Tôi quản lý roadmap" in text
    assert not [e for e in events if e.get("type") == "tool_start"]


@pytest.mark.parametrize("topic", ["Kafka Streams", "Cân bằng tải", "Intro to Docker", "Vector DB cho người mới"])
def test_lesson_names_look_like_titles(topic):
    assert looks_like_title(topic)


@pytest.mark.parametrize(
    "topic", ["tôi cần hỗ trợ học tập", "làm sao để deploy", "Quản lý tài nguyên GPU trong cụm Kubernetes lớn", "", None]
)
def test_sentences_do_not_look_like_titles(topic):
    assert not looks_like_title(topic)


def test_domain_gap_never_offers_a_sentence_as_a_lesson():
    reply = domain_gap_reply("tôi cần hỗ trợ học tập", owner=True)
    assert "tôi cần" not in reply and "thêm bài" not in reply
    assert "chủ đề này" in reply


def test_domain_gap_still_offers_a_named_topic():
    reply = domain_gap_reply("Kafka Streams", owner=True)
    assert "**Kafka Streams**" in reply and "thêm bài Kafka Streams vào topic" in reply
