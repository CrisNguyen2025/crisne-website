"""Steps a stream leaves through an exception are still ended (and so exported to Langfuse)."""

from __future__ import annotations

import asyncio
import uuid

import pytest
from langchain_core.messages import AIMessageChunk

from rag_service import observability
from rag_service.core.augmentation.context import GenerationRequest
from rag_service.domains.roadmap.pipeline import generation_pipeline
from rag_service.observability import end_step_on_error, traced_turn
from rag_service.steps import step_event


class FakeObservation:
    trace_id = "0123456789abcdef0123456789abcdef"

    def __init__(self, registry: list, name: str = "root", as_type: str = "agent") -> None:
        self.registry = registry
        self.name, self.as_type = name, as_type
        self.updates: dict = {}
        self.ended = False
        registry.append(self)

    def start_observation(self, *, name: str, as_type: str = "span", **kwargs):
        return FakeObservation(self.registry, name, as_type)

    def update(self, **kwargs):
        self.updates.update(kwargs)

    def end(self):
        self.ended = True


class FakeLangfuse:
    def __init__(self) -> None:
        self.observations: list[FakeObservation] = []

    def start_observation(self, **kwargs):
        return FakeObservation(self.observations)


class HangingLLM:
    """Streams one word, then waits forever: the client disconnects while it waits."""

    def __init__(self) -> None:
        self.waiting = asyncio.Event()

    async def astream(self, prompt):
        yield AIMessageChunk(content="Docker ")
        self.waiting.set()
        await asyncio.Event().wait()


def test_generation_step_ends_with_partial_output_when_the_client_disconnects(monkeypatch):
    langfuse = FakeLangfuse()
    monkeypatch.setattr(observability, "get_langfuse", lambda: langfuse)
    req = GenerationRequest(mode="chitchat", query="docker?", thread_id=f"t-{uuid.uuid4()}")

    async def run():
        llm = HangingLLM()

        async def consume():
            async for _ in traced_turn(generation_pipeline.astream(llm, req), message="docker?", session_id="s"):
                pass

        task = asyncio.create_task(consume())
        # The first word is in; the PII filter may still hold it back from the client
        await asyncio.wait_for(llm.waiting.wait(), timeout=5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())

    generation = next(o for o in langfuse.observations if o.as_type == "generation")
    assert generation.ended
    assert generation.updates["level"] == "WARNING"
    assert generation.updates["status_message"] == "stream cancelled by client"
    assert generation.updates["output"].startswith("Docker")
    # The turn itself is ended too, and nothing is left open
    assert all(o.ended for o in langfuse.observations)


@pytest.mark.parametrize(
    "exc, level",
    [(asyncio.CancelledError(), "WARNING"), (GeneratorExit(), "WARNING"), (RuntimeError("index down"), "ERROR")],
)
def test_end_step_on_error_tells_a_disconnect_from_a_failure(exc, level):
    obs = FakeObservation([], "retrieve", "retriever")
    end_step_on_error(obs, exc)
    assert obs.ended and obs.updates["level"] == level


def test_end_step_on_error_ignores_a_missing_step():
    end_step_on_error(None, RuntimeError("x"))  # tracing off: nothing to end


def test_tracing_turns_on_once_the_keys_are_loaded(monkeypatch, capsys):
    import langfuse

    created = []
    monkeypatch.setattr(langfuse, "Langfuse", lambda **kwargs: created.append(kwargs) or "client")
    for name, value in (("_client", None), ("_client_ready", False), ("_warned_missing_keys", False)):
        monkeypatch.setattr(observability, name, value)
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)

    # Called before .env is loaded: off for now, warned once
    assert observability.get_langfuse() is None
    assert observability.get_langfuse() is None
    assert capsys.readouterr().out.count("tracing disabled") == 1

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    assert observability.get_langfuse() == "client"
    assert observability.get_langfuse() == "client" and len(created) == 1


def test_usage_from_langchain_includes_cache_read_tokens():
    msg_with_cache = type("Msg", (), {
        "usage_metadata": {
            "input_tokens": 100,
            "output_tokens": 20,
            "total_tokens": 120,
            "input_token_details": {"cache_read": 80},
        }
    })()
    assert observability.usage_from_langchain(msg_with_cache) == {
        "input": 100,
        "output": 20,
        "total": 120,
        "cache_read_input_tokens": 80,
    }

    msg_plain = type("Msg", (), {"usage_metadata": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}})()
    assert observability.usage_from_langchain(msg_plain) == {"input": 10, "output": 5, "total": 15}


def test_traced_turn_records_answer_mode_and_gate_dropped(monkeypatch):
    langfuse = FakeLangfuse()
    monkeypatch.setattr(observability, "get_langfuse", lambda: langfuse)

    async def events():
        yield step_event("retrieve", "retrieval", "done", count=1, before_gate=4)
        yield step_event("answer", "generation", "done", mode="no_match")
        yield {"type": "token", "delta": "Chưa tìm thấy."}

    async def run():
        return [ev async for ev in traced_turn(events(), message="q", session_id="s")]

    asyncio.run(run())
    root = langfuse.observations[0]
    assert root.updates["metadata"]["answer_mode"] == "no_match"
    assert root.updates["metadata"]["gate_dropped"] == 3


def test_concept_promotion_proposal_and_draft_emit_trace_spans(monkeypatch, mock_adapter):
    from rag_service.auth import set_actor
    from rag_service.domains.roadmap.agent import NextGenRoadmapAgent
    from rag_service.state import session_store

    langfuse = FakeLangfuse()
    monkeypatch.setattr(observability, "get_langfuse", lambda: langfuse)
    mock_adapter.get_topic.return_value = {
        "id": "t-fe",
        "slug": "frontend",
        "title": "Frontend",
        "description": "Frontend roadmap",
        "items": [],
        "sections": ["Core"],
    }

    class FakeDraftLLM:
        async def ainvoke(self, prompt):
            return type(
                "Msg",
                (),
                {
                    "content": "## Tổng quan & Bài toán\n\nNội dung chuẩn về Speculative Decoding.\n\n## Cơ chế hoạt động\n\nChi tiết.",
                    "usage_metadata": {"input_tokens": 50, "output_tokens": 30, "total_tokens": 80},
                },
            )()

    async def run():
        set_actor("owner")
        agent = NextGenRoadmapAgent(llm_model=FakeDraftLLM())
        session_ctx = session_store.get_or_create(f"obs-promo-{uuid.uuid4()}")

        async def work():
            yield {"type": "step", "id": "work", "kind": "tool", "status": "running"}
            proposal, err = await agent.build_concept_promotion_proposal(
                concept="Speculative Decoding",
                preferred_topic_slug="frontend",
                source="domain_gap",
                session_ctx=session_ctx,
            )
            assert err is None and proposal is not None
            yield {"type": "token", "delta": "ok"}

        return [ev async for ev in traced_turn(work(), message="Speculative Decoding là gì", session_id=session_ctx.session_id)]

    asyncio.run(run())
    names = [o.name for o in langfuse.observations]
    assert "concept-promotion-proposal" in names
    assert "lesson-draft-generation" in names
    gen = next(o for o in langfuse.observations if o.name == "lesson-draft-generation")
    assert gen.as_type == "generation"
    assert gen.ended
    assert gen.updates["usage_details"] == {"input": 50, "output": 30, "total": 80}
    proposal_span = next(o for o in langfuse.observations if o.name == "concept-promotion-proposal")
    assert proposal_span.ended


def test_turn_emits_thread_context_and_owner_memory_spans(monkeypatch):
    from rag_service.auth import set_actor
    from rag_service.domains.roadmap.agent import NextGenRoadmapAgent

    langfuse = FakeLangfuse()
    monkeypatch.setattr(observability, "get_langfuse", lambda: langfuse)

    async def run():
        set_actor("owner")
        agent = NextGenRoadmapAgent(llm_model=None)
        return [
            ev
            async for ev in agent.astream_events(
                {"messages": [{"role": "user", "content": "Docker là gì?"}], "fast": True},
                config={"configurable": {"thread_id": f"obs-ctx-{uuid.uuid4()}"}},
            )
        ]

    asyncio.run(run())
    names = [o.name for o in langfuse.observations]
    assert "load-thread-context" in names
    assert "load-owner-memory" in names
    assert all(o.ended for o in langfuse.observations if o.name in ("load-thread-context", "load-owner-memory"))
