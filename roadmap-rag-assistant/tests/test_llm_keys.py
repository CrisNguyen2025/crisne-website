"""Several keys for one provider: a rate-limited key hands the call to the next one."""

from __future__ import annotations

import asyncio

import pytest

from rag_service.llm_keys import KeyRotatingLLM, is_rate_limited, parse_keys


class RateLimitError(Exception):
    pass


class _Model:
    def __init__(self, name: str, fail: Exception | None = None, chunks=("a", "b")) -> None:
        self.name, self.fail, self.chunks, self.calls = name, fail, chunks, 0

    def invoke(self, prompt):
        self.calls += 1
        if self.fail:
            raise self.fail
        return self.name

    async def ainvoke(self, prompt):
        return self.invoke(prompt)

    async def astream(self, prompt):
        self.calls += 1
        if self.fail:
            raise self.fail
        for c in self.chunks:
            yield c

    def with_structured_output(self, schema):
        return _Model(f"{self.name}:{schema}", self.fail)


LIMITED = RateLimitError("Error code: 429 - rate_limit_exceeded")


def test_keys_are_split_deduplicated_and_placeholders_dropped():
    assert parse_keys("k1", "k2, k1 ,, your_key", "") == ["k1", "k2"]


def test_rate_limit_is_recognized_by_type_or_message():
    assert is_rate_limited(LIMITED)
    assert is_rate_limited(RuntimeError("429 RESOURCE_EXHAUSTED"))
    assert not is_rate_limited(ValueError("bad request"))


def test_rate_limited_key_hands_over_and_the_next_key_stays_current():
    first, second = _Model("k1", LIMITED), _Model("k2")
    llm = KeyRotatingLLM([first, second])
    assert asyncio.run(llm.ainvoke("hi")) == "k2"
    assert llm.invoke("hi") == "k2"
    assert first.calls == 1  # not retried once the second key worked


def test_other_errors_are_not_swallowed():
    llm = KeyRotatingLLM([_Model("k1", ValueError("bad")), _Model("k2")])
    with pytest.raises(ValueError):
        llm.invoke("hi")


def test_every_key_limited_raises_the_rate_limit():
    llm = KeyRotatingLLM([_Model("k1", LIMITED), _Model("k2", LIMITED)])
    with pytest.raises(RateLimitError):
        asyncio.run(llm.ainvoke("hi"))


def test_stream_switches_key_before_the_first_chunk():
    llm = KeyRotatingLLM([_Model("k1", LIMITED), _Model("k2", chunks=("x", "y"))])

    async def collect():
        return [c async for c in llm.astream("hi")]

    assert asyncio.run(collect()) == ["x", "y"]


def test_structured_output_rotates_and_shares_the_current_key():
    llm = KeyRotatingLLM([_Model("k1", LIMITED), _Model("k2")])
    assert llm.with_structured_output("S").invoke("hi") == "k2:S"
    assert llm.invoke("hi") == "k2"


def test_first_model_is_tried_again_after_a_while(monkeypatch):
    import rag_service.llm_keys as keys

    first, second = _Model("k1", LIMITED), _Model("k2")
    llm = KeyRotatingLLM([first, second])
    clock = [1000.0]
    monkeypatch.setattr(keys.time, "monotonic", lambda: clock[0])
    assert llm.invoke("hi") == "k2"
    first.fail = None  # its limit reset
    assert llm.invoke("hi") == "k2"  # still on the second within the window
    clock[0] += keys.RETRY_FIRST_AFTER + 1
    assert llm.invoke("hi") == "k1"


def test_fallback_provider_is_appended_after_the_primary_keys(monkeypatch):
    from rag_service.domains.roadmap import agent

    monkeypatch.setattr(agent.settings, "llm_fallback_provider", "google_genai")
    monkeypatch.setitem(agent._PROVIDERS, "google_genai", lambda model="": _Model(f"gemini:{model}"))
    llm = agent.with_fallback_provider(KeyRotatingLLM([_Model("g1", LIMITED), _Model("g2", LIMITED)]), "groq")
    assert llm.invoke("hi") == f"gemini:{agent.settings.llm_fallback_model}"


def test_no_fallback_when_unset_or_same_provider(monkeypatch):
    from rag_service.domains.roadmap import agent

    primary = _Model("g1")
    monkeypatch.setattr(agent.settings, "llm_fallback_provider", "")
    assert agent.with_fallback_provider(primary, "groq") is primary
    monkeypatch.setattr(agent.settings, "llm_fallback_provider", "groq")
    assert agent.with_fallback_provider(primary, "groq") is primary


def test_structured_call_is_tried_again_when_the_model_skipped_the_tool():
    from rag_service.llm_keys import invoke_structured

    class _Llm:
        def __init__(self, errors):
            self.errors, self.calls = list(errors), 0

        def with_structured_output(self, schema):
            return self

        async def ainvoke(self, prompt):
            self.calls += 1
            if self.errors:
                raise self.errors.pop(0)
            return "verdict"

    skipped = RuntimeError("Tool choice is required, but model did not call a tool")
    llm = _Llm([skipped])
    assert asyncio.run(invoke_structured(llm, dict, "p")) == "verdict" and llm.calls == 2
    limited = _Llm([LIMITED])
    with pytest.raises(RateLimitError):  # a rate limit is not retried here: the key rotation handles it
        asyncio.run(invoke_structured(limited, dict, "p"))
    assert limited.calls == 1
