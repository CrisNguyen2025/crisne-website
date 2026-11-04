"""Page-context grounding and scope guardrail helpers.

- build_grounding(): turns the page context sent by the web client (current topic, section)
  into a short hint line, so references like "thêm vào mục này" resolve to the right target.
- OUT_OF_SCOPE_REPLY / out_of_scope_reply(): refusal used when a message is unrelated to roadmaps.
- EMPTY_MESSAGE_REPLY, TOO_LONG_REPLY, RETRIEVAL_ERROR_REPLY: fixed replies for bad input and retrieval failure.
- UNCLEAR_REPLY: shown instead of the greeting when the intent is a low-confidence guess.
- MIXED_INTENT_REPLY, BULK_DELETE / BULK_DELETE_REPLY: ask back on several requests at once, refuse "delete all".
- legacy_level_reply(): ask back with the topic/section syntax when a message names a layer or group (ADR-0009).
- is_sensitive_request() / SENSITIVE_REPLY: refuse requests for secrets, config or the system prompt,
  and prompt-injection attempts, before any routing or LLM call.
- no_match_reply(): answer when a knowledge query finds nothing; never echoes the user's text.
"""

from __future__ import annotations

import random
import re
from typing import Callable, Optional

from rag_service.core.guards import MAX_MESSAGE_CHARS, TOO_LONG_REPLY, is_sensitive_request  # noqa: F401
from rag_service.domains.roadmap.retrieval.relevance import content_words, fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese

def example_blocks(*commands: str) -> str:
    """Example commands, each in its own one-line ```text block.

    The chat widget gives each block a copy button, and a send button unless the command still has a blank to
    fill in ("<tên>", "…") or deletes something. A blank line goes before every block: a fence is only read on its
    own line. Inline `code` gets neither button, so every command a reply suggests goes here.
    """
    return "\n\n".join(f"```text\n{command}\n```" for command in commands)


LIST_EXAMPLE = "liệt kê topic"
# The owner names their own topics: an example never picks a subject for them
CREATE_TOPIC_EXAMPLE = "tạo topic <tên topic>"


def _names_a_subject(title: str) -> bool:
    """A title worth searching for: one real word at least, not a bare number or code ("2", "01")."""
    return any(len(w) >= 3 and not w.isdigit() for w in content_words(title))


def _indexed_docs(kind: str) -> list:
    """Documents of one kind ("item", "topic") in the live index whose title names a subject."""
    from rag_service.domains.roadmap.retrieval.engine import rag_engine

    return [d for d in rag_engine._vector_store._docs_map.values() if d.doc_type == kind and _names_a_subject(d.title or "")]


def _unrelated(title: str, exclude: str) -> bool:
    """The title shares no content word with the message just answered, so it is not that search again."""
    return not (content_words(title) & content_words(exclude)) if exclude else True


def search_examples(exclude: str = "", limit: int = 1) -> list[str]:
    """Searches that find something on this roadmap now: a lesson it holds, picked at random each time.

    None when the roadmap has no lesson. What the user just searched for is never suggested back (exclude).
    """
    titles = [d.title for d in _indexed_docs("item") if _unrelated(d.title, exclude)]
    return [f"tìm bài học về {t}" for t in random.sample(titles, min(limit, len(titles)))]


def topic_examples(exclude: str = "", limit: int = 1) -> list[str]:
    """A question about a topic the roadmap holds; none when it has no topic."""
    titles = [d.title for d in _indexed_docs("topic") if _unrelated(d.title, exclude)]
    return [f"topic {t} có những bài gì" for t in random.sample(titles, min(limit, len(titles)))]


def plan_examples() -> list[str]:
    """A learning-plan question about a topic the roadmap holds, answered from its lessons; none when empty."""
    titles = [d.title for d in _indexed_docs("topic")]
    return [f"Mình muốn học {random.choice(titles)}, nên đọc bài nào trước?"] if titles else []


def browse_examples(exclude: str = "") -> list[str]:
    """What a reader can try: a real lesson to search, and the topic list. Nothing on an empty roadmap."""
    from rag_service.domains.roadmap.retrieval.engine import rag_engine

    if rag_engine.is_empty():
        return []
    return [*search_examples(exclude), LIST_EXAMPLE]


def _with_examples(head: str, intro: str, commands: list[str]) -> str:
    return f"{head}\n\n{intro}\n\n{example_blocks(*commands)}" if commands else head


# No create suggestion, for owners either: a topic outside the roadmap is not a lesson to add
OUT_OF_SCOPE_REPLY = (
    "Xin lỗi, thông tin này nằm ngoài dữ liệu Roadmap nên tôi không tra cứu được "
    "(ví dụ: hợp đồng, hóa đơn, thời tiết). Tôi chỉ hỗ trợ lộ trình học tập: topic, mục và bài học."
)


def out_of_scope_reply(owner: bool) -> str:
    """Out-of-scope refusal: the topic is outside the roadmap, so nothing is offered to create."""
    return _with_examples(OUT_OF_SCOPE_REPLY, "Bạn có thể thử:", browse_examples())


# Shown when the message is neither a greeting nor a clear request
UNCLEAR_REPLY = "Tôi chưa hiểu rõ yêu cầu của bạn."


def unclear_reply(owner: bool) -> str:
    commands = [*browse_examples(), *([CREATE_TOPIC_EXAMPLE] if owner else [])]
    return _with_examples(UNCLEAR_REPLY, "Bạn có thể thử một trong các lệnh sau:", commands)


EMPTY_MESSAGE_REPLY = "Bạn muốn tôi giúp gì?"


def empty_message_reply(owner: bool) -> str:
    commands = [*browse_examples(), *([CREATE_TOPIC_EXAMPLE] if owner else [])]
    return _with_examples(EMPTY_MESSAGE_REPLY, "Ví dụ:", commands)

# Steps are of different kinds, not always a search and a change ("bạn làm được gì, rồi tìm bài Y")
MIXED_INTENT_REPLY = "Tin nhắn có nhiều yêu cầu khác nhau, tôi làm lần lượt từng bước."


def mixed_intent_reply(steps: list[str]) -> str:
    """Ask back with the user's own clauses as ordered commands, so the next message is one copy away."""
    return (
        f"{MIXED_INTENT_REPLY} Gửi lần lượt từng bước theo thứ tự, bắt đầu từ bước 1:\n\n"
        + "\n\n".join(f"**Bước {i}**\n\n{example_blocks(step)}" for i, step in enumerate(steps, 1))
    )

# "xóa hết topic", "xóa tất cả bài", "delete all items": not a named target.
BULK_DELETE = re.compile(
    r"\b(?:hết|tất\s+cả|toàn\s+bộ)\s+(?:các\s+)?(?:topics?|chủ\s+đề|lộ\s+trình|roadmaps?|items?|bài|mục|lessons?)"
    r"|\b(?:delete|remove)\s+all\b|\ball\s+(?:topics|roadmaps|items|lessons)\b",
    re.IGNORECASE,
)
BULK_DELETE_REPLY = (
    "Tôi không hỗ trợ xóa toàn bộ trong một lệnh. "
    "Hãy nêu tên cụ thể, ví dụ:\n\n" + example_blocks("xóa bài mock 1 và mock 2 trong topic fe")
)

# "tôi có thể tạo topic mới không?", "tạo topic mới": a create that names nothing. Matched folded, on the whole message.
UNNAMED_CREATE = re.compile(
    r"^(?:(?:toi|minh|em|ban|anh|chi)\s+)?(?:co\s+the\s+)?(?:tao|them|create|add)\s+(?:(?:mot|1|a|new)\s+)?"
    r"(?P<noun>topic|chu\s+de|lo\s+trinh|roadmap|bai(?:\s+hoc)?|item|lesson|muc)"
    r"(?:\s+(?:moi|new))?(?:\s+(?:duoc\s+)?(?:khong|ko|hong|chu|nhe|nha|di|giup(?:\s+minh)?))*\s*[?.!]*$"
)
_UNNAMED_EXAMPLES = {
    "topic": ("topic", "tạo topic AI Engineering"),
    "item": ("bài học", "thêm bài Kafka vào topic … mục …"),
}


def unnamed_create_reply(text: str) -> Optional[str]:
    """Asked back when a create names nothing: whether it can, and the syntax with a name. None for any other message."""
    m =UNNAMED_CREATE.match(fold(normalize_vietnamese(text).lower().strip()))
    if m is None:
        return None
    noun = m.group("noun")
    kind = "item" if noun.startswith("bai") or noun in ("item", "lesson", "muc") else "topic"
    name, example = _UNNAMED_EXAMPLES[kind]
    return f"Được, mình tạo {name} được. Bạn gửi tên {name} giúp mình, ví dụ:\n\n" + example_blocks(example)


# "xóa layer mock 1", "tạo group Core trong layer aaa": levels removed by ADR-0009. Matched folded, only where
# layer/group is the noun a verb or preposition points at, so a title such as "Tầng RAG + Agent Layer" never matches.
# "nhóm" and "tầng" stay out: "tạo nhóm Zalo" is another system, not a removed level.
LEGACY_LEVEL = re.compile(
    r"\b(?:tao|them|xoa|sua|doi\s+ten|liet\s+ke|vao|trong|cua|create|add|delete|remove|rename|list|in|to|on)"
    r"\s+(?:(?:cac|nhung|all|the)\s+)?(?:\d+\s+)?(?:layers?|groups?)\b"
)
# The roadmap evidence the guard also needs: "thêm layer dropout vào model Keras" names none and is left to the router.
ROADMAP_NOUN = re.compile(r"\b(?:topics?|chu\s+de|lo\s+trinh|roadmaps?|bai(?:\s+hoc)?|lessons?|items?|muc)\b")


def legacy_level_reply(text: str, known_place: Optional[Callable[[str], bool]] = None) -> Optional[str]:
    """Asked back when a message names a layer or group and the roadmap: suggests the topic/lesson/section syntax.

    The roadmap is a roadmap noun or, with `known_place`, the name of a topic that exists. None otherwise.
    """
    flat = fold(normalize_vietnamese(text).lower())
    if LEGACY_LEVEL.search(flat) is None:
        return None
    words = re.findall(r"[\w-]+", flat)
    named = known_place is not None and any(
        known_place(" ".join(words[i:j])) for i in range(len(words)) for j in range(i + 1, min(i + 5, len(words)) + 1)
    )
    if ROADMAP_NOUN.search(flat) is None and not named:
        return None
    return (
        "Roadmap không còn layer hay group. Mỗi topic chứa trực tiếp các bài học, và bài học được chia theo mục. "
        "Mình chưa làm gì cả. Bạn gửi lại theo cú pháp mới, ví dụ:\n\n"
        + example_blocks("thêm bài Docker vào topic AI Engineering mục Core", "xóa bài Docker", "tạo topic AI Engineering")
    )


# The executor runs create and delete only: an update is answered here, never previewed
UPDATE_NOT_SUPPORTED_REPLY = (
    "Abot chưa sửa được topic hay bài học qua chat. Bạn mở bài đó trên trang Roadmap để sửa trực tiếp. "
    "Thêm mới hoặc xóa thì Abot làm được, ví dụ:\n\n" + example_blocks("thêm bài … vào topic …", "xóa bài …")
)


def batch_entity_delete_reply(noun: str) -> str:
    return (
        f"Hiện tại tôi chỉ xóa được từng {noun} một. Hãy gửi lệnh riêng cho mỗi {noun}, ví dụ:\n\n"
        + example_blocks(f"xóa {noun} …")
    )


def unresolved_entity_reply(noun: str, name: str, candidates: list[dict]) -> str:
    """Asked back when the lesson to delete is not one entity of the roadmap; nothing is deleted."""
    if not candidates:
        return f"Không tìm thấy {noun} `{name}` trong Roadmap nên mình chưa xóa gì. Bạn kiểm tra lại tên giúp mình nhé."
    listing = "\n".join(f"- {c['title']} (mục {c.get('section') or 'Chung'})" for c in candidates[:10])
    return f"Có nhiều {noun} khớp với `{name}`:\n{listing}\n\nBạn gửi lại tên đầy đủ của {noun} cần xóa nhé."

# The extracted change is not the one the message's verb asks for ("khỏi tạo topic X" read as a delete)
ACTION_NOT_ASKED_REPLY = (
    "Mình chưa chắc bạn muốn thay đổi gì nên chưa làm gì cả. "
    "Bạn nói rõ giúp mình nhé, ví dụ:\n\n" + example_blocks("tạo topic …", "thêm bài … vào topic …", "xóa bài …")
)

BLOCKED_CHANGE_REPLY = (
    "Tôi hiểu đây không phải yêu cầu thay đổi nên không sửa gì trong roadmap. "
    "Nếu bạn muốn thay đổi, hãy gửi lệnh trực tiếp, ví dụ:\n\n" + example_blocks("xóa bài Kafka", "tạo topic <tên topic>")
)

TARGET_MISSING_REPLY = (
    "Mình chưa biết bạn muốn thay đổi mục nào nên chưa làm gì cả. Bạn gửi lại kèm tên cụ thể giúp mình nhé, "
    "ví dụ:\n\n" + example_blocks("thêm bài Hybrid Search vào topic AI Engineering mục RAG", "xóa bài Kafka")
)

QUESTION_TITLE_REPLY = (
    "Tên bạn đưa trông giống một câu hỏi nên tôi chưa tạo gì. Nếu muốn tạo mới, hãy gửi lại kèm tên rõ ràng, "
    "ví dụ:\n\n" + example_blocks(CREATE_TOPIC_EXAMPLE)
)

RATE_LIMITED_REPLY = "LLM đang tạm ngưng do hết hạn mức sử dụng. Bạn vui lòng thử lại sau."

RETRIEVAL_ERROR_REPLY = (
    "Xin lỗi, hiện tôi chưa tra cứu được dữ liệu Roadmap do lỗi tạm thời. "
    "Bạn vui lòng thử lại sau ít phút."
)


SENSITIVE_REPLY = "Xin lỗi, tôi không thể cung cấp thông tin cấu hình, khóa bí mật hay chỉ dẫn nội bộ của hệ thống."


def sensitive_reply() -> str:
    return _with_examples(SENSITIVE_REPLY, "Tôi có thể giúp bạn với lộ trình học tập, ví dụ:", browse_examples())


NO_MATCH_REPLY = "Tôi chưa tìm thấy bài học hoặc tài liệu nào phù hợp trong Roadmap."


def no_match_reply(owner: bool, query: str = "") -> str:
    """Reply for a roadmap question with no result: lessons that do exist, never the search that just failed.

    Creating is offered only for a topic of the roadmap's field (domain_gap_reply): a question that found nothing
    may be about anything.
    """
    return _with_examples(NO_MATCH_REPLY, "Roadmap hiện có, bạn thử xem:", browse_examples(exclude=query))


def empty_roadmap_reply(owner: bool) -> str:
    """The roadmap holds no topic at all: say so, instead of suggesting searches that cannot find anything."""
    reply = "Hiện website chưa có lộ trình nào, nên tôi chưa có bài học hay tài liệu để trả lời câu hỏi này."
    if owner:
        reply += "\n\nBạn có thể bắt đầu bằng cách tạo topic đầu tiên:\n\n" + example_blocks(CREATE_TOPIC_EXAMPLE)
    return reply


# A focus that speaks as the user ("tôi cần hỗ trợ học tập") is a sentence, not the name of a lesson.
# Matched with accents: folded, "can" would also catch "Cân bằng tải" and "to" the English word.
_SENTENCE_WORDS = re.compile(
    r"(?<!\w)(?:tôi|mình|tui|tớ|cần|muốn|xin|giúp|hỗ\s+trợ|hướng\s+dẫn|làm\s+sao|thế\s+nào)(?!\w)"
)
MAX_TITLE_WORDS = 6


def looks_like_title(topic: Optional[str]) -> bool:
    """True when the focus could be a lesson's name: a short phrase that is not a request in the user's voice."""
    if not topic:
        return False
    text = normalize_vietnamese(topic).lower()
    return len(text.split()) <= MAX_TITLE_WORDS and _SENTENCE_WORDS.search(text) is None


def domain_gap_reply(topic: Optional[str], owner: bool) -> str:
    """The topic belongs to the roadmap's field but no lesson covers it yet; owners may add one.

    The focus is named, and offered as a lesson title, only when it reads like one (looks_like_title).
    """
    if not looks_like_title(topic):
        topic = None
    name = f"**{topic}**" if topic else "chủ đề này"
    reply = f"Roadmap chưa có bài học về {name}. Chủ đề này thuộc lĩnh vực của lộ trình nhưng chưa được bổ sung."
    if owner and topic:
        reply += "\n\nBạn có thể thêm:\n\n" + example_blocks(f"thêm bài {topic} vào topic …")
    return reply


def build_grounding(context: Optional[dict]) -> str:
    """Return a one-line hint describing the page the user is looking at, or '' if none."""
    if not context:
        return ""

    parts: list[str] = []
    slug = (context.get("roadmapSlug") or "").strip()
    section = (context.get("section") or "").strip()
    item_id = (context.get("itemId") or "").strip()

    if slug:
        parts.append(f"roadmap='{slug}'")
    if section:
        parts.append(f"section='{section}'")
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
    "hoặc thêm bài học vào topic hiện có."
)


def content_unclear_reply(topic_title: str = "") -> str:
    """Asked back when a change names no kind of entity; names the open topic when there is one."""
    topic = f"topic **{topic_title}**" if topic_title else "topic …"
    return (
        f"Bạn muốn thêm gì vào {topic}? Mình cần biết tên bài (và mục nếu có). Ví dụ:\n\n"
        + example_blocks(f"thêm bài Kafka vào topic {topic_title or '…'} mục …", "xóa bài Kafka")
    )


NO_TOPIC_REPLY = (
    "Mình chưa có topic nào đang mở trong cuộc trò chuyện này nên chưa biết bạn nói topic nào. "
    "Bạn gửi tên topic giúp mình, ví dụ:\n\n" + example_blocks("thêm bài Basics vào topic AI Engineering")
)
