"""RoadmapTarget answer capability: opt-in, behavior mapping, citations, history seeding (no network)."""

from __future__ import annotations

import asyncio

import pytest

from evals.target import RoadmapTarget, build_target
from rag_service.router.grounding import MIXED_INTENT_REPLY, SENSITIVE_REPLY


def test_answer_is_opt_in_so_the_default_run_stays_offline():
    assert "answer" not in build_target(mode="fts").capabilities
    assert "answer" in build_target(mode="fts", answer="llm").capabilities
    with pytest.raises(ValueError):
        build_target(answer="yes")


@pytest.mark.parametrize(
    "reply,steps,expected",
    [
        (SENSITIVE_REPLY, {}, "refuse"),
        ("ngoài phạm vi", {"route": {"intent": "out_of_scope"}}, "refuse"),
        ("chưa có", {"route": {"intent": "knowledge_query"}, "answer": {"mode": "no_match"}}, "refuse"),
        (MIXED_INTENT_REPLY, {}, "clarify"),
        ("?", {"route": {"intent": "chitchat"}, "answer": {"mode": "unclear"}}, "clarify"),
        ("Bạn tên là Cris.", {"route": {"intent": "chitchat"}, "answer": {"mode": "llm"}}, "answer"),
        ("context", {"route": {"intent": "knowledge_query"}, "answer": {"mode": "context"}}, "answer"),
    ],
)
def test_behavior_mapping(reply, steps, expected):
    assert RoadmapTarget._behavior(reply, steps) == expected


def test_citations_map_cited_sources_to_corpus_section_ids():
    target = RoadmapTarget(mode="fts")
    documents = target._load()[1]
    doc = documents[0]
    events = [
        {"type": "token", "delta": "x"},
        {"type": "metadata", "sources": [
            {"id": doc["source_id"], "cited": True},
            {"id": documents[1]["source_id"], "cited": False},
            {"id": "not-in-corpus", "cited": True},
        ]},
    ]
    assert target._citations(events) == [doc["doc_id"]]


class _EchoHistoryLlm:
    """Answers with whatever history reached the prompt, so the test sees what the target seeded."""

    async def astream(self, prompt):
        from langchain_core.messages import AIMessageChunk

        tag = "\n<conversation_history>\n"
        history = prompt.split(tag)[1].split("\n</conversation_history>")[0] if tag in prompt else ""
        yield AIMessageChunk(content=history or "no-history")


def test_answer_seeds_masked_history_and_runs_as_visitor(monkeypatch):
    from rag_service.agent import NextGenRoadmapAgent
    from rag_service.auth import current_actor

    seen_actor = []
    target = RoadmapTarget(mode="fts", answer="llm", cache="off")
    agent = NextGenRoadmapAgent(llm_model=_EchoHistoryLlm())
    real = agent.astream_events

    async def spy(*a, **kw):
        seen_actor.append(current_actor.get())
        async for ev in real(*a, **kw):
            yield ev

    monkeypatch.setattr(agent, "astream_events", spy)
    target._agent, target._loop = agent, asyncio.new_event_loop()
    monkeypatch.setattr(target, "_get_agent", lambda: agent)

    got = target.answer("xin chào", [{"role": "user", "content": "tôi là Cris, mail cris.demo@example.com"}])
    assert "Cris" in got.text and "cris.demo@example.com" not in got.text and "[email]" in got.text
    assert seen_actor == ["visitor"]

    # A fresh thread per sample: nothing carries over to the next one
    assert "Cris" not in target.answer("xin chào", []).text


def test_quota_hit_answer_is_unavailable_not_a_wrong_answer(monkeypatch):
    from evals.kit.target import TargetUnavailable

    target = RoadmapTarget(mode="fts", answer="llm", cache="off")
    target._get_agent = lambda: None
    target._loop = asyncio.new_event_loop()

    async def rate_limited(text, thread_id):
        return [
            {"type": "step", "id": "route", "status": "done", "intent": "chitchat"},
            {"type": "step", "id": "answer", "status": "done", "mode": "template", "fallback_reason": "rate_limited"},
            {"type": "token", "delta": "Xin lỗi"},
        ]

    monkeypatch.setattr(target, "_collect", rate_limited)
    import pytest as _pytest

    with _pytest.raises(TargetUnavailable) as exc:
        target.answer("xin chào", [])
    assert exc.value.reason == "rate_limited"


def test_answer_cache_skips_the_llm_on_the_second_identical_question(tmp_path, monkeypatch):
    import evals.target as target_mod

    monkeypatch.setattr(target_mod, "CACHE_FILE", tmp_path / "answers.json")
    target = RoadmapTarget(mode="fts", answer="llm", cache="on")
    calls = []

    async def fake_collect(text, thread_id):
        calls.append(text)
        return [
            {"type": "step", "id": "route", "status": "done", "intent": "chitchat"},
            {"type": "step", "id": "answer", "status": "done", "mode": "llm"},
            {"type": "token", "delta": "Bạn tên là Cris."},
        ]

    target._get_agent = lambda: None
    target._loop = asyncio.new_event_loop()
    monkeypatch.setattr(target, "_collect", fake_collect)
    first = target.answer("tôi tên gì?", [{"role": "user", "content": "tôi là Cris"}])
    second = target.answer("tôi tên gì?", [{"role": "user", "content": "tôi là Cris"}])
    assert calls == ["tôi tên gì?"]  # second call served from the cache
    assert first == second and second.text == "Bạn tên là Cris." and second.behavior == "answer"

    # A different history is a different question
    target.answer("tôi tên gì?", [])
    assert len(calls) == 2


def test_cache_off_always_calls_the_agent(tmp_path, monkeypatch):
    import evals.target as target_mod

    monkeypatch.setattr(target_mod, "CACHE_FILE", tmp_path / "answers.json")
    target = RoadmapTarget(mode="fts", answer="llm", cache="off")
    calls = []

    async def fake_collect(text, thread_id):
        calls.append(text)
        return [{"type": "step", "id": "answer", "status": "done", "mode": "llm"}, {"type": "token", "delta": "ok"}]

    target._get_agent = lambda: None
    target._loop = asyncio.new_event_loop()
    monkeypatch.setattr(target, "_collect", fake_collect)
    target.answer("q", [])
    target.answer("q", [])
    assert len(calls) == 2 and not (tmp_path / "answers.json").exists()


def test_fallback_answers_are_not_cached(tmp_path, monkeypatch):
    import pytest as _pytest

    import evals.target as target_mod
    from evals.kit.target import TargetUnavailable

    cache_file = tmp_path / "answers.json"
    monkeypatch.setattr(target_mod, "CACHE_FILE", cache_file)
    target = RoadmapTarget(mode="fts", answer="llm", cache="on")
    target._get_agent = lambda: None
    target._loop = asyncio.new_event_loop()

    async def rate_limited(text, thread_id):
        return [
            {"type": "step", "id": "answer", "status": "done", "mode": "template", "fallback_reason": "rate_limited"},
            {"type": "token", "delta": "Xin chào! Tôi là Abot"},
        ]

    monkeypatch.setattr(target, "_collect", rate_limited)
    with _pytest.raises(TargetUnavailable):
        target.answer("tôi tên gì?", [])
    assert not cache_file.exists()
