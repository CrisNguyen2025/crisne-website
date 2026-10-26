"""LLM reranking: the model's order wins, and any failure keeps the search order."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from rag_service.core.retrieval.rerank import parse_order, rerank


def _matches(*ids: str):
    return [(SimpleNamespace(id=i, title=i), 1.0 / (n + 1)) for n, i in enumerate(ids)]


class _Llm:
    def __init__(self, reply: str = "", error: Exception | None = None) -> None:
        self.reply, self.error, self.prompts = reply, error, []

    async def ainvoke(self, prompt: str):
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        return SimpleNamespace(content=self.reply)


def _run(llm, matches):
    return [doc.id for doc, _ in asyncio.run(rerank(llm, "embedding là gì", matches, lambda d: d.title))]


def test_model_order_is_applied():
    assert _run(_Llm('["b", "a"]'), _matches("a", "b", "c")) == ["b", "a", "c"]


def test_ids_the_model_left_out_keep_their_place_after_the_named_ones():
    assert parse_order('["c"]', ["a", "b", "c"]) == ["c", "a", "b"]


def test_unknown_and_repeated_ids_are_ignored():
    assert parse_order('["x", "b", "b"]', ["a", "b"]) == ["b", "a"]


def test_reply_wrapped_in_prose_is_read():
    assert parse_order('Thứ tự: ["b", "a"] là hợp lý.', ["a", "b"]) == ["b", "a"]


def test_unreadable_reply_keeps_the_search_order():
    assert parse_order("không biết", ["a", "b"]) == ["a", "b"]
    assert parse_order('["a", ', ["a", "b"]) == ["a", "b"]


def test_model_error_keeps_the_search_order():
    assert _run(_Llm(error=RuntimeError("429")), _matches("a", "b")) == ["a", "b"]


def test_no_model_or_single_match_skips_the_call():
    llm = _Llm('["b", "a"]')
    assert _run(None, _matches("a", "b")) == ["a", "b"]
    assert _run(llm, _matches("a")) == ["a"]
    assert llm.prompts == []


def test_rerank_runs_only_when_the_order_is_uncertain(monkeypatch):
    from rag_service.domains.roadmap import agent

    monkeypatch.setattr(agent, "_rerank_gap", lambda: 0.03)
    monkeypatch.setattr(agent.rag_engine._vector_store, "_similarities", lambda q: {"a": 0.80, "b": 0.79, "c": 0.70})
    close = [(SimpleNamespace(id="a"), 1), (SimpleNamespace(id="b"), 1)]
    apart = [(SimpleNamespace(id="a"), 1), (SimpleNamespace(id="c"), 1)]
    assert agent._rerank_needed("q", close) and not agent._rerank_needed("q", apart)
