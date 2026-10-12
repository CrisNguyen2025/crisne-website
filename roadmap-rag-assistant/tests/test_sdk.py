"""Tests for the Roadmap Assistant Python SDK."""

from __future__ import annotations

import httpx
import pytest

from roadmap_sdk.client import RoadmapAssistantClient
from roadmap_sdk.types import ChatResponse, ToolCallResult


def test_tool_call_result_dataclass():
    tc = ToolCallResult(name="create_topic", args={"title": "AI"}, result="✅ OK")
    assert tc.name == "create_topic"
    assert tc.args["title"] == "AI"
    assert "✅" in tc.result


def test_chat_response_from_dict():
    raw = {
        "message": "Đã tạo 3 topic thành công.",
        "tool_calls": [
            {
                "name": "create_topics_batch",
                "args": {"topics": [{"title": "A"}, {"title": "B"}]},
                "result": "✅ Đã tạo 2 topic: A, B",
            }
        ],
    }
    resp = ChatResponse.from_dict(raw)
    assert resp.message == "Đã tạo 3 topic thành công."
    assert len(resp.tool_calls) == 1
    assert resp.tool_calls[0].name == "create_topics_batch"
    assert "✅" in resp.tool_calls[0].result


def test_sdk_client_context_manager():
    with RoadmapAssistantClient(base_url="http://localhost:8000") as client:
        assert client._client is not None
        assert str(client._client.base_url).rstrip("/") == "http://localhost:8000"


def test_sdk_client_chat_with_mock_transport():
    # Mock HTTP transport
    def handler(request: httpx.Request):
        if request.url.path == "/chat":
            return httpx.Response(
                200,
                json={
                    "message": "Chào bạn! Tôi đã tạo 3 topic: A, B, C.",
                    "tool_calls": [
                        {
                            "name": "create_topics_batch",
                            "args": {},
                            "result": "✅ Đã tạo 3 topic: A, B, C",
                        }
                    ],
                },
            )
        elif request.url.path == "/health":
            return httpx.Response(
                200,
                json={
                    "status": "ok",
                    "adapter_mode": "http",
                    "llm_model": "gemini-2.0-flash",
                    "tools_count": 17,
                },
            )
        return httpx.Response(404)

    client = RoadmapAssistantClient(base_url="http://mock-service")
    client._client = httpx.Client(
        transport=httpx.MockTransport(handler), base_url="http://mock-service"
    )

    resp = client.chat("tạo cho tôi 3 topic A, B và C")
    assert "Chào bạn!" in resp.message
    assert len(resp.tool_calls) == 1
    assert resp.tool_calls[0].name == "create_topics_batch"

    health = client.health()
    assert health["status"] == "ok"
    assert health["tools_count"] == 17
    client.close()
