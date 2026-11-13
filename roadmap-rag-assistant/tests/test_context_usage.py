"""POST /chat/context: what a conversation carries into its next answer, against Abot's budget."""

from __future__ import annotations

import asyncio
import math
import uuid

import pytest
from fastapi.testclient import TestClient

from rag_service.context_usage import (
    DEFAULT_WINDOW,
    OUTPUT_RESERVE_TOKENS,
    context_window,
    conversation_context,
    estimate_tokens,
    record_last_turn,
    split_prompt,
)
from rag_service.core.augmentation.context import GenerationRequest, build_prompt
from rag_service.core.augmentation.history import InMemoryHistoryStore
from rag_service.core.generation.delivery import record_turn
from rag_service.domains.roadmap.pipeline import generation_pipeline
from rag_service.domains.roadmap.profile import PROFILE
from tests.test_generation_pipeline import DOC, RecordingLLM


def _thread() -> str:
    return f"t-{uuid.uuid4()}"


def _context(thread: str, store: InMemoryHistoryStore) -> dict:
    return conversation_context(thread, PROFILE, model="openai/gpt-oss-120b", history=store)


def test_estimate_tokens_rounds_up_and_empty_is_zero():
    assert estimate_tokens("") == 0
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("abcde") == 2


def test_a_tag_named_inside_the_rules_stays_in_the_system_prompt():
    """The roadmap rules say "… trong <context>." mid-sentence; only the real block counts as retrieved."""
    assert "trong <context>" in PROFILE.rules_rag
    prompt = build_prompt(GenerationRequest(mode="rag", query="q", thread_id=_thread(), sources=[(DOC, 0.9)]), PROFILE)
    block = prompt[prompt.index("\n<context>\n") + 1 : prompt.index("\n</context>") + len("\n</context>")]

    assert split_prompt(prompt)["retrieved"] == block


def test_a_new_conversation_holds_only_the_system_prompt():
    ctx = _context(_thread(), InMemoryHistoryStore())

    system, messages = ctx["parts"]
    assert system["key"] == "system" and system["tokens"] > 0
    assert messages == {"key": "messages", "label": "Tin nhắn", "tokens": 0, "count": 0, "limit": PROFILE.history_turns * 2}
    assert ctx["used"] == system["tokens"]
    assert ctx["omitted"] == [] and ctx["last_turn"] is None


def test_messages_grow_with_the_conversation_and_count_against_the_window():
    store, thread = InMemoryHistoryStore(), _thread()
    store.append(thread, "user", "docker là gì")
    store.append(thread, "assistant", "Docker đóng gói ứng dụng vào container.")

    before = _context(thread, store)
    store.append(thread, "user", "còn kubernetes?")
    after = _context(thread, store)

    assert before["parts"][1]["count"] == 2 and after["parts"][1]["count"] == 3
    assert after["used"] > before["used"]
    assert after["parts"][0]["tokens"] == before["parts"][0]["tokens"]  # the system prompt is fixed


def test_messages_past_the_window_are_reported_as_omitted():
    store, thread = InMemoryHistoryStore(), _thread()
    limit = PROFILE.history_turns * 2
    for i in range(limit + 3):
        store.append(thread, "user" if i % 2 == 0 else "assistant", f"tin {i}")

    ctx = _context(thread, store)

    assert ctx["parts"][1]["count"] == limit
    assert ctx["omitted"] == [{"key": "history_outside", "label": "Tin nhắn ngoài cửa sổ", "count": 3}]


def test_budget_is_abots_caps_not_the_model_window():
    ctx = _context(_thread(), InMemoryHistoryStore())

    reserved = {r["key"]: r["tokens"] for r in ctx["reserved"]}
    assert list(reserved) == ["retrieved", "message", "output"]
    assert reserved["output"] == OUTPUT_RESERVE_TOKENS
    history_cap = ctx["budget"] - ctx["parts"][0]["tokens"] - sum(reserved.values())
    assert history_cap >= math.ceil(PROFILE.history_turns * 2 * PROFILE.history_max_chars / 4)
    assert ctx["budget"] < ctx["window"]


def test_window_follows_the_model_and_an_override_wins():
    assert context_window("openai/gpt-oss-120b") == 131_072
    assert context_window("gemini-flash-latest") == 1_000_000
    assert context_window("something-new") == DEFAULT_WINDOW
    assert conversation_context(_thread(), PROFILE, model="gemini", window=32_000)["window"] == 32_000


def test_last_turn_keeps_measured_usage_and_lesson_titles_only():
    thread = _thread()
    record_turn(thread, "mã bí mật 12345", "ok")
    prompt = build_prompt(GenerationRequest(mode="rag", query="docker?", thread_id=thread, sources=[(DOC, 0.9)]), PROFILE)

    turn = record_last_turn(thread, prompt, usage={"input": 1234, "output": 56},
                            documents=[("Docker", "x" * 41)], dropped_documents=2)
    ctx = conversation_context(thread, PROFILE, model="m")

    assert turn["measured"] is True and turn["input_tokens"] == 1234 and turn["output_tokens"] == 56
    assert turn["documents"] == [{"label": "Docker", "tokens": 11}]
    assert ctx["last_turn"] == turn
    assert {"key": "retrieved_dropped", "label": "Tài liệu bị loại (lượt gần nhất)", "count": 2} in ctx["omitted"]
    assert "12345" not in str(ctx)


def test_without_provider_usage_the_input_is_estimated():
    prompt = build_prompt(GenerationRequest(mode="chitchat", query="xin chào", thread_id=_thread()), PROFILE)

    turn = record_last_turn(_thread(), prompt)

    assert turn["measured"] is False and turn["input_tokens"] == pytest.approx(estimate_tokens(prompt), abs=4)


def test_an_llm_answer_is_recorded_as_the_last_turn():
    thread = _thread()

    async def run():
        req = GenerationRequest(mode="rag", query="docker là gì?", thread_id=thread, sources=[(DOC, 0.9)])
        return [ev async for ev in generation_pipeline.astream(RecordingLLM("Docker là container."), req)]

    events = asyncio.run(run())
    turn = conversation_context(thread, PROFILE, model="m")["last_turn"]

    assert all(e["type"] != "context" for e in events)
    assert [d["label"] for d in turn["documents"]] == ["Docker"]
    assert sum(d["tokens"] for d in turn["documents"]) <= turn["retrieved_tokens"]


def test_endpoint_refuses_the_shared_default_thread_and_answers_a_real_one(monkeypatch):
    from rag_service.api.server import app
    from rag_service.config import settings

    monkeypatch.setattr(settings, "internal_api_key", "k")
    client = TestClient(app)
    headers = {"x-internal-key": "k"}

    assert client.post("/chat/context", json={"thread_id": "visitor:default"}, headers=headers).status_code == 422
    res = client.post("/chat/context", json={"thread_id": f"visitor:{uuid.uuid4()}"}, headers=headers)
    assert res.status_code == 200 and res.json()["parts"][0]["key"] == "system"
