"""Section 2 — LLM Generation.

Streams the model output. Temperature and model are set when the chat model is built
(see DomainProfile.temperature); this module only drives the stream and keeps the merged
message for usage accounting.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator


class StreamResult:
    """Filled while `astream` runs; read after the loop ends."""

    def __init__(self) -> None:
        self.merged: Any = None

    @property
    def text(self) -> str:
        return getattr(self.merged, "content", "") or ""


async def astream(llm: Any, prompt: str, result: StreamResult) -> AsyncGenerator[str, None]:
    """Yield text deltas; exceptions propagate so the pipeline can trip the circuit breaker."""
    async for chunk in llm.astream(prompt):
        result.merged = chunk if result.merged is None else result.merged + chunk
        if getattr(chunk, "content", None):
            yield chunk.content
