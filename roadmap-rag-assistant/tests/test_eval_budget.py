"""Live-model evals stop at their budget and refuse to report numbers measured on the fallback."""

from __future__ import annotations

import asyncio

import pytest

from evals.router.budget import BudgetedLLM, BudgetExceeded, is_unavailable, validity
from evals.router.holdout import model_call_counts


class _Llm:
    def with_structured_output(self, schema):
        return self

    async def ainvoke(self, prompt):
        return "ok"


def test_budget_stops_after_max_calls():
    llm = BudgetedLLM(_Llm(), max_calls=2)

    async def call():
        return await llm.with_structured_output(dict).ainvoke("x")

    assert asyncio.run(call()) == "ok" and asyncio.run(call()) == "ok"
    with pytest.raises(BudgetExceeded):
        asyncio.run(call())


def test_run_with_mostly_failed_model_calls_is_invalid():
    assert validity(44, 41).startswith("INVALID")
    assert validity(44, 4).startswith("valid")
    assert validity(0, 0).startswith("valid")


def test_unavailable_model_calls_are_read_from_the_decisions():
    whys = [
        "heuristic row=search_word intent=knowledge_query gate=none",                     # no model needed
        "heuristic row=change_command intent=roadmap_cud gate=confirm plan=preview:system 2 unavailable",
        "rate_limited row=None intent=chitchat gate=none",
        "llm row=None intent=knowledge_query gate=none",
    ]
    assert model_call_counts(whys) == (3, 2)
    assert is_unavailable("llm_error row=None") and not is_unavailable("llm row=None")
