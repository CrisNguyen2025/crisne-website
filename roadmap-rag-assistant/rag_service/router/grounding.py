"""Page-context grounding and scope guardrail helpers.

- build_grounding(): turns the page context sent by the web client (current roadmap, layer)
  into a short hint line, so references like "thêm vào layer này" resolve to the right target.
- OUT_OF_SCOPE_REPLY / out_of_scope_reply(): refusal used when a message is unrelated to roadmaps.
- EMPTY_MESSAGE_REPLY, TOO_LONG_REPLY, RETRIEVAL_ERROR_REPLY: fixed replies for bad input and retrieval failure.
- UNCLEAR_REPLY: shown instead of the greeting when the intent is a low-confidence guess.
- MIXED_INTENT_REPLY, BULK_DELETE / BULK_DELETE_REPLY: ask back on several requests at once, refuse "delete all".
- BATCH_LAYER_DELETE_REPLY: layers are deleted one at a time.
- is_sensitive_request() / SENSITIVE_REPLY: refuse requests for secrets, config or the system prompt,
  and prompt-injection attempts, before any routing or LLM call.
- no_match_reply(): answer when a knowledge query finds nothing; never echoes the user's text.
"""

from __future__ import annotations

import re
from typing import Optional

_OUT_OF_SCOPE_HEAD = (
    "Xin lỗi, thông tin này nằm ngoài dữ liệu Roadmap nên tôi không tra cứu được "
    "(ví dụ: hợp đồng, hóa đơn, thời tiết). Tôi chỉ hỗ trợ lộ trình học tập: topic, layer, nhóm và bài học.\n\n"
    "Bạn có thể thử:\n"
    "- 🔎 **Tìm kiếm**: `tìm bài học về Docker`\n"
)
OUT_OF_SCOPE_REPLY = (
    _OUT_OF_SCOPE_HEAD
    + "- 🗺️ **Tạo topic**: `tạo topic AI Engineering`\n"
    "- 📖 **Thêm bài học**: `thêm bài học Vector Database vào layer này`"
)


def out_of_scope_reply(owner: bool) -> str:
    """Out-of-scope refusal; write commands are suggested to owners only."""
    if owner:
        return OUT_OF_SCOPE_REPLY
    return _OUT_OF_SCOPE_HEAD + "- 📋 **Xem danh sách**: `liệt kê topic`"


# Shown when the message is neither a greeting nor a clear request
UNCLEAR_REPLY = (
    "Tôi chưa hiểu rõ yêu cầu của bạn. Bạn có thể thử một trong các lệnh sau:\n"
    "- 🔎 **Tìm kiếm**: `tìm bài học về Docker`\n"
    "- 🗺️ **Tạo topic**: `tạo topic AI Engineering`\n"
    "- 📋 **Xem danh sách**: `liệt kê topic`"
)

EMPTY_MESSAGE_REPLY = (
    "Bạn muốn tôi giúp gì? Ví dụ:\n"
    "- 🔎 `tìm bài học về Docker`\n"
    "- 📋 `liệt kê topic`"
)

# Long enough for a pasted bulk-import list, short enough to keep prompts bounded.
MAX_MESSAGE_CHARS = 8000
TOO_LONG_REPLY = (
    f"Tin nhắn quá dài (tối đa {MAX_MESSAGE_CHARS:,} ký tự). ".replace(",", ".")
    + "Hãy rút gọn câu hỏi hoặc chia danh sách thành nhiều lần gửi."
)

MIXED_INTENT_REPLY = (
    "Tin nhắn có cả yêu cầu tìm kiếm và yêu cầu thay đổi roadmap. "
    "Tôi xử lý từng yêu cầu một, bạn gửi lần lượt từng yêu cầu nhé.\n\n"
    "Ví dụ: gửi `tìm bài học về Docker`, sau đó gửi `tạo topic Kubernetes`."
)

# "xóa hết topic", "xóa tất cả layer", "delete all items": not a named target.
BULK_DELETE = re.compile(
    r"\b(?:hết|tất\s+cả|toàn\s+bộ)\s+(?:các\s+)?(?:topics?|chủ\s+đề|lộ\s+trình|roadmaps?|layers?|nhóm|groups?|items?|bài|mục|lessons?)"
    r"|\b(?:delete|remove)\s+all\b|\ball\s+(?:topics|roadmaps|layers|groups|items|lessons)\b",
    re.IGNORECASE,
)
BULK_DELETE_REPLY = (
    "Tôi không hỗ trợ xóa toàn bộ trong một lệnh. "
    "Hãy nêu tên cụ thể, ví dụ: `xóa layer mock 1 và mock 2 trong topic fe`."
)

BATCH_LAYER_DELETE_REPLY = (
    "Hiện tại tôi chỉ xóa được từng layer một. Hãy gửi lệnh riêng cho mỗi layer, "
    "ví dụ: `xóa layer mock 1 trong topic fe`."
)

RATE_LIMITED_REPLY = "LLM đang tạm ngưng do hết hạn mức sử dụng. Bạn vui lòng thử lại sau."

RETRIEVAL_ERROR_REPLY = (
    "Xin lỗi, hiện tôi chưa tra cứu được dữ liệu Roadmap do lỗi tạm thời. "
    "Bạn vui lòng thử lại sau ít phút."
)


SENSITIVE_REPLY = (
    "Xin lỗi, tôi không thể cung cấp thông tin cấu hình, khóa bí mật hay chỉ dẫn nội bộ của hệ thống.\n\n"
    "Tôi có thể giúp bạn với lộ trình học tập, ví dụ:\n"
    "- 🔎 **Tìm kiếm**: `tìm bài học về Docker`\n"
    "- 📋 **Xem danh sách**: `liệt kê topic`"
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


def no_match_reply(owner: bool) -> str:
    """Reply for a knowledge query with no result; only owners are offered the create commands."""
    head = "Tôi chưa tìm thấy bài học hoặc tài liệu nào phù hợp trong Roadmap.\n\n"
    if owner:
        return head + "Bạn có thể thử từ khóa khác, hoặc tạo mới bằng lệnh: `tạo topic ...` hoặc `thêm bài học ... vào layer ...`."
    return head + "Bạn có thể thử lại với từ khóa khác, ví dụ: `tìm bài học về Docker`."


def build_grounding(context: Optional[dict]) -> str:
    """Return a one-line hint describing the page the user is looking at, or '' if none."""
    if not context:
        return ""

    parts: list[str] = []
    slug = (context.get("roadmapSlug") or "").strip()
    layer_id = (context.get("layerId") or "").strip()
    item_id = (context.get("itemId") or "").strip()

    if slug:
        parts.append(f"roadmap='{slug}'")
    if layer_id:
        parts.append(f"layerId='{layer_id}'")
    if item_id:
        parts.append(f"itemId='{item_id}'")

    if not parts:
        return ""
    return f"[Ngữ cảnh trang hiện tại: {', '.join(parts)}. Khi người dùng nói 'này', 'đây', hãy dùng ngữ cảnh này.]"


def with_grounding(message: str, context: Optional[dict]) -> str:
    """Prefix the user message with the page context hint, for LLM-facing prompts only."""
    hint = build_grounding(context)
    return f"{hint}\n{message}" if hint else message
