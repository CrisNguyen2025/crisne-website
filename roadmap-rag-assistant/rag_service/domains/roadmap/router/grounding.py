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

from rag_service.core.guards import MAX_MESSAGE_CHARS, TOO_LONG_REPLY, is_sensitive_request  # noqa: F401

_OUT_OF_SCOPE_HEAD = (
    "Xin lỗi, thông tin này nằm ngoài dữ liệu Roadmap nên tôi không tra cứu được "
    "(ví dụ: hợp đồng, hóa đơn, thời tiết). Tôi chỉ hỗ trợ lộ trình học tập: topic, layer, nhóm và bài học.\n\n"
    "Bạn có thể thử:\n"
    "- 🔎 **Tìm kiếm**: `tìm bài học về Docker`\n"
)
# No create suggestion, for owners either: a topic outside the roadmap is not a lesson to add
OUT_OF_SCOPE_REPLY = _OUT_OF_SCOPE_HEAD + "- 📋 **Xem danh sách**: `liệt kê topic`"


def out_of_scope_reply(owner: bool) -> str:
    """Out-of-scope refusal: the topic is outside the roadmap, so nothing is offered to create."""
    return OUT_OF_SCOPE_REPLY


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

MIXED_INTENT_REPLY = "Tin nhắn có cả yêu cầu tìm kiếm và yêu cầu thay đổi roadmap, tôi làm lần lượt từng bước."


def mixed_intent_reply(steps: list[str]) -> str:
    """Ask back with the user's own clauses as ordered commands, so the next message is one copy away."""
    lines = [MIXED_INTENT_REPLY, ""]
    lines += [f"{i}. `{step}`" for i, step in enumerate(steps, 1)]
    lines += ["", f"Gửi bước 1 trước: `{steps[0]}`, xong rồi gửi tiếp các bước sau theo thứ tự."]
    return "\n".join(lines)

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

# The extracted change is not the one the message's verb asks for ("khỏi tạo topic X" read as a delete)
ACTION_NOT_ASKED_REPLY = (
    "Mình chưa chắc bạn muốn thay đổi gì nên chưa làm gì cả. "
    "Bạn nói rõ giúp mình nhé, ví dụ: `tạo topic …`, `xóa bài …` hoặc `đổi tên bài … thành …`."
)

BLOCKED_CHANGE_REPLY = (
    "Tôi hiểu đây không phải yêu cầu thay đổi nên không sửa gì trong roadmap. "
    "Nếu bạn muốn thay đổi, hãy gửi lệnh trực tiếp, ví dụ: `xóa bài Kafka` hoặc `tạo topic AI Engineering`."
)

QUESTION_TITLE_REPLY = (
    "Tên bạn đưa trông giống một câu hỏi nên tôi chưa tạo gì. Nếu muốn tạo mới, hãy gửi lại kèm tên rõ ràng, "
    "ví dụ: `tạo topic AI Engineering`."
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

def no_match_reply(owner: bool) -> str:
    """Reply for a roadmap question with no result. Creating is offered only for a topic of the roadmap's
    field (domain_gap_reply): a question that found nothing may be about anything."""
    return (
        "Tôi chưa tìm thấy bài học hoặc tài liệu nào phù hợp trong Roadmap.\n\n"
        "Bạn có thể thử lại với từ khóa khác, ví dụ: `tìm bài học về Docker`."
    )


def domain_gap_reply(topic: Optional[str], owner: bool) -> str:
    """The topic belongs to the roadmap's field but no lesson covers it yet; owners may add one."""
    name = f"**{topic}**" if topic else "chủ đề này"
    reply = f"Roadmap chưa có bài học về {name}. Chủ đề này thuộc lĩnh vực của lộ trình nhưng chưa được bổ sung."
    if owner and topic:
        reply += f"\n\nBạn có thể thêm: `thêm bài {topic} vào layer ...`"
    return reply


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

DESCRIPTION_UNSUPPORTED_REPLY = (
    "Mình chưa sửa được mô tả của topic: mô tả chỉ đặt được lúc tạo topic. Bạn có thể tạo topic mới kèm mô tả, "
    "hoặc thêm layer, bài học, nhóm vào topic hiện có."
)


def content_unclear_reply(topic_title: str = "") -> str:
    """Asked back when a change names no kind of entity; names the open topic when there is one."""
    topic = f"topic **{topic_title}**" if topic_title else "topic …"
    return (
        f"Bạn muốn thêm gì vào {topic}? Mình cần biết loại mục: layer, bài học hay nhóm. Ví dụ: "
        f"`thêm layer Basics vào {topic_title or 'topic …'}`, `thêm bài Kafka vào layer …` "
        f"hoặc `tạo nhóm Core trong layer …`."
    )


NO_TOPIC_REPLY = (
    "Mình chưa có topic nào đang mở trong cuộc trò chuyện này nên chưa biết bạn nói topic nào. "
    "Bạn gửi tên topic giúp mình, ví dụ: `thêm layer Basics vào topic AI Engineering`."
)
