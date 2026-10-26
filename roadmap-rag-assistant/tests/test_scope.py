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
