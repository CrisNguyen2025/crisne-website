"""Plan one read-only WebMCP tool call for a message. The browser executes the chosen tool.

The planner only chooses a read-only tool and arguments; it never runs anything itself.
Write tools stay strictly inside Abot's Preview -> ok confirmed chat flow (ADR-0019 / Q1 Option A).
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from rag_service.auth import OWNER_ONLY_MESSAGE, is_owner
from rag_service.domains.roadmap.router.grounding import OUT_OF_SCOPE_REPLY, RATE_LIMITED_REPLY, build_grounding
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType
from rag_service.llm_breaker import llm_breaker

_router = IntentRouter()

READ_ONLY_WEBMCP_TOOLS: frozenset[str] = frozenset(
    {"get_current_context", "list_roadmaps", "get_roadmap", "export_roadmaps"}
)
_WRITE_TOOL_PREFIXES = ("create_", "update_", "delete_", "rename_", "reorder_")

WEBMCP_WRITE_REDIRECT_REPLY = (
    "Chế độ `/webmcp` chỉ hỗ trợ đọc/tra cứu để đảm bảo an toàn dữ liệu. "
    "Để tạo, sửa hoặc xoá Topic/Section/Lesson, hãy nhắn trực tiếp trong khung chat Abot để đi qua luồng `Preview` -> `ok`."
)

PLAN_PROMPT = """Bạn chọn đúng MỘT tool chỉ đọc để tra cứu yêu cầu của người dùng về lộ trình học.
Chỉ trả về JSON hợp lệ, không thêm chữ nào khác, theo dạng:
{{"tool": "<tên tool hoặc null>", "args": {{...}}, "reply": "<câu trả lời ngắn cho người dùng>"}}

Quy tắc:
- Chỉ dùng tool chỉ đọc trong danh sách bên dưới. Mọi thao tác tạo, sửa, xoá bắt buộc đặt "tool": null và hướng dẫn dùng luồng Preview -> ok trong chat Abot.
- Chỉ dùng các tham số có trong schema của tool. Lấy id/slug từ ngữ cảnh trang nếu người dùng nói "này" hoặc "đây".
- Không bịa id. Nếu thiếu thông tin bắt buộc, đặt "tool": null và hỏi lại trong "reply".

{page_hint}
Danh sách tool chỉ đọc:
{tools_json}

Yêu cầu của người dùng:
"{message}"
"""


def _allowed_tools(tools: list[dict]) -> list[dict]:
    return [t for t in tools if str(t.get("name", "")) in READ_ONLY_WEBMCP_TOOLS]


def _parse_json(text: str) -> Optional[dict]:
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except ValueError:
        return None


def _is_write_tool_name(name: object) -> bool:
    return isinstance(name, str) and name.startswith(_WRITE_TOOL_PREFIXES)


def _write_denied_reply() -> str:
    return WEBMCP_WRITE_REDIRECT_REPLY if is_owner() else OWNER_ONLY_MESSAGE


def _preflight_reply(message: str, tools: list[dict], allowed: list[dict]) -> Optional[str]:
    intent = _router.classify_heuristics(message)
    if intent is not None and intent.intent == IntentType.OUT_OF_SCOPE:
        return OUT_OF_SCOPE_REPLY
    if intent is not None and intent.intent == IntentType.ROADMAP_CUD:
        return _write_denied_reply()
    if not allowed:
        if is_owner() and any(_is_write_tool_name(t.get("name")) for t in tools):
            return WEBMCP_WRITE_REDIRECT_REPLY
        return "Trang hiện không có tool đọc WebMCP phù hợp. Bạn có thể hỏi trực tiếp không cần /webmcp."
    return None


def _resolve_plan_data(data: Optional[dict], allowed: list[dict], tools: list[dict]) -> dict:
    if data is None:
        return {"tool": None, "args": {}, "reply": "Tôi chưa hiểu yêu cầu, bạn thử diễn đạt lại nhé."}

    tool_name = data.get("tool")
    reply = str(data.get("reply") or "")
    if not tool_name:
        return {"tool": None, "args": {}, "reply": reply or "Bạn muốn tôi tra cứu gì trong lộ trình?"}

    spec = next((t for t in allowed if t.get("name") == tool_name), None)
    if spec is None or tool_name not in READ_ONLY_WEBMCP_TOOLS:
        if _is_write_tool_name(tool_name) or any(t.get("name") == tool_name for t in tools):
            return {"tool": None, "args": {}, "reply": _write_denied_reply()}
        return {"tool": None, "args": {}, "reply": "Tool bạn cần không có trong danh sách WebMCP của trang."}

    allowed_keys = set((spec.get("inputSchema") or {}).get("properties", {}).keys())
    raw_args = data.get("args")
    args: dict[str, Any] = raw_args if isinstance(raw_args, dict) else {}
    return {"tool": tool_name, "args": {k: v for k, v in args.items() if k in allowed_keys}, "reply": reply}


async def plan_webmcp_call(llm: Any, message: str, tools: list[dict], context: Optional[dict]) -> dict:
    """Return {"tool": str|None, "args": dict, "reply": str} for read-only WebMCP lookups."""
    allowed = _allowed_tools(tools)
    early_reply = _preflight_reply(message, tools, allowed)
    if early_reply is not None:
        return {"tool": None, "args": {}, "reply": early_reply}

    if llm is None:
        return {"tool": None, "args": {}, "reply": "Chưa cấu hình LLM cho chế độ WebMCP."}
    if llm_breaker.is_open:
        return {"tool": None, "args": {}, "reply": RATE_LIMITED_REPLY}

    prompt = PLAN_PROMPT.format(
        page_hint=build_grounding(context) or "(không có ngữ cảnh trang)",
        tools_json=json.dumps(allowed, ensure_ascii=False),
        message=message,
    )
    try:
        res = await llm.ainvoke(prompt)
        data = _parse_json(getattr(res, "content", str(res)))
    except Exception as exc:  # LLM/network errors should not crash the chat
        if llm_breaker.record_failure(exc):
            return {"tool": None, "args": {}, "reply": RATE_LIMITED_REPLY}
        return {"tool": None, "args": {}, "reply": f"Không gọi được LLM: {exc}"}

    return _resolve_plan_data(data, allowed, tools)
