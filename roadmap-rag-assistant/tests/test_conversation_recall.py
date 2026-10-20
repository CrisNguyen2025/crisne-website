"""Questions about the user or earlier turns route to chitchat, where the history is in the prompt."""

from __future__ import annotations

import asyncio
import uuid

import pytest
from langchain_core.messages import AIMessageChunk

from rag_service.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType

RECALL = [
    "tôi tên gì?",
    "tôi tên là gì",
    "tên của mình là gì?",
    "tôi là ai?",
    "bạn có nhớ tên tôi không?",
    "nãy tôi nói gì?",
    "lúc nãy mình hỏi gì vậy",
    "tôi vừa nói gì?",
    "what's my name?",
    "who am I",
    "what did I say before?",
    "email của tôi là gì?",
    "sđt mình là bao nhiêu",
    "số điện thoại của tôi là gì?",
    "địa chỉ của tôi ở đâu?",
    "tên của tôi là gì",
    "what's my email?",
]

NOT_RECALL = [
    ("tìm bài học về Docker", IntentType.KNOWLEDGE_QUERY),
    ("Docker là gì?", IntentType.KNOWLEDGE_QUERY),
    ("tôi muốn tìm bài về tên miền", IntentType.KNOWLEDGE_QUERY),
    ("tạo topic AI Engineering", IntentType.ROADMAP_CUD),
    ("chào bạn", IntentType.CHITCHAT),
    ("bạn là gì vậy?", IntentType.CHITCHAT),
    ("bạn tên gì?", IntentType.CHITCHAT),
    ("who are you?", IntentType.CHITCHAT),
    ("bạn là ai, làm được gì?", IntentType.CHITCHAT),
    ("email marketing là gì?", IntentType.KNOWLEDGE_QUERY),
    ("địa chỉ IP là gì?", IntentType.KNOWLEDGE_QUERY),
    ("tìm bài về số điện thoại ảo", IntentType.KNOWLEDGE_QUERY),
]


INTRODUCTION = [
    "tôi là Huy đúng k",
    "tôi là Huy",
    "mình là Huy đúng không?",
    "tôi là cris",
    "tôi tên là huy đúng k",
    "mình tên là Huy đúng không?",
]


@pytest.mark.parametrize("text", INTRODUCTION)
def test_introduction_routes_to_chitchat(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == IntentType.CHITCHAT


@pytest.mark.parametrize("text", ["tôi là topic AI Engineering", "tôi là layer Docker đúng không"])
def test_introduction_with_roadmap_word_is_not_chitchat(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is None or res.intent != IntentType.CHITCHAT


@pytest.mark.parametrize("text", RECALL)
def test_recall_questions_route_to_chitchat(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == IntentType.CHITCHAT


@pytest.mark.parametrize("text,intent", NOT_RECALL)
def test_other_messages_keep_their_route(text, intent):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == intent


class RecordingLLM:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def astream(self, prompt):
        self.prompts.append(prompt)
        yield AIMessageChunk(content="Bạn là Cris.")


def test_name_question_is_answered_by_the_llm_with_history():
    llm = RecordingLLM()
    agent = NextGenRoadmapAgent(llm_model=llm)
    thread = f"t-{uuid.uuid4()}"

    async def say(text):
        return [
            ev
            async for ev in agent.astream_events(
                {"messages": [{"role": "user", "content": text}], "fast": True},
                config={"configurable": {"thread_id": thread}},
            )
        ]

    asyncio.run(say("tôi là Cris"))
    asyncio.run(say("xin chào"))
    events = asyncio.run(say("tôi tên gì?"))

    answer = [e for e in events if e.get("type") == "step" and e.get("id") == "answer" and e["status"] == "done"]
    assert answer[-1]["mode"] == "llm"
    assert "tôi là Cris" in llm.prompts[-1].split("<user_query>")[0]


@pytest.mark.parametrize("text", ["bạn là ai?", "Bạn là ai", "who are you?"])
def test_identity_question_with_question_mark_is_chitchat(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == IntentType.CHITCHAT


@pytest.mark.parametrize(
    "text",
    [
        "Tạo bài post mới trong layer General của topic Machine Learning",
        "Tạo bài post mới trong layer General của topic Machine Learning. Tiêu đề: Giới thiệu. Nội dung: Machine Learning là một nhánh của AI",
        "tạo bài mới tên X, nội dung: abc",
        "xóa bài Docker nội dung cũ",
    ],
)
def test_create_with_content_field_is_a_roadmap_change_not_a_search(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == IntentType.ROADMAP_CUD


@pytest.mark.parametrize(
    "text",
    ["nội dung bài Chunking Strategy là gì?", "tìm bài có nội dung về docker"],
)
def test_content_questions_still_search(text):
    res = IntentRouter().classify_heuristics(text)
    assert res is not None and res.intent == IntentType.KNOWLEDGE_QUERY
