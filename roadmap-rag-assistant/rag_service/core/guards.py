"""Generic input and security checks, independent of the business.

Replies that name the business stay with the domain.
"""

from __future__ import annotations

import re
from typing import Optional

# Long enough for a pasted bulk-import list, short enough to keep prompts bounded.
MAX_MESSAGE_CHARS = 8000
TOO_LONG_REPLY = (
    f"Tin nhắn quá dài (tối đa {MAX_MESSAGE_CHARS:,} ký tự). ".replace(",", ".")
    + "Hãy rút gọn câu hỏi hoặc chia danh sách thành nhiều lần gửi."
)


# Environment-variable style names: GEMINI_API_KEY, DB_PASSWORD, ADMIN_TOKEN...
ENV_VAR_NAME = re.compile(r"\b[A-Z][A-Z0-9]*_(?:[A-Z0-9]+_)*(?:KEY|TOKEN|SECRET|PASSWORD)\b")
SYSTEM_PROMPT = re.compile(
    r"system\s+prompt|prompt\s+(?:hệ\s+thống|gốc|của\s+bạn)|your\s+(?:system\s+)?(?:prompt|instructions)"
)
# Only instructions aimed at this assistant ("... hướng dẫn trước", "ignore previous instructions"),
# so lesson questions like "người dùng lừa LLM bỏ qua quy tắc bảo mật" stay in scope.
INJECTION = re.compile(
    r"(?:bỏ\s+qua|phớt\s+lờ|quên)\s+(?:(?:hết|mọi|tất\s+cả|các)\s+)*(?:hướng\s+dẫn|chỉ\s+dẫn|quy\s+tắc|chỉ\s+thị)"
    r"\s+(?:trước|ở\s+trên|phía\s+trên|của\s+bạn|hệ\s+thống|đã\s+cho)"
    r"|ignore\s+(?:all\s+(?:previous\s+|prior\s+|above\s+)?|previous\s+|prior\s+|above\s+|your\s+)"
    r"(?:instructions|rules|prompts?)"
)
# "Reveal" verbs only count together with a secret that belongs to the system,
# so lesson questions like "token JWT là gì" or "lưu token in localStorage" stay in scope.
REVEAL = re.compile(r"\bin(?:\s+ra)?\b|hiển\s+thị|cho\s+(?:tôi\s+|mình\s+|em\s+)?xem|\bđọc\b|tiết\s+lộ|\b(?:print|show|reveal|dump|cat|echo)\b")
ENV_FILE = re.compile(r"\.env\b")
SECRET = re.compile(r"api[\s_-]?keys?|secrets?|tokens?|passwords?|mật\s+khẩu|biến\s+môi\s+trường|credentials?")
OWNED = re.compile(
    r"giá\s+trị|\bvalue\b|hiện\s+tại|\bcurrent\b|của\s+(?:bạn|hệ\s+thống|server|backend|ứng\s+dụng|app)"
    r"|\byour\s+(?:api|secrets?|tokens?|passwords?|credentials?|env)"
)


def is_sensitive_request(message: str) -> bool:
    """True when the message asks for secrets, config or the system prompt, or tries prompt injection."""
    if ENV_VAR_NAME.search(message):
        return True
    lower = message.lower()
    if SYSTEM_PROMPT.search(lower) or INJECTION.search(lower):
        return True
    if not REVEAL.search(lower):
        return False
    return bool(ENV_FILE.search(lower) or (SECRET.search(lower) and OWNED.search(lower)))


def input_problem(message: str) -> Optional[str]:
    """"empty" or "too_long" when the message cannot be routed, otherwise None."""
    if not message:
        return "empty"
    if len(message) > MAX_MESSAGE_CHARS:
        return "too_long"
    return None
