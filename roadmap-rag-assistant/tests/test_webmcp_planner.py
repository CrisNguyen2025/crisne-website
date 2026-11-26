"""WebMCP planner: read-only allowlist, actor isolation, schema arg validation."""

from __future__ import annotations

import asyncio
from typing import Iterator

import pytest

from rag_service.auth import OWNER_ONLY_MESSAGE, set_actor
from rag_service.webmcp_planner import (
    READ_ONLY_WEBMCP_TOOLS,
    WEBMCP_WRITE_REDIRECT_REPLY,
    _allowed_tools,
    plan_webmcp_call,
)

TOOLS = [
    {"name": "get_current_context", "description": "Context", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "list_roadmaps", "description": "List topics", "inputSchema": {"type": "object", "properties": {}}},
    {
        "name": "get_roadmap",
        "description": "Get topic",
        "inputSchema": {"type": "object", "properties": {"slug": {"type": "string"}}},
    },
    {"name": "export_roadmaps", "description": "Export", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "create_roadmap", "description": "Create topic", "inputSchema": {"type": "object", "properties": {"title": {}}}},
    {"name": "create_item", "description": "Create lesson", "inputSchema": {"type": "object", "properties": {"title": {}}}},
    {"name": "update_item", "description": "Update lesson", "inputSchema": {"type": "object", "properties": {"id": {}}}},
    {"name": "update_item_content", "description": "Update content", "inputSchema": {"type": "object", "properties": {"id": {}}}},
    {"name": "rename_section", "description": "Rename section", "inputSchema": {"type": "object", "properties": {"slug": {}}}},
    {"name": "reorder_items", "description": "Reorder", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "delete_item", "description": "Delete lesson", "inputSchema": {"type": "object", "properties": {"id": {}, "confirm": {}}}},
    {"name": "delete_roadmap", "description": "Delete topic", "inputSchema": {"type": "object", "properties": {"slug": {}, "confirm": {}}}},
]


@pytest.fixture(autouse=True)
def _reset_actor() -> Iterator[None]:
    set_actor("visitor")
    try:
        yield
    finally:
        set_actor("visitor")


class FakeLLM:
    def __init__(self, text: str) -> None:
        self.text = text
        self.called = False

    async def ainvoke(self, prompt: str):
        self.called = True

        class R:
            content = self.text

        return R()


def run(llm, msg: str, tools=TOOLS) -> dict:
    return asyncio.run(plan_webmcp_call(llm, msg, tools, None))


def test_allowed_tools_keeps_only_read_only_tools():
    allowed_names = {t["name"] for t in _allowed_tools(TOOLS)}
    assert allowed_names == READ_ONLY_WEBMCP_TOOLS


def test_valid_read_only_tool_and_args_are_returned():
    set_actor("owner")
    llm = FakeLLM('{"tool": "get_roadmap", "args": {"slug": "nextjs", "junk": 1}, "reply": "Đây là topic Next.js"}')
    out = run(llm, "xem topic nextjs")
    assert out["tool"] == "get_roadmap"
    assert out["args"] == {"slug": "nextjs"}


def test_unknown_tool_is_rejected():
    set_actor("owner")
    out = run(FakeLLM('{"tool": "drop_db", "args": {}, "reply": ""}'), "xem lộ trình")
    assert out["tool"] is None


def test_write_and_delete_tools_are_never_offered_or_chosen():
    set_actor("owner")
    for bad_tool in ("create_roadmap", "update_item_content", "rename_section", "reorder_items", "delete_item"):
        llm = FakeLLM(f'{{"tool": "{bad_tool}", "args": {{"id": "1"}}, "reply": ""}}')
        out = run(llm, "kiểm tra giúp tôi")
        assert out["tool"] is None
        assert out["reply"] == WEBMCP_WRITE_REDIRECT_REPLY


def test_owner_cud_request_redirects_to_preview_flow_without_llm_call():
    set_actor("owner")
    llm = FakeLLM('{"tool": "list_roadmaps", "args": {}, "reply": ""}')
    out = run(llm, "tạo topic Backend mới")
    assert llm.called is False
    assert out["tool"] is None
    assert "Preview" in out["reply"] and "ok" in out["reply"]


def test_visitor_cannot_plan_write_tools():
    set_actor("visitor")
    llm = FakeLLM('{"tool": "create_item", "args": {"title": "Hack"}, "reply": ""}')
    out = run(llm, "tạo bài Hack")
    assert llm.called is False
    assert out["tool"] is None
    assert out["reply"] == OWNER_ONLY_MESSAGE

    sneaky_llm = FakeLLM('{"tool": "create_item", "args": {"title": "Hack"}, "reply": ""}')
    out2 = run(sneaky_llm, "xem lộ trình")
    assert out2["tool"] is None
    assert out2["reply"] == OWNER_ONLY_MESSAGE


def test_out_of_scope_is_refused_without_llm_call():
    out = run(None, "thời tiết hôm nay thế nào?")
    assert out["tool"] is None and out["reply"].startswith("Xin lỗi")


def test_unparseable_output_asks_again():
    out = run(FakeLLM("không phải json"), "xem lộ trình")
    assert out["tool"] is None and "diễn đạt lại" in out["reply"]
