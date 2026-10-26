"""LLM budget and validity for evals that call a live model (holdout --llm, confuse --llm).

Two failure modes made earlier runs misleading: a run spent the whole day's quota, and a run kept going
while every System 2 call was rate limited, so its numbers measured the offline fallback, not the model.

- BudgetedLLM stops calling the model after `max_calls` (the calls left count as unavailable)
- validity(): a run where more than MAX_UNAVAILABLE of the System 2 / router calls failed is INVALID
"""

from __future__ import annotations

from typing import Any

# More failed model calls than this share and the run measured the fallback, not the model
MAX_UNAVAILABLE = 0.10

UNAVAILABLE_MARKS = ("system 2 unavailable", "rate_limited", "llm_error")


class BudgetExceeded(RuntimeError):
    pass


class BudgetedLLM:
    def __init__(self, llm: Any, max_calls: int) -> None:
        self._llm = llm
        self.max_calls = max_calls
        self.calls = 0

    def _spend(self) -> None:
        if self.calls >= self.max_calls:
            raise BudgetExceeded(f"eval LLM budget of {self.max_calls} calls spent")
        self.calls += 1

    def with_structured_output(self, schema: Any) -> Any:
        inner = self._llm.with_structured_output(schema)
        budget = self

        class _Bound:
            async def ainvoke(self, prompt: Any) -> Any:
                budget._spend()
                return await inner.ainvoke(prompt)

        return _Bound()

    async def ainvoke(self, prompt: Any) -> Any:
        self._spend()
        return await self._llm.ainvoke(prompt)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._llm, name)


def is_unavailable(why: str) -> bool:
    return any(mark in why for mark in UNAVAILABLE_MARKS)


def validity(model_turns: int, unavailable: int) -> str:
    """"valid", or "INVALID: …" when too many model calls failed for the numbers to mean anything."""
    if model_turns == 0:
        return "valid (no model call was needed)"
    share = unavailable / model_turns
    if share > MAX_UNAVAILABLE:
        return f"INVALID: {unavailable}/{model_turns} model calls failed ({share:.0%} > {MAX_UNAVAILABLE:.0%})"
    return f"valid ({unavailable}/{model_turns} model calls failed)"
