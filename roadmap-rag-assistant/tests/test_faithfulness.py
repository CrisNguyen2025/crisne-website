"""Semantic grounding check: unsupported claims are read from the model; any failure skips the check."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from rag_service.core.generation.faithfulness import parse_claims, unsupported_claims


class _Llm:
    def __init__(self, reply: str = "", error: Exception | None = None) -> None:
        self.reply, self.error, self.calls = reply, error, 0

    async def ainvoke(self, prompt: str):
        self.calls += 1
        if self.error:
            raise self.error
        return SimpleNamespace(content=self.reply)


def _check(llm, answer="RAG dùng BM25.", context="RAG kết hợp retrieval và generation."):
    return asyncio.run(unsupported_claims(llm, answer, context, "RAG là gì"))


def test_claims_are_read_from_the_reply():
    assert _check(_Llm('{"unsupported": ["RAG dùng BM25"]}')) == ["RAG dùng BM25"]


def test_empty_list_means_every_claim_is_supported():
    assert _check(_Llm('{"unsupported": []}')) == []


def test_reply_wrapped_in_prose_or_fences_is_read():
    assert parse_claims('```json\n{"unsupported": ["x"]}\n```') == ["x"]


def test_unreadable_reply_skips_the_check():
    assert parse_claims("mọi thứ đều ổn") is None
    assert parse_claims('{"unsupported": "x"}') is None
    assert parse_claims('{"unsupported": [') is None


def test_model_error_skips_the_check():
    assert _check(_Llm(error=RuntimeError("429"))) is None


def test_no_model_answer_or_context_skips_the_call():
    llm = _Llm('{"unsupported": ["x"]}')
    assert _check(None) is None
    assert _check(llm, answer="  ") is None
    assert _check(llm, context="") is None
    assert llm.calls == 0


def test_claims_are_capped():
    reply = '{"unsupported": [' + ", ".join(f'"c{i}"' for i in range(9)) + "]}"
    assert len(parse_claims(reply)) == 5
