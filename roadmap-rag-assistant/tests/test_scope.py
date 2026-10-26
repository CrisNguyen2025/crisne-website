"""Scope: act x target, with the target read from the roadmap's data when keywords name none."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
from rag_service.domains.roadmap.router import route_decision
from rag_service.domains.roadmap.router.grounding import OUT_OF_SCOPE_REPLY
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType
from rag_service.domains.roadmap.router.scope import Scope, ScopeResult, classify_scope
from rag_service.domains.roadmap.router.target_grounding import Catalog

TH = {"roadmap_min": 0.71, "gap_min": 0.63, "uncertain_band": 0.01}


class _Centroids:
    def __init__(self, nearest):
        self.nearest = nearest

    def signals(self, vec):
        return SimpleNamespace(nearest=self.nearest, domain=0.0)


def _catalog():
    return Catalog.from_documents([SimpleNamespace(doc_type="item", title="Hybrid Search")])


@pytest.mark.parametrize("nearest,scope", [
    (0.80, Scope.ROADMAP), (0.68, Scope.DOMAIN_GAP), (0.60, Scope.EXTERNAL), (0.63, Scope.NONE),  # in the band
])
def test_embedding_signal_decides_by_tuned_thresholds(nearest, scope):
    got = classify_scope("bạn có biết thông tin về telegram k", centroids=_Centroids(nearest), query_vec=[1], thresholds=TH)
    assert got.scope == scope and got.focus == "telegram"


def test_catalog_name_is_roadmap_without_embeddings():
    assert classify_scope("hybrid search là gì", catalog=_catalog()).scope == Scope.ROADMAP


def test_without_embeddings_an_unknown_topic_is_never_called_external():
    assert classify_scope("bạn có biết thông tin về telegram k", catalog=_catalog()).scope == Scope.NONE


def test_no_topic_is_none():
    assert classify_scope("bài đó sao", centroids=_Centroids(0.9), query_vec=[1], thresholds=TH).scope == Scope.NONE


def _decide(text, scope):
    async def fake(t):
        return ScopeResult(scope, "x", "test")

    return asyncio.run(route_decision.decide_route(IntentRouter(), text, (), scope_fn=fake))


def test_external_question_is_out_of_scope_before_any_model_or_search():
    out = _decide("bạn có biết thông tin về telegram k", Scope.EXTERNAL)
    assert out.intent_res.intent == IntentType.OUT_OF_SCOPE and out.method == "scope"


def test_roadmap_object_keywords_skip_the_scope_read():
    called = []

    async def fake(t):
        called.append(t)
        return ScopeResult(Scope.EXTERNAL, "x", "test")

    asyncio.run(route_decision.decide_route(IntentRouter(), "xóa bài Semantic Caching", (), scope_fn=fake))
    assert called == []


def test_agent_answers_an_external_question_without_searching(monkeypatch):
    import rag_service.domains.roadmap.agent as agent_module

    async def external(text, engine, embed=None):
        return ScopeResult(Scope.EXTERNAL, "telegram", "test")

    searched = []

    async def no_search(**kw):
        searched.append(kw["query"])
        yield {"type": "token", "delta": "x"}

    monkeypatch.setattr(agent_module, "classify_for_routing", external)
    monkeypatch.setattr(agent_module, "answer_from_sources", no_search)

    async def run():
        agent = NextGenRoadmapAgent(llm_model=None)
        return [ev async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": "bạn có biết thông tin về telegram k"}], "fast": True},
            config={"configurable": {"thread_id": "scope-external"}})]

    events = asyncio.run(run())
    text = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
    assert searched == [] and "tạo topic" not in text and text.strip() == OUT_OF_SCOPE_REPLY.strip()


def test_domain_gap_with_no_lesson_says_so(monkeypatch):
    import rag_service.domains.roadmap.agent as agent_module

    async def gap(text, engine, embed=None):
        return ScopeResult(Scope.DOMAIN_GAP, "lora", "test")

    seen = {}

    async def capture(**kw):
        seen["reply"] = kw["deps"].no_match_reply(True)
        yield {"type": "token", "delta": seen["reply"]}

    monkeypatch.setattr(agent_module, "classify_for_routing", gap)
    monkeypatch.setattr(agent_module, "answer_from_sources", capture)

    async def run():
        agent = NextGenRoadmapAgent(llm_model=None)
        return [ev async for ev in agent.astream_events(
            {"messages": [{"role": "user", "content": "LoRA là gì"}], "fast": True},
            config={"configurable": {"thread_id": "scope-gap"}})]

    asyncio.run(run())
    assert "chưa có bài học về **lora**" in seen["reply"]


def test_router_prompt_examples_never_come_from_the_scope_eval_set():
    # An eval sample in the prompt would measure memory, not the router (the holdout split especially)
    import json
    from pathlib import Path

    from rag_service.domains.roadmap.router.focus import focus_of
    from rag_service.domains.roadmap.router.policy import ROUTER_EXAMPLES

    path = Path(__file__).resolve().parents[1] / "evals/datasets/_scope/samples.jsonl"
    samples = [json.loads(line)["input"] for line in path.read_text(encoding="utf-8").splitlines()]
    seen = {s.lower() for s in samples} | {focus_of(s) for s in samples if focus_of(s)}
    assert not [m for m, _ in ROUTER_EXAMPLES if m.lower() in seen or focus_of(m) in seen]


def test_question_about_the_field_left_open_by_heuristics_is_a_search():
    out = _decide("bạn có biết gì về semantic caching không nhỉ", Scope.ROADMAP)
    assert out.intent_res.intent == IntentType.KNOWLEDGE_QUERY and out.method == "scope"
    gap = _decide("bạn có biết về LoRA không", Scope.DOMAIN_GAP)
    assert gap.intent_res.intent == IntentType.KNOWLEDGE_QUERY


def test_unclear_scope_leaves_the_message_to_the_router():
    assert _decide("bạn có biết về LoRA không", Scope.NONE).method != "scope"


def test_a_lesson_name_inside_the_message_is_the_roadmap():
    catalog = Catalog.from_documents([
        SimpleNamespace(doc_type="item", title="Vector Database"),
        SimpleNamespace(doc_type="item", title="Data Drift & Hallucination Rate"),
        SimpleNamespace(doc_type="layer", title="04. Tầng Ops & Đánh giá (LLMOps)", layer_tag="04-OPS"),
    ])
    assert catalog.mentioned_in("ờ cho mình hỏi là cái vector database ấy nó khác gì")
    assert catalog.mentioned_in("data drift là gì")  # one part of a joined title
    # parts must stay specific: "đánh giá" alone, or a parenthesised abbreviation, is no lesson name
    assert not catalog.mentioned_in("phim này đánh giá thế nào")
    assert not catalog.mentioned_in("bạn có biết thông tin về telegram k")
