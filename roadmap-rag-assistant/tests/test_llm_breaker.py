"""LLM circuit breaker on quota errors and the route/answer step labels it produces."""

from __future__ import annotations

import asyncio

from rag_service.agent import NextGenRoadmapAgent
from rag_service.auth import set_actor
from rag_service.llm_breaker import LlmCircuitBreaker, llm_breaker, retry_after_seconds
from rag_service.steps import with_steps

# Shape of the Gemini free-tier error seen in production
QUOTA_ERROR = (
    "Error calling model 'gemini-flash-latest' (RESOURCE_EXHAUSTED): 429 RESOURCE_EXHAUSTED. "
    "{'error': {'code': 429, 'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo', "
    "'retryDelay': '54198s'}]}}"
)


def test_retry_delay_is_read_from_quota_error():
    assert retry_after_seconds(RuntimeError(QUOTA_ERROR)) == 54198.0
    assert retry_after_seconds(RuntimeError("429 Too Many Requests")) == 60.0
    assert retry_after_seconds(RuntimeError("connection reset")) is None


def test_breaker_opens_until_retry_delay():
    now = [1000.0]
    breaker = LlmCircuitBreaker(clock=lambda: now[0])
    assert not breaker.record_failure(RuntimeError("timeout")) and not breaker.is_open
    assert breaker.record_failure(RuntimeError(QUOTA_ERROR)) and breaker.is_open
    now[0] += 54197
    assert breaker.is_open
    now[0] += 2
    assert not breaker.is_open


class _QuotaLlm:
    """Every call fails with the quota error; counts how often it was called."""

    def __init__(self):
        self.calls = 0

    def with_structured_output(self, schema):
        return self

    async def ainvoke(self, prompt):
        self.calls += 1
        raise RuntimeError(QUOTA_ERROR)

    async def astream(self, prompt):
        self.calls += 1
        raise RuntimeError(QUOTA_ERROR)
        yield  # pragma: no cover - makes this an async generator


def _steps(agent: NextGenRoadmapAgent, text: str, thread_id: str) -> dict[str, dict]:
    async def run():
        done = {}
        async for ev in with_steps(agent.astream_events(
            {"messages": [{"role": "user", "content": text}], "fast": True},
            config={"configurable": {"thread_id": thread_id}},
        )):
            if ev.get("type") == "step" and ev["status"] != "running":
                done[ev["id"]] = ev
        return done

    return asyncio.run(run())


def test_quota_error_opens_breaker_and_later_turns_skip_the_llm():
    set_actor("visitor")
    llm = _QuotaLlm()
    agent = NextGenRoadmapAgent(llm_model=llm)

    first = _steps(agent, "xyz qwerty", "breaker-1")
    assert first["route"]["method"] == "llm_error"
    assert first["answer"]["fallback_reason"] == "rate_limited"
    assert llm.calls == 1 and llm_breaker.is_open

    second = _steps(agent, "xyz qwerty", "breaker-2")
    assert second["route"]["method"] == "rate_limited"
    assert llm.calls == 1


def test_route_method_is_default_without_llm():
    set_actor("visitor")
    steps = _steps(NextGenRoadmapAgent(llm_model=None), "xyz qwerty", "breaker-default")
    assert steps["route"]["method"] == "default"
    assert "fallback_reason" not in steps["answer"]
