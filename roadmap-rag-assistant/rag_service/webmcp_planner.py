"""Plan one WebMCP tool call for a message. The browser executes the chosen tool.

The planner only chooses a tool and arguments; it never runs anything itself.
Destructive tools (delete_*) are excluded so they stay in the confirmed RAG flow.
"""

from __future__ import annotations

import json
import re
from typing import Optional

from rag_service.llm_breaker import llm_breaker
from rag_service.domains.roadmap.router.grounding import OUT_OF_SCOPE_REPLY, RATE_LIMITED_REPLY, build_grounding
from rag_service.domains.roadmap.router.intent_router import IntentRouter
from rag_service.domains.roadmap.router.schemas import IntentType

_router = IntentRouter()

PLAN_PROMPT = """Bạn chọn đúng MỘT tool để thực hiện yêu cầu của người dùng về lộ trình học.
Chỉ trả về JSON hợp lệ, không thêm chữ nào khác, theo dạng:
{{"tool": "<tên tool hoặc null>", "args": {{...}}, "reply": "<câu trả lời ngắn cho người dùng>"}}

Quy tắc:
- Chỉ dùng tool trong danh sách bên dưới. Nếu không cần tool, đặt "tool": null và viết câu trả lời vào "reply".
- Chỉ dùng các tham số có trong schema của tool. Lấy id/slug từ ngữ cảnh trang nếu người dùng nói "này" hoặc "đây".
- Không bịa id. Nếu thiếu thông tin bắt buộc, đặt "tool": null và hỏi lại trong "reply".

{page_hint}
Danh sách tool:
{tools_json}

Yêu cầu của người dùng:
"{message}"
"""


def _allowed_tools(tools: list[dict]) -> list[dict]:
    return [t for t in tools if not str(t.get("name", "")).startswith("delete_")]


def _parse_json(text: str) -> Optional[dict]:
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except ValueError:
        return None


async def plan_webmcp_call(llm, message: str, tools: list[dict], context: Optional[dict]) -> dict:
    """Return {"tool": str|None, "args": dict, "reply": str}."""
    intent = _router.classify_heuristics(message)
    if intent is not None and intent.intent == IntentType.OUT_OF_SCOPE:
        return {"tool": None, "args": {}, "reply": OUT_OF_SCOPE_REPLY}

    allowed = _allowed_tools(tools)
    if llm is None:
        return {"tool": None, "args": {}, "reply": "Chưa cấu hình LLM cho chế độ WebMCP."}

    prompt = PLAN_PROMPT.format(
        page_hint=build_grounding(context) or "(không có ngữ cảnh trang)",
        tools_json=json.dumps(allowed, ensure_ascii=False),
        message=message,
    )
    if llm_breaker.is_open:
        return {"tool": None, "args": {}, "reply": RATE_LIMITED_REPLY}
    try:
        res = await llm.ainvoke(prompt)
        data = _parse_json(getattr(res, "content", str(res)))
    except Exception as exc:  # LLM/network errors should not crash the chat
        if llm_breaker.record_failure(exc):
            return {"tool": None, "args": {}, "reply": RATE_LIMITED_REPLY}
        return {"tool": None, "args": {}, "reply": f"Không gọi được LLM: {exc}"}

    if data is None:
        return {"tool": None, "args": {}, "reply": "Tôi chưa hiểu yêu cầu, bạn thử diễn đạt lại nhé."}

    tool_name = data.get("tool")
    reply = str(data.get("reply") or "")
    if not tool_name:
        return {"tool": None, "args": {}, "reply": reply or "Bạn muốn tôi làm gì với lộ trình?"}

    spec = next((t for t in allowed if t.get("name") == tool_name), None)
    if spec is None:
        return {"tool": None, "args": {}, "reply": "Tool bạn cần không có trong danh sách WebMCP của trang."}

    allowed_keys = set((spec.get("inputSchema") or {}).get("properties", {}).keys())
    args = data.get("args") if isinstance(data.get("args"), dict) else {}
    args = {k: v for k, v in args.items() if k in allowed_keys}
    return {"tool": tool_name, "args": args, "reply": reply}
