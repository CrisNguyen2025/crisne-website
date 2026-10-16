"""IntentRouter fallback: without a usable LLM answer, messages go to the read-only knowledge branch."""

from __future__ import annotations

import pytest

from rag_service.agent import NextGenRoadmapAgent
from rag_service.auth import set_actor
from rag_service.rag.rag_engine import rag_engine
from rag_service.router.intent_router import IntentRouter
from rag_service.router.schemas import IntentClassificationResult, IntentType

# No heuristic matches this, so the router needs the LLM.
AMBIGUOUS = "nên học Docker trước hay Kubernetes trước"


class _Structured:
    def __init__(self, result=None, error: Exception | None = None) -> None:
        self.result, self.error = result, error

    async def ainvoke(self, prompt: str):
        if self.error:
            raise self.error
        return self.result


class _FakeLlm:
    """with_structured_output() for the router; astream() for answers, failing like a 429."""

    def __init__(self, result=None, error: Exception | None = None) -> None:
        self.structured = _Structured(result, error)
        self.error = error

    def with_structured_output(self, schema):
        return self.structured

    async def astream(self, prompt: str):
        raise self.error or RuntimeError("no answers in this fake")
        yield  # pragma: no cover - makes this an async generator


@pytest.fixture(autouse=True)
def _visitor():
    set_actor("visitor")
    yield
    set_actor("visitor")


async def test_llm_error_falls_back_to_knowledge_query():
    res = await IntentRouter(_FakeLlm(error=RuntimeError("429 RESOURCE_EXHAUSTED"))).aclassify(AMBIGUOUS)
    assert res.intent == IntentType.KNOWLEDGE_QUERY
    assert res.source == "fallback"
    assert res.fallback_reason == "llm_error:RuntimeError"  # type only, no quota details
    assert res.needs_cud_extraction is False


async def test_no_llm_falls_back_to_knowledge_query():
    res = await IntentRouter(None).aclassify(AMBIGUOUS)
    assert (res.intent, res.source, res.fallback_reason) == (IntentType.KNOWLEDGE_QUERY, "fallback", "no_llm")


async def test_invalid_llm_output_falls_back():
    res = await IntentRouter(_FakeLlm(result={"intent": "chitchat"})).aclassify(AMBIGUOUS)
    assert (res.source, res.fallback_reason) == ("fallback", "llm_invalid_output")


async def test_llm_answer_is_marked_as_llm():
    # Even if a model filled the hidden fields, the router sets them.
    answer = IntentClassificationResult(
        intent=IntentType.PLAN_GOAL, confidence=0.8, source="fallback", fallback_reason="x"
    )
    res = await IntentRouter(_FakeLlm(result=answer)).aclassify(AMBIGUOUS)
    assert (res.intent, res.source, res.fallback_reason) == (IntentType.PLAN_GOAL, "llm", None)


def test_router_fields_are_hidden_from_the_llm_schema():
    assert set(IntentClassificationResult.model_json_schema()["properties"]) == {
        "intent", "confidence", "needs_cud_extraction"
    }


async def test_agent_answers_from_search_not_a_greeting_when_the_llm_fails(monkeypatch):
    async def nothing(query: str, limit: int = 5):
        return []

    monkeypatch.setattr(rag_engine, "search_live_knowledge", nothing)
    agent = NextGenRoadmapAgent(llm_model=_FakeLlm(error=RuntimeError("503 UNAVAILABLE")))
    events = [ev async for ev in agent.astream_events(
        {"messages": [{"role": "user", "content": AMBIGUOUS}], "fast": True},
        config={"configurable": {"thread_id": "router-fallback"}},
    )]

    done = {e["id"]: e for e in events if e.get("type") == "step" and e["status"] != "running"}
    assert done["route"]["intent"] == "knowledge_query"
    assert done["route"]["method"] == "fallback"
    assert done["route"]["fallback_reason"] == "llm_error:RuntimeError"
    assert done["answer"]["mode"] == "no_match"
    text = "".join(e["delta"] for e in events if e.get("type") == "token")
    assert "Xin chào" not in text
