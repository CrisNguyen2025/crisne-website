"""WebMCP planner: picks one tool, filters destructive tools, validates args."""

import asyncio

from rag_service.webmcp_planner import plan_webmcp_call

TOOLS = [
    {"name": "list_roadmaps", "description": "List topics", "inputSchema": {"type": "object", "properties": {}}},
    {
        "name": "create_layer",
        "description": "Create layer",
        "inputSchema": {"type": "object", "properties": {"slug": {}, "title": {}, "shortTag": {}}},
    },
    {
        "name": "delete_layer",
        "description": "Delete layer",
        "inputSchema": {"type": "object", "properties": {"id": {}, "confirm": {}}},
    },
]


class FakeLLM:
    def __init__(self, text):
        self.text = text

    async def ainvoke(self, prompt):
        class R:
            content = self.text

        return R()


def run(llm, msg, tools=TOOLS):
    return asyncio.run(plan_webmcp_call(llm, msg, tools, None))


def test_valid_tool_and_args_are_returned():
    llm = FakeLLM('{"tool": "create_layer", "args": {"slug": "kkkk", "title": "K", "shortTag": "K", "junk": 1}, "reply": ""}')
    out = run(llm, "tạo layer K trong kkkk")
    assert out["tool"] == "create_layer"
    assert out["args"] == {"slug": "kkkk", "title": "K", "shortTag": "K"}


def test_unknown_tool_is_rejected():
    out = run(FakeLLM('{"tool": "drop_db", "args": {}, "reply": ""}'), "x")
    assert out["tool"] is None


def test_delete_tools_are_never_offered_or_chosen():
    out = run(FakeLLM('{"tool": "delete_layer", "args": {"id": "1"}, "reply": ""}'), "xoá layer 1")
    assert out["tool"] is None


def test_out_of_scope_is_refused_without_llm_call():
    out = run(None, "thời tiết hôm nay thế nào?")
    assert out["tool"] is None and out["reply"].startswith("Xin lỗi")


def test_unparseable_output_asks_again():
    out = run(FakeLLM("không phải json"), "xem lộ trình")
    assert out["tool"] is None and "diễn đạt lại" in out["reply"]
