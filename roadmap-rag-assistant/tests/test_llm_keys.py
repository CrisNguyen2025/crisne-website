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
