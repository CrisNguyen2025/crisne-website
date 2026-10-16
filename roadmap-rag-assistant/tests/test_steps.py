"""Step events (rag_service/steps.py): timing, tool mirroring, owner-only fields, SSE forwarding."""

from __future__ import annotations

import json

import httpx
import pytest

from rag_service.agent import NextGenRoadmapAgent, content_text
from rag_service.api.server import app
from rag_service.auth import set_actor
from rag_service.rag.ingestion import KnowledgeDocument
from rag_service.rag.rag_engine import rag_engine
from rag_service.steps import step_event, with_steps


@pytest.fixture(autouse=True)
def _reset_actor():
    yield
    set_actor("visitor")


async def _collect(events) -> list[dict]:
    return [ev async for ev in events]


async def _source(*events: dict, fail: bool = False):
    for ev in events:
        yield ev
    if fail:
        raise RuntimeError("boom")


def _steps(events: list[dict]) -> list[dict]:
    return [e for e in events if e.get("type") == "step"]


@pytest.mark.asyncio
async def test_tool_events_are_mirrored_as_timed_steps():
    set_actor("visitor")
    out = await _collect(with_steps(_source(
        {"type": "tool_start", "name": "list_topics", "args": {"q": "x"}},
        {"type": "tool_end", "name": "list_topics", "result": "3 topic"},
    )))
    # Legacy events are kept, each followed by its step
    assert [e["type"] for e in out] == ["tool_start", "step", "tool_end", "step"]
    running, done = _steps(out)
    assert running == {"type": "step", "id": "tool-1", "kind": "tool", "status": "running", "name": "list_topics"}
    assert done["status"] == "done" and done["result"] == "3 topic" and done["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_tool_args_are_owner_only():
    set_actor("owner")
    out = await _collect(with_steps(_source({"type": "tool_start", "name": "create_item", "args": {"parent": "l1"}})))
    assert _steps(out)[0]["args"] == {"parent": "l1"}


@pytest.mark.asyncio
async def test_explicit_retrieval_step_is_not_duplicated():
    out = await _collect(with_steps(_source(
        {"type": "tool_start", "name": "search_live_knowledge", "args": {}},
        step_event("retrieve", "retrieval", "running"),
        {"type": "tool_end", "name": "search_live_knowledge", "result": "1"},
        step_event("retrieve", "retrieval", "done", count=1),
    )))
    assert [(s["id"], s["status"]) for s in _steps(out)] == [("retrieve", "running"), ("retrieve", "done")]
    assert "duration_ms" in _steps(out)[1]


@pytest.mark.asyncio
async def test_running_steps_are_closed_as_error_when_the_turn_fails():
    out = []
    with pytest.raises(RuntimeError):
        async for ev in with_steps(_source(step_event("answer", "generation", "running"), fail=True)):
            out.append(ev)
    assert _steps(out)[-1]["id"] == "answer"
    assert _steps(out)[-1]["kind"] == "generation"
    assert _steps(out)[-1]["status"] == "error"


# ── Agent: knowledge query ────────────────────────────────────────────────


class _Chunk:
    def __init__(self, content: str) -> None:
        self.content = content

    def __add__(self, other: "_Chunk") -> "_Chunk":
        return _Chunk(self.content + other.content)


class _FakeLlm:
    def __init__(self, answer: str) -> None:
        self.answer = answer

    async def astream(self, prompt: str):
        for word in self.answer.split(" "):
            yield _Chunk(word + " ")


DOC = KnowledgeDocument(
    id="vdb", doc_type="item", title="Vector Database", topic_slug="ai", topic_title="AI",
    description="Lưu và tìm vector", searchable_text="Bài học Mục Item: Vector Database",
)


@pytest.fixture
def one_match(monkeypatch):
    async def fake_search(query: str, limit: int = 5):
        return [(DOC, 0.7123)]

    monkeypatch.setattr(rag_engine, "search_live_knowledge", fake_search)
    monkeypatch.setattr(rag_engine, "known_topic_slugs", lambda: {"ai"})


async def _ask(agent: NextGenRoadmapAgent, text: str) -> list[dict]:
    return await _collect(agent.astream_events(
        {"messages": [{"role": "user", "content": text}], "fast": True},
        config={"configurable": {"thread_id": f"steps-{text}"}},
    ))


@pytest.mark.asyncio
async def test_knowledge_query_steps_for_visitor(one_match):
    set_actor("visitor")
    steps = _steps(await _ask(NextGenRoadmapAgent(llm_model=None), "tìm bài học về vector database"))
    done = {s["id"]: s for s in steps if s["status"] != "running"}
    assert list(done) == ["route", "retrieve", "answer"]
    assert done["route"]["intent"] == "knowledge_query"
    assert done["retrieve"]["items"] == [
        {"title": "Vector Database", "type": "item", "topic": "ai", "href": "/?topic=ai"}
    ]  # no score for visitors
    assert done["answer"]["mode"] == "context"
    assert "fallback_reason" not in done["answer"]  # no LLM configured, not an LLM failure


@pytest.mark.asyncio
async def test_knowledge_query_steps_for_owner_include_scores_and_guard(one_match):
    set_actor("owner")
    llm = _FakeLlm("Có bài **Vector Database** trong **Frontend**, xem [đây](/?topic=fe).")
    steps = _steps(await _ask(NextGenRoadmapAgent(llm_model=llm), "tìm bài học về vector database"))
    done = {s["id"]: s for s in steps if s["status"] != "running"}
    assert list(done) == ["route", "retrieve", "answer", "guard"]
    assert done["retrieve"]["items"][0]["score"] == 0.7123
    assert done["answer"]["mode"] == "llm" and done["answer"]["duration_ms"] >= 0
    assert done["guard"]["grounding"] == "issues"
    assert done["guard"]["ungrounded_terms"] == ["Frontend"]
    assert done["guard"]["invalid_links"] == ["fe"]


class _PartsChunk:
    """A chunk shaped like newer Gemini output: content is a list of parts, not a string."""

    def __init__(self, content: list) -> None:
        self.content = content

    def __add__(self, other: "_PartsChunk") -> "_PartsChunk":
        return _PartsChunk(self.content + other.content)


class _FakePartsLlm:
    def __init__(self, answer: str) -> None:
        self.answer = answer

    async def astream(self, prompt: str):
        yield _PartsChunk([{"type": "thinking", "thinking": "người dùng chào"}])
        for word in self.answer.split(" "):
            yield _PartsChunk([{"type": "text", "text": word + " "}])


def _answer_text(events: list[dict]) -> str:
    deltas = [e["delta"] for e in events if e.get("type") == "token"]
    assert all(isinstance(d, str) for d in deltas)
    return "".join(deltas)


def test_content_text_reads_strings_and_text_parts():
    assert content_text(_Chunk("abc")) == "abc"
    parts = [{"type": "thinking", "thinking": "x"}, {"type": "text", "text": "Xin "}, "chào"]
    assert content_text(_PartsChunk(parts)) == "Xin chào"
    assert content_text(None) == ""


@pytest.mark.asyncio
async def test_chitchat_streams_text_when_llm_content_is_a_list():
    set_actor("visitor")
    events = await _ask(NextGenRoadmapAgent(llm_model=_FakePartsLlm("Chào bạn!")), "chào bạn")
    assert _answer_text(events).strip() == "Chào bạn!"
    done = {s["id"]: s for s in _steps(events) if s["status"] != "running"}
    assert done["answer"]["status"] == "done" and done["answer"]["mode"] == "llm"


@pytest.mark.asyncio
async def test_knowledge_answer_streams_text_when_llm_content_is_a_list(one_match):
    set_actor("visitor")
    llm = _FakePartsLlm("Có bài **Vector Database** trong lộ trình AI.")
    events = await _ask(NextGenRoadmapAgent(llm_model=llm), "tìm bài học về vector database")
    assert "Vector Database" in _answer_text(events)
    done = {s["id"]: s for s in _steps(events) if s["status"] != "running"}
    assert done["answer"]["mode"] == "llm"


@pytest.mark.asyncio
async def test_no_match_has_no_match_answer_step(monkeypatch):
    async def nothing(query: str, limit: int = 5):
        return []

    monkeypatch.setattr(rag_engine, "search_live_knowledge", nothing)
    set_actor("visitor")
    steps = _steps(await _ask(NextGenRoadmapAgent(llm_model=None), "tìm bài học về Docker"))
    done = {s["id"]: s for s in steps if s["status"] != "running"}
    assert done["retrieve"]["count"] == 0
    assert done["answer"]["mode"] == "no_match"


# ── SSE ───────────────────────────────────────────────────────────────────


def _sse_events(body: str) -> list[tuple[str, dict]]:
    events, name = [], None
    for line in body.splitlines():
        if line.startswith("event:"):
            name = line[6:].strip()
        elif line.startswith("data:"):
            events.append((name, json.loads(line[5:].strip())))
    return events


@pytest.mark.asyncio
async def test_sse_streams_steps_and_done_carries_their_final_state(mock_adapter, owner_headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=owner_headers) as client:
        resp = await client.post(
            "/chat/stream", json={"message": "tạo cho tôi 3 topic A, B và C", "thread_id": "test-steps"}
        )
    events = _sse_events(resp.text)
    streamed = [data for name, data in events if name == "step"]
    assert streamed and all("type" not in s for s in streamed)

    done = next(data for name, data in events if name == "done")
    tool = next(s for s in done["steps"] if s["kind"] == "tool")
    assert tool["name"] == "create_topics_batch"
    assert tool["status"] == "done"
    assert "args" in tool  # owner
    assert all(s["status"] != "running" for s in done["steps"])
