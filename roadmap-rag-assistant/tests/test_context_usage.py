"""`event: context`: token counts per part of the prompt, never its text."""

from __future__ import annotations

import asyncio
import uuid

from rag_service.context_usage import DEFAULT_WINDOW, build_context_usage, context_window, estimate_tokens
from rag_service.core.augmentation.context import GenerationRequest, build_prompt
from rag_service.core.generation.delivery import record_turn
from rag_service.domains.roadmap.pipeline import generation_pipeline
from rag_service.domains.roadmap.profile import PROFILE
from tests.test_generation_pipeline import DOC, RecordingLLM


def _prompt(thread: str, mode: str = "rag") -> str:
    sources = [(DOC, 0.9)] if mode == "rag" else []
    return build_prompt(GenerationRequest(mode=mode, query="docker là gì?", thread_id=thread, sources=sources), PROFILE)


def test_estimate_tokens_rounds_up_and_empty_is_zero():
    assert estimate_tokens("") == 0
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("abcde") == 2


def test_parts_come_in_fixed_order_and_cover_the_prompt():
    thread = f"t-{uuid.uuid4()}"
    record_turn(thread, "tôi là Cris", "chào Cris")
    prompt = _prompt(thread)

    usage = build_context_usage(prompt, model="m")

    assert [p["key"] for p in usage["parts"]] == ["system", "history", "retrieved", "message"]
    assert all(p["tokens"] > 0 for p in usage["parts"])
    assert usage["parts"][1]["count"] == 2 and usage["parts"][2]["count"] == 1
    # The split loses nothing: the parts add up to (about) the whole prompt
    assert abs(sum(p["tokens"] for p in usage["parts"]) - estimate_tokens(prompt)) <= len(usage["parts"])
    assert usage["window"] == DEFAULT_WINDOW


def test_empty_parts_stay_with_zero_tokens():
    usage = build_context_usage(_prompt(f"t-{uuid.uuid4()}", mode="chitchat"), model="m")

    by_key = {p["key"]: p["tokens"] for p in usage["parts"]}
    assert by_key["history"] == 0 and by_key["retrieved"] == 0
    assert by_key["system"] > 0 and by_key["message"] > 0


def test_measured_usage_wins_over_the_estimate():
    prompt = _prompt(f"t-{uuid.uuid4()}")

    measured = build_context_usage(prompt, model="m", usage={"input": 1234, "output": 56})
    estimated = build_context_usage(prompt, model="m")

    assert measured["measured"] is True and measured["input_tokens"] == 1234 and measured["output_tokens"] == 56
    assert estimated["measured"] is False
    assert estimated["input_tokens"] == sum(p["tokens"] for p in estimated["parts"])


def test_payload_carries_numbers_and_labels_only():
    thread = f"t-{uuid.uuid4()}"
    record_turn(thread, "mã bí mật 12345", "ok")

    payload = str(build_context_usage(_prompt(thread), model="m"))

    assert "12345" not in payload and "Docker" not in payload


def test_pipeline_sends_one_context_event_before_metadata():
    async def run():
        req = GenerationRequest(mode="rag", query="docker là gì?", thread_id=f"t-{uuid.uuid4()}", sources=[(DOC, 0.9)])
        return [ev async for ev in generation_pipeline.astream(RecordingLLM("Docker là container."), req)]

    events = asyncio.run(run())

    kinds = [e["type"] for e in events]
    assert kinds.count("context") == 1
    assert kinds.index("context") == len(kinds) - 2 and kinds[-1] == "metadata"


def test_window_follows_the_model_and_unknown_models_get_the_default():
    assert context_window("openai/gpt-oss-120b") == 131_072
    assert context_window("gemini-flash-latest") == 1_000_000
    assert context_window("something-new") == DEFAULT_WINDOW
