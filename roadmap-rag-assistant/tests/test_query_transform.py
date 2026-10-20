"""Query transformation: plan parsing, merged retrieval, and the answer flow that uses them."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from rag_service.core.augmentation.history import Turn
from rag_service.core.orchestration.sources import SourceDeps, answer_from_sources
from rag_service.core.retrieval.transform import (
    QueryPlan,
    build_prompt,
    is_compound,
    merge_ranked,
    parse_plan,
    plan_queries,
)


class FakeLLM:
    def __init__(self, reply: str = "", error: Exception | None = None) -> None:
        self.reply, self.error, self.prompts = reply, error, []

    async def ainvoke(self, prompt: str):
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        return SimpleNamespace(content=self.reply)


def _doc(id_: str, title: str = "") -> SimpleNamespace:
    return SimpleNamespace(id=id_, title=title or id_)


def test_parse_keeps_rewrite_and_variants_and_drops_duplicates():
    plan = parse_plan('{"rewrite": "Chunking Strategy là gì", "variants": ["cắt chunk", "Chunking Strategy là gì"], "parts": []}', "bài đó là gì")
    assert plan.rewritten is True
    assert plan.queries() == ["bài đó là gì", "Chunking Strategy là gì", "cắt chunk"]


def test_unusable_output_keeps_the_question():
    for text in ("", "không phải json", "[1, 2]", '{"rewrite": 3}'):
        plan = parse_plan(text, "Hybrid Search là gì?")
        assert plan.queries() == ["Hybrid Search là gì?"] and not plan.rewritten


def test_parts_only_for_compound_questions():
    text = '{"rewrite": "", "variants": [], "parts": ["Hybrid Search", "Sparse vs. Dense Retrieval"]}'
    assert parse_plan(text, "So sánh Hybrid Search và Sparse vs. Dense Retrieval").parts
    assert parse_plan(text, "Hybrid Search là gì?").parts == ()
    assert is_compound("so sánh A với B") and not is_compound("Hybrid Search là gì?")


def test_prompt_contains_history_and_question():
    prompt = build_prompt("bài đó dạy gì?", [Turn("user", "Cho tôi xem Hybrid Search"), Turn("assistant", "Đây là bài...")])
    assert "Cho tôi xem Hybrid Search" in prompt and "<question>bài đó dạy gì?</question>" in prompt


HISTORY = [Turn("user", "Bài Hybrid Search là gì?"), Turn("assistant", "Hybrid Search kết hợp BM25 và vector.")]


def test_plan_falls_back_when_llm_fails_or_is_missing():
    assert asyncio.run(plan_queries("bài đó là gì", HISTORY, None)).queries() == ["bài đó là gì"]
    failing = FakeLLM(error=RuntimeError("boom"))
    assert asyncio.run(plan_queries("bài đó là gì", HISTORY, failing)).queries() == ["bài đó là gì"]
    llm = FakeLLM('{"rewrite": "Hybrid Search là gì", "variants": [], "parts": []}')
    assert asyncio.run(plan_queries("bài đó là gì", HISTORY, llm)).queries() == ["bài đó là gì", "Hybrid Search là gì"]


def test_only_a_reference_to_the_conversation_calls_the_llm():
    llm = FakeLLM('{"rewrite": "x", "variants": ["y"], "parts": []}')
    assert asyncio.run(plan_queries("Hybrid Search là gì?", HISTORY, llm)).queries() == ["Hybrid Search là gì?"]
    assert asyncio.run(plan_queries("bài đó là gì", [], llm)).queries() == ["bài đó là gì"]
    assert llm.prompts == []
    asyncio.run(plan_queries("bài đó là gì", HISTORY, llm))
    assert len(llm.prompts) == 1


def test_merge_ranked_fuses_by_id_and_keeps_order():
    a, b, c = _doc("a"), _doc("b"), _doc("c")
    merged = merge_ranked([[(a, 1.0), (b, 0.5)], [(b, 0.9), (c, 0.2)]], limit=3)
    ids = [doc.id for doc, _ in merged]
    assert ids[0] == "b" and set(ids) == {"a", "b", "c"} and len(ids) == len(set(ids))


def _deps(search, plan=None, accept=None):
    return SourceDeps(
        search=search,
        format_context=lambda matches: "ctx",
        href_of=lambda doc: "",
        item_fields=lambda doc: {},
        trace_fields=lambda doc: {},
        no_match_reply=lambda owner: "NO MATCH",
        retrieval_error_reply="ERR",
        pipeline=SimpleNamespace(available=lambda llm: False),
        plan=plan,
        accept=accept,
    )


async def _collect(deps, query, llm=None):
    return [ev async for ev in answer_from_sources(query=query, session_id="s", owner=False, delay=0, llm=llm, deps=deps)]


def test_answer_flow_searches_every_planned_query_and_checks_the_original():
    searched = []

    async def search(query, limit=4):
        searched.append(query)
        return [(_doc("hybrid", "Hybrid Search"), 0.5)] if "hybrid" in query.lower() else []

    async def plan(llm, query, session_id):
        return QueryPlan(query=query, rewritten=True, variants=("hybrid retrieval",))

    seen = {}

    def accept(query, matches):
        seen["query"] = query
        return matches

    events = asyncio.run(_collect(_deps(search, plan, accept), "bài đó là gì"))
    assert searched == ["bài đó là gì", "hybrid retrieval"]
    assert seen["query"] == "bài đó là gì hybrid retrieval"
    assert any(e.get("type") == "tool_end" and "Tìm thấy 1" in e.get("result", "") for e in events)


def test_answer_flow_without_plan_searches_once_as_before():
    searched = []

    async def search(query, limit=4):
        searched.append(query)
        return []

    events = asyncio.run(_collect(_deps(search), "Kubernetes là gì?"))
    assert searched == ["Kubernetes là gì?"]
    text = "".join(e.get("delta", "") for e in events if e.get("type") == "token")
    assert "NO MATCH" in text


def test_list_content_from_a_provider_is_read_as_text():
    llm = FakeLLM()
    llm.reply = [{"type": "text", "text": '{"rewrite": "Hybrid Search là gì", "variants": [], "parts": []}'}]
    assert asyncio.run(plan_queries("bài đó là gì", HISTORY, llm)).rewritten
