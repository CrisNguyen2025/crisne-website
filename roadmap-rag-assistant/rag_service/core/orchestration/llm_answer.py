"""Core LLM answer for a message that needs no retrieval (chitchat): the generation pipeline, or a
reason for the caller to use its own template.

The caller passes `outcome`; it is set to handled=True when the pipeline answered, and llm_failed
carries the reason when the call failed (the caller then answers from its template).
"""

from __future__ import annotations

from typing import Any, AsyncGenerator

from rag_service.core.augmentation.context import GenerationRequest
from rag_service.core.generation.pipeline import GenerationFailed


async def answer_with_llm(
    *, llm: Any, pipeline: Any, mode: str, query: str, session_id: str, outcome: dict
) -> AsyncGenerator[dict, None]:
    outcome.setdefault("handled", False)
    outcome.setdefault("llm_failed", False)
    if not pipeline.available(llm):
        return
    try:
        async for ev in pipeline.astream(llm, GenerationRequest(mode=mode, query=query, thread_id=session_id)):
            yield ev
        outcome["handled"] = True
    except GenerationFailed as exc:
        outcome["llm_failed"] = exc.reason
