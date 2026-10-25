"""Semantic grounding check: claims in the answer that the retrieved context does not support.

check_grounding (grounding.py) only sees bold names and fixed phrases; this asks the model, once per
answer, which statements have no basis in the documents. It runs only with RAG_SEMANTIC_GROUNDING=true.

No model, a timeout, an error or an unreadable reply returns None: the check is skipped, never failed.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, List, Optional

from rag_service.core.retrieval.transform import _text_of

FAITHFULNESS_TIMEOUT = 10.0
CONTEXT_CHARS = 6000
MAX_CLAIMS = 5

JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


def build_prompt(answer: str, context: str, question: str) -> str:
    return (
        "Bạn kiểm tra một câu trả lời có bám vào tài liệu hay không.\n"
        "Chỉ liệt kê nhận định trong CÂU TRẢ LỜI thuộc một trong hai loại:\n"
        "1. Nói ngược lại TÀI LIỆU.\n"
        "2. Nêu dữ kiện cụ thể mà TÀI LIỆU không có: tên riêng, con số, ngày tháng, công cụ, sản phẩm, "
        "hoặc một mục / tính năng của hệ thống.\n"
        "KHÔNG liệt kê: diễn đạt lại, tóm tắt, so sánh hay suy luận rút ra trực tiếp từ tài liệu; "
        "lời chào, câu dẫn, gợi ý hỏi tiếp; kiến thức chung hiển nhiên.\n"
        'Chỉ trả về JSON: {"unsupported": ["nhận định 1", ...]}, mảng rỗng nếu mọi nhận định đều có cơ sở.\n\n'
        f"<question>{question}</question>\n<documents>\n{context[:CONTEXT_CHARS]}\n</documents>\n"
        f"<answer>\n{answer}\n</answer>"
    )


def parse_claims(text: str) -> Optional[List[str]]:
    """The unsupported claims in the reply, or None when the reply is not the expected JSON."""
    match = JSON_OBJECT.search(text or "")
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    claims = data.get("unsupported") if isinstance(data, dict) else None
    if not isinstance(claims, list):
        return None
    return [str(c).strip() for c in claims if str(c).strip()][:MAX_CLAIMS]


async def unsupported_claims(llm: Any, answer: str, context: str, question: str) -> Optional[List[str]]:
    if llm is None or not answer.strip() or not context.strip():
        return None
    try:
        message = await asyncio.wait_for(llm.ainvoke(build_prompt(answer, context, question)), FAITHFULNESS_TIMEOUT)
    except Exception:
        return None
    return parse_claims(_text_of(getattr(message, "content", "")))
