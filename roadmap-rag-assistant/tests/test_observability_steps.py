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
