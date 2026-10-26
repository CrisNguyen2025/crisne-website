"""Roadmap Assistant Python SDK Client.

Usage:
    from roadmap_sdk import RoadmapAssistantClient

    client = RoadmapAssistantClient(base_url="http://localhost:8000")
    response = client.chat("tạo cho tôi 3 topic A, B và C")
    print(response.message)
    for tc in response.tool_calls:
        print(f"  🔧 {tc.name} → {tc.result}")
"""

from __future__ import annotations

import uuid

import httpx

from roadmap_sdk.types import ChatResponse


class RoadmapAssistantClient:
    """Synchronous client for the Roadmap RAG Assistant API."""

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 120.0,
    ) -> None:
        self._client = httpx.Client(base_url=base_url, timeout=timeout)
        # One conversation per client unless the caller names one: the service refuses a shared "default"
        self.thread_id = uuid.uuid4().hex

    def chat(
        self,
        message: str,
        thread_id: str | None = None,
    ) -> ChatResponse:
        """Send a natural language prompt to the assistant.

        Args:
            message: The user's prompt (e.g. "tạo cho tôi 3 topic A, B và C").
            thread_id: Conversation thread for memory continuity.

        Returns:
            ChatResponse with the agent's message and executed tool calls.
        """
        resp = self._client.post(
            "/chat",
            json={"message": message, "thread_id": thread_id or self.thread_id},
        )
        resp.raise_for_status()
        return ChatResponse.from_dict(resp.json())

    def health(self) -> dict:
        """Check the health of the RAG service."""
        resp = self._client.get("/health")
        resp.raise_for_status()
        return resp.json()

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> RoadmapAssistantClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()
