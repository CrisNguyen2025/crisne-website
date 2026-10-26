"""Router policy — the one file a person edits to change how messages are read, routed and allowed to write.

Everything here is data; the code that applies it is understanding.py (reads cues), intent_router.py (applies the
decision table) and write_gate.py (applies the write policy). Recheck any change with:

    .venv/bin/python -m evals router-check      # stress + held-out sets, ratchet baseline, decision diff

Sections:
1. Vocabulary: speech acts and targets, the two axes a message is read on
2. Cues: words and patterns behind each axis
3. Decision table: act × target → intent, first matching row wins
4. Write policy: what may reach the database
5. LLM router examples and clause split
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.schemas import IntentType
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese

# ── 1. Vocabulary ───────────────────────────────────────────────────────────

class SpeechAct(str, Enum):
    PLAN = "plan"            # "/plan", "lập kế hoạch ..."
    RECALL = "recall"        # about the user or earlier turns: "tôi tên gì", "tôi là Huy"
    GREETING = "greeting"    # a greeting and nothing else
    REQUEST = "request"      # a change asked politely or on a condition: confirmed before it runs
    QUESTION = "question"
    COMMAND = "command"      # a change verb in the imperative
    STATEMENT = "statement"  # none of the above


class Target(str, Enum):
    OFF_TOPIC = "off_topic"  # weather, prices, poems...
    ASSISTANT = "assistant"  # the assistant or the project: "bạn là ai", "làm được gì", prompt suggestions
    ROADMAP = "roadmap"      # names a topic / layer / group / lesson
    NONE = "none"


# ── 2. Cues ─────────────────────────────────────────────────────────────────

# Target cues

# Subjects clearly outside the roadmap domain. Matched only when no roadmap entity word is present.
OFF_TOPIC_HINTS = [
    "thời tiết", "dự báo thời tiết", "giá vàng", "tỷ giá", "tỉ giá", "chứng khoán", "bitcoin", "crypto",
    "bóng đá", "tỷ số", "tỉ số", "phim", "bài hát", "nấu ăn", "công thức nấu", "du lịch",
    "weather", "stock price", "football score", "recipe",
    # Sports fixtures and TV schedules
    "arsenal", "man city", "man utd", "liverpool", "chelsea", "world cup", "đá với", "chiếu trên", "lịch chiếu",
    # Shopping, food, lottery, vehicles, health: everyday questions with no roadmap content
    "giá rẻ", "uy tín tại", "mua iphone", "ăn gì", "quán ăn", "món ngon", "xổ số", "vé số",
    "xe honda", "ô tô", "xe máy", "review giúp", "trị mụn", "thuốc", "thủ đô", "capital of",
    # Business records live outside the roadmap database
    "hợp đồng", "hóa đơn", "công nợ", "doanh thu", "bảng lương", "chấm công",
]

# Creative writing and news cues ("bài thơ") use "bài", a roadmap word too, so they skip the entity check
OFF_TOPIC_STRONG_HINTS = [
    "bài thơ", "viết thơ", "truyện", "tin tức", "poem", "romantic", "joke", "câu chuyện cười",
    "kể chuyện", "dịch giúp", "dịch đoạn", "translate",
]

# Roadmap objects, folded (typo-tolerant)
ENTITY_PATTERNS = [
    r"topics?c*", r"chu\s+de", r"lo\s+trinh", r"roadmaps?",
    r"layers?r*", r"mang(?:\s+kien\s+thuc)?",
    r"groups?", r"nhom",
    r"items?m*", r"bai(?:\s+hoc)?", r"muc", r"lessons?"
]

# Everyday or technical phrases holding an entity word that names no roadmap object: "mục tiêu", "mạng nơ-ron",
# "bài toán", "Kafka topic", "layer normalization", "xóa item khỏi list". Removed (on the folded text) before
# looking for an object, so "tạo mạng neural bằng PyTorch" is not a create and "cách tạo topic trong Kafka" is
# not a question about using the assistant.
_TECH = r"(?:kafka|mqtt|pub\s?sub|rabbitmq|sns|python|js|javascript|typescript|java|list|array|mang(?!\s+kien\s+thuc)|dict|set|tuple|pytorch|keras|tensorflow|react|redux)"
FALSE_OBJECT = re.compile(
    r"\bmuc\s+(?:tieu|dich|do|luc)\b"
    r"|\bmang\s+(?:no-?\s?ron|neural|neuron|may\s+tinh|xa\s+hoi|luoi|lan|internet|wifi|di\s+dong|than\s+kinh)\b"
    r"|\bbai\s+(?:toan|tho|hat|van|bao|phat\s+bieu|thuyet\s+trinh)\b"
    r"|\b(?:kafka|mqtt|pub\s?sub|rabbitmq|sns)\s+topics?\b"
    r"|\b(?:topics?|items?|layers?|groups?)\s+(?:trong|cua|khoi|tren|in|of|from)\s+(?:(?:mot|cai|the|a|an)\s+)?" + _TECH + r"\b"
    r"|\blayers?\s+(?:normalization|norm|an|dense|tich\s+chap)\b|\b(?:hidden|dense|conv|attention|osi|batch)\s+layers?\b"
    r"|\blist\s+items?\b|\bgroup\s+by\b"
)

# A follow-up may take its object from earlier turns only when it points back to one ("xóa nó đi", "sửa bài đó");
# "tạo mạng neural" in the middle of a conversation names no earlier object.
ANAPHORA_REF = re.compile(
    r"\b(?:no|cai\s+(?:do|nay|kia)|bai\s+(?:do|nay|kia)|topic\s+(?:do|nay)|layer\s+(?:do|nay)|nhom\s+(?:do|nay)"
    r"|muc\s+(?:do|nay)|chung|tat\s+ca\s+(?:chung|cac\s+bai\s+do))\b"
)
# English pointers, matched on the accented text: folded, "thêm" reads as "them" and "ít" as "it"
ANAPHORA_REF_EN = re.compile(r"\b(?:it|that|this|them|those)\b")

# Prompt suggestions ("gợi ý", "prompt mẫu") are help, not a search; "gợi ý bài về X" still searches
SUGGESTION = re.compile(r"\b(?:gợi\s*ý|goi\s*y|prompt\s+mẫu|vài\s+prompt|ví\s+dụ\s+prompt)\b")

# Questions about what the assistant or the project can do. Matched on folded text, so unaccented input works.
CAPABILITY_QUESTION = re.compile(
    r"\b(?:co\s+the|lam\s+duoc|dung\s+duoc|giup\s+duoc|ho\s+tro)\b.*\b(?:gi|nao)\b"
    r"|\b(?:thao\s+tac|chuc\s+nang|tinh\s+nang)\b"
)

# "liệt kê topic", "danh sách các topic", "list all topics", "xem danh sách topic"
LIST_TOPICS = re.compile(
    r"\b(?:liệt\s+kê|danh\s+sách|list|xem|các|cho\s+(?:tôi|mình)\s+xem)\s+(?:(?:all|tất\s+cả|các|hiện\s+có)\s+)*"
    r"(?:danh\s+sách\s+)?topics?\b|\btopics?\s+hiện\s+có\b|\bcác\s+topic\b",
    re.IGNORECASE,
)
# Filler that may follow a plain listing request: "liệt kê topic đi được không", "list all topics được không"
LIST_FILLER = re.compile(r"\b(?:đi|được\s+không|được|giúp|với|nhé|ạ|hiện\s+có|cho\s+tôi|cho\s+mình|xem)\b", re.IGNORECASE)


# How-to wording. With a change verb and a roadmap object ("cách thêm bài vào layer", "muốn xóa topic thì làm sao")
# it asks how to use the assistant: the knowledge base holds lessons, not usage docs, so a search finds nothing.
HOW_TO = re.compile(
    r"^(?:cho\s+(?:tôi|mình)\s+hỏi\s+)?(?:cách|các\s+bước|quy\s+trình|hướng\s+dẫn)\s"
    r"|\b(?:cách\s+(?:để|nào)|làm\s+thế\s+nào|như\s+thế\s+nào|thế\s+nào|làm\s+sao|ra\s+sao)\b"
    r"|\bhow\s+(?:do|can|should)\s+(?:i|we|you)\b|\bhow\s+to\b",
    re.IGNORECASE,
)

# "cho mình xem lại cấu trúc các layer", "show me the layers": a request to see roadmap content, answered by search
SHOW_REQUEST = re.compile(r"^(?:cho\s+(?:tôi|mình|em|anh|chị)\s+(?:xem|coi)|show\s+me|hiển\s+thị)\b")

ABOUT_ASSISTANT = re.compile(
    r"^\s*(?:bạn\s+là\s+(?:ai|gì)|bạn\s+tên\s+gì|bạn\s+là\s+bot|who\s+are\s+you"
    r"|bạn\s+có\s+phải\s+(?:là\s+)?(?:ai|bot|người|chatgpt)|bạn\s+do\s+ai\s+(?:tạo|làm|phát\s+triển)"
    r"|ai\s+(?:tạo|làm)\s+ra\s+bạn|bạn\s+có\s+khỏe\s+không|are\s+you\s+(?:an?\s+)?(?:ai|bot|human|chatgpt))\b"
)

# Thanks, alone or with praise: "dạ em cảm ơn anh bot nhiều ạ", "cảm ơn bạn, giải thích nhiệt tình ghê".
# "cảm ơn, giờ giải thích RAG giúp mình" still searches: a search word counts only next to praise.
THANKS = re.compile(r"^\s*(?:dạ\s+)?(?:(?:em|mình|tôi|tui)\s+)?(?:cảm\s+ơn|cám\s+ơn|thanks?|thank\s+you|tks)\b")
PRAISE = re.compile(r"\b(?:nhiệt\s+tình|ghê|đỉnh|tuyệt|hay\s+quá|dễ\s+hiểu|great|awesome)\b")

# Speech-act cues

# Matched against the normalized message, so each phrase goes through the same normalization.
# "lập kế hoạch" alone is not one: "agent lập kế hoạch nhiều bước hoạt động thế nào" is a lesson question.
PLAN_PHRASES = [
    normalize_vietnamese(p).lower()
    for p in ["lập kế hoạch học", "lên kế hoạch học", "xem trước roadmap", "preview plan", "generate roadmap"]
]

SLASH_COMMAND = re.compile(r"^\s*/(plan|goal)\b")


def slash_command(lower: str) -> Optional[str]:
    """"plan" or "goal" for a message that starts with that slash command; anything else goes to the router."""
    match = SLASH_COMMAND.match(lower)
    return match.group(1) if match else None

# A learning plan asked in plain words: a goal ("muốn học", "trở thành", "prepare for", "trong 6 tháng") and a
# plan noun ("lộ trình", "study plan"). Matched on the folded message. "tạo lộ trình X" is a create, not a plan.
LEARNING_PLAN_GOAL = re.compile(
    r"\b(?:muon\s+(?:hoc|tu\s+hoc|di\s+lam|chuyen|tro\s+thanh)|tu\s+hoc|tro\s+thanh|become|master(?:ing)?"
    r"|prepare\s+for|from\s+scratch|step-by-step|certification|chi\s+tiet\s+tung\s+tuan"
    r"|tu\s+(?:can\s+ban|co\s+ban|nhap\s+mon|con\s+so\s+0)"
    r"|trong\s+\d+\s+(?:thang|tuan)|in\s+\d+\s+(?:weeks?|months?))\b"
)
LEARNING_PLAN_NOUN = re.compile(
    r"\b(?:lo\s+trinh|roadmap|ke\s+hoach\s+hoc|khung\s+chuong\s+trinh|study\s+plan|learning\s+(?:path|plan)|plan)\b"
)

# Leading greeting, stripped before checking what follows it ("xin chào bạn, ...", "hi Abot!")
GREETING_PREFIX = re.compile(
    r"^\s*(?:xin\s+)?(?:chào|hi|hello|hey|alo)(?:\s+(?:bạn|abot|bot|em|anh|chị))?\b[\s,!.]*"
)

# A message opening with a greeting or thanks; chitchat only when nothing else in it was understood
GREETING_WORDS = [
    "chào", "hi", "hello", "hey", "alo", "bạn là ai", "bạn giúp được gì", "bạn làm được gì",
    "who are you", "help", "trợ giúp",
    "cảm ơn", "thank", "thanks", "ok", "oke", "tuyệt", "good"
]

# Questions about the user or the conversation so far ("tôi tên gì?", "nãy tôi nói gì?").
# Answered from conversation history in chitchat, never by searching the knowledge base.
_ME = r"(?:tôi|mình|tớ|tao|em|tui)"
CONVERSATION_RECALL = re.compile(
    rf"\b{_ME}\s+tên\s+(?:là\s+)?gì\b"
    rf"|\btên\s+(?:của\s+)?{_ME}\s+(?:là\s+)?gì\b"
    rf"|\b{_ME}\s+là\s+ai\b"
    # The user's own details: "email của tôi là gì?", "sđt mình là bao nhiêu"
    # normalize_vietnamese writes "thọai" (old tone placement), so both spellings are accepted
    rf"|\b(?:e-?mail|mail|sđt|số\s+đt|(?:số\s+)?điện\s+th(?:oạ|ọa)i|địa\s+chỉ|tên|tuổi|nghề|công\s+việc)"
    rf"\s+(?:của\s+)?{_ME}\s+(?:là\s+)?(?:gì|bao\s+nhiêu|ở\s+đâu)\b"
    r"|\bwhat(?:'s|\s+is)\s+my\s+(?:e-?mail|phone(?:\s+number)?|address|job|age)\b"
    rf"|\b(?:có\s+)?nhớ\s+(?:tên\s+)?{_ME}\b"
    rf"|\b(?:lúc\s+nãy|vừa\s+nãy|ban\s+nãy|hồi\s+nãy|nãy\s+giờ|nãy|vừa\s+rồi|trước\s+đó)\s+{_ME}\s+(?:đã\s+|vừa\s+)?(?:nói|hỏi|kể|bảo)\b"
    rf"|\b{_ME}\s+(?:vừa|đã|mới)\s+(?:nói|hỏi|kể|bảo)\s+(?:những\s+)?(?:gì|cái\s+gì)\b"
    # "tôi vừa bảo tôi muốn học công nghệ gì nhỉ": the asked detail sits between the verb and "gì"
    rf"|\b{_ME}\s+(?:vừa|đã|mới)\s+(?:nói|kể|bảo)\s+{_ME}\s+[^?.!]{{0,40}}?\bgì\b"
    r"|\bwhat(?:'s|\s+is)\s+my\s+name\b|\bwho\s+am\s+i\b|\bwhat\s+did\s+i\s+(?:say|ask|tell)\b",
    re.IGNORECASE,
)

# The user giving a personal detail: "email của tôi là cris@example.com", "tên tôi là Taro". Stored in history
# and answered from it, so it is chitchat; without this the LLM router calls it out of scope.
SELF_DISCLOSURE = re.compile(
    rf"^(?:(?:e-?mail|mail|sđt|số\s+đt|(?:số\s+)?điện\s+th(?:oạ|ọa)i|địa\s+chỉ|tên|tuổi|nghề|công\s+việc)"
    rf"\s+(?:của\s+)?{_ME}|{_ME}\s+tên)\s+là\s+\S+",
    re.IGNORECASE,
)

# A self-introduction or a check of it: "tôi là Huy", "tôi là Huy đúng k?". Only a short name, no roadmap word.
IDENTITY_STATEMENT = re.compile(
    rf"^{_ME}\s+(?:tên\s+)?là\s+[\w]+(?:\s+[\w]+){{0,2}}?(?:\s+(?:đúng|phải)(?:\s+(?:k|ko|không|chưa))?)?\s*[?!.]*$",
    re.IGNORECASE,
)

# Search words: a question by themselves ("tìm bài Docker"). "nội dung" is not one: it is the content
# field of a create ("Nội dung: ...")
SEARCH_WORDS = [
    "tìm", "kiếm", "tra cứu", "có bài nào", "danh sách", "liệt kê", "list",
    "giải thích", "hướng dẫn", "là gì", "thế nào", "làm sao", "search", "what is", "how to", "show me", "which",
    "tại sao", "như thế nào", "để làm gì", "dùng để", "khác nhau", "what are", "difference", "differences"
]

# Questions without "?" or a search word: "topic này có mấy bài", "bài Docker nằm ở đâu", "... làm được gì".
# Accented forms run on the normalized text, so "tạo topic về não" (não, not nào) stays a create.
# How-to questions open with "cách" / "các bước" ("cách thêm bài vào layer"); "cách" elsewhere may be a name
# ("tạo topic Cách mạng 4.0"), so mid-sentence only "cách để / cách nào / làm thế nào" counts.
QUESTION_MARKERS = re.compile(
    r"\b(?:có\s+mấy|bao\s+nhiêu|ở\s+đâu|những\s+gì|cái\s+gì|khi\s+nào)\b|\b(?:gì|nào|đâu)(?:\s+(?:thế|vậy|nhỉ|đó|nhé))?\s*[?!.]*$"
    r"|^(?:cho\s+(?:tôi|mình)\s+hỏi\s+)?(?:cách|các\s+bước|quy\s+trình)\s"
    r"|\b(?:cách\s+(?:để|nào)|làm\s+thế\s+nào)\b",
    re.IGNORECASE,
)
QUESTION_MARKERS_FOLDED = re.compile(
    r"\b(?:bao\s+nhieu|nhung\s+gi|cai\s+gi)\b|\bgi(?:\s+(?:the|vay|nhi|do))?\s*[?!.]*$|^(?:cach|cac\s+buoc|quy\s+trinh)\s"
)

# Change verbs, folded. "gỡ" is left out: folded it becomes "go", an English word
CUD_VERB_WORDS = [
    "tạo", "thêm", "xóa", "xoá", "bỏ bớt", "gỡ bỏ", "sửa", "đổi tên", "cập nhật", "hủy", "huỷ", "chuyển", "di chuyển",
    "create", "add", "delete", "remove", "update", "rename", "make", "new", "move",
]
CUD_VERBS = [fold(v) for v in CUD_VERB_WORDS]
# A change verb right before a roadmap noun: "tạo lộ trình Docker từ đầu" creates a topic, it is not a plan request
CREATE_ROADMAP = re.compile(
    rf"\b(?:{'|'.join(re.escape(v) for v in CUD_VERBS)})\s+(?:(?:a|an|new|mot|cai)\s+)?(?:lo\s+trinh|roadmap|topic|chu\s+de)\b"
)
_VERBS_OR = "|".join(re.escape(v) for v in CUD_VERBS)
# A command opens with its verb, optionally after a polite opener ("bạn ơi xóa ...")
IMPERATIVE_START = re.compile(rf"^(?:(?:ban\s+oi|vui\s+long|nho\s+ban|ho\s+minh|giup\s+minh)\s+)?(?:{_VERBS_OR})\b")

# In a command, the object's name: everything after "tên là" and anything quoted
NAMED_PART = re.compile(r"\b(?:tên\s+là|có\s+tên|với\s+tên|named|called)\s+.*$|[\"“'‘`][^\"”'’`]*[\"”'’`]")
# A roadmap object named on its own: an entity word followed by a proper name or a code ("bài Redis Cluster",
# "layer 03-RAG", "topic AI Architecture"). Matched case-sensitively on the normalized message; a lowercase
# phrase after the word ("mục tiêu học tập", "layer dropout") names nothing, so a change from it is previewed.
NAMED_ENTITY = re.compile(
    r"(?i:\b(?:topic|chủ\s+đề|lộ\s+trình|roadmap|layer|mảng(?:\s+kiến\s+thức)?|group|nhóm|item|bài(?:\s+học)?|mục|lesson)s?)"
    r"\s+(?:(?i:mới)\s+)?[A-Z0-9][\w.+#&/-]*"
    # or written before it: "tạo ABC topic", "thêm Redis lesson"
    r"|\b[A-Z0-9][\w.+#&/-]*\s+(?i:topic|layer|group|item|lesson|roadmap)s?\b"
)
# A question word that ends a command: "tạo topic như thế nào", "thêm bài được không"
END_QUESTION = re.compile(
    r"\b(?:gì|nào|đâu|sao|thế\s+nào|bao\s+nhiêu|không|ko|k|chưa)\s*[?!.]*$", re.IGNORECASE
)
END_YES_NO = re.compile(r"\b(?:không|ko|k|chứ)\s*[?!.]*$", re.IGNORECASE)
# English requests asked as a question ("can you add…", "could you please delete…"), on the folded text
EN_POLITE_REQUEST = re.compile(
    r"^(?:(?:hi|hey|hello)[\s,!]+)?(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:add|create|delete|remove|update|rename|move|make)\b"
    r"|^please\s+(?:add|create|delete|remove|update|rename|move|make)\b"
)
REQUEST_CUE = re.compile(r"\b(?:có\s+thể|giúp|nhờ|làm\s+ơn|được)\b", re.IGNORECASE)
# "chưa thì thêm vào", "nếu chưa có ... thì tạo", "chưa có bài X thì thêm": a change that depends on a check (folded)
CONDITIONAL_REQUEST = re.compile(
    r"\b(?:chua|khong)\s+(?:co\s+)?thi\b|\bneu\s+(?:chua|khong)\b|\b(?:chua|khong)\s+co\b.*\bthi\b"
)

# Unaccented input ("tao topic nhu the nao") is read with folded twins of the accented cues. They apply only when
# the whole message has no diacritics: folded, "đầu" (front) reads as "đâu" (where) and "não" as "nào" (which).
HOW_TO_FOLDED = re.compile(
    r"^(?:cho\s+(?:toi|minh)\s+hoi\s+)?(?:cach|cac\s+buoc|quy\s+trinh|huong\s+dan)\s"
    r"|\b(?:cach\s+de|lam\s+the\s+nao|nhu\s+the\s+nao|the\s+nao|lam\s+sao|ra\s+sao)\b"
    r"|\bhow\s+(?:do|can|should)\s+(?:i|we|you)\b|\bhow\s+to\b"
)
END_QUESTION_FOLDED = re.compile(r"\b(?:gi|sao|the\s+nao|bao\s+nhieu|khong|ko|k|chua)\s*[?!.]*$")
END_YES_NO_FOLDED = re.compile(r"\b(?:khong|ko|k|chu)\s*[?!.]*$")
REQUEST_CUE_FOLDED = re.compile(r"\b(?:co\s+the|giup|nho|lam\s+on|duoc)\b")

# Normalization: removed before the message is read. A greeting or thanks still counts (read on the original),
# and a message made only of these is kept as it is.
LEADING_GREETING = re.compile(r"^\s*(?:hi|hello|hey|alo|xin\s+chào|xin\s+chao|chào(?:\s+bạn)?|chao(?:\s+ban)?)\b[\s,!.]*")
LEADING_FILLER = re.compile(r"^\s*(?:ê\s+bạn\s+ơi|e\s+ban\s+oi|pls|please|plz)\b[\s,]*")
# Trailing particles, thanks and emoji. "a" is left out of the unaccented list: it is also a name ("topic A").
# Only emoji are stripped as symbols, so names like "C++" or "C#" keep their ending.
_EMOJI = "[☀-➿\U0001f000-\U0001faff️‍]"
TRAILING_FILLER = re.compile(rf"(?:[\s,]+(?:nhé|nha|ạ|nhỉ|thanks|thank\s+you|thx|pls|please)\b|\s*{_EMOJI}+)+[\s.!]*$")
TRAILING_FILLER_FOLDED = re.compile(rf"(?:[\s,]+(?:nhe|nha|nhi|thanks|thank\s+you|thx|pls|please)\b|\s*{_EMOJI}+)+[\s.!]*$")
# "Việc cần làm: …", "Câu hỏi: …": a short label without a roadmap object, before the request itself
LABEL = re.compile(r"^\s*([^:\n]{1,30}):\s*(?=\S)")

# Write blockers: the message names a change but does not ask for one. Written accented; folded twins are built
# below for unaccented input. A blocked change is never written (write policy: deny).
_VERBS_ACC = "|".join(re.escape(v) for v in CUD_VERB_WORDS)
WRITE_BLOCKER_PATTERNS = {
    # "đừng xóa bài X", "không cần tạo topic Y", "khoan, chưa thêm bài Z vội" (not "chưa có … thì thêm": a condition)
    "negation": rf"\b(?:đừng|không\s+cần|không\s+muốn|thôi\s+không|khoan|chưa)\b(?!\s+(?:thì|có\b[^,]*\bthì)\b)"
                rf"(?:\s+\w+){{0,2}}\s+(?:{_VERBS_ACC})\b",
    # "nếu xóa topic X thì …", "lỡ xóa nhầm bài Y thì …": the change sits inside the "if" part
    "hypothetical": rf"\b(?:nếu|lỡ|giả\s+sử|khi)\b(?:\s+\w+){{0,3}}\s+(?:{_VERBS_ACC})\b.*\bthì\b",
    # "hôm qua tôi đã tạo topic X", "tôi vừa thêm bài Y rồi", "ai đã xóa bài Z"
    "past_report": rf"\b(?:đã|vừa|mới|hôm\s+qua)\b(?:\s+\w+){{0,2}}\s+(?:{_VERBS_ACC})\b|\bai\s+đã\b"
                   rf"|(?:{_VERBS_ACC})\b.*\brồi\s*$",
}
# Questions about command syntax ("cú pháp tạo topic", "lệnh xóa bài là gì"): answered with the help card
SYNTAX_QUESTION = re.compile(r"\b(?:cú\s+pháp|lệnh\s+\w+(?:\s+\w+)?\s+là\s+gì|có\s+giới\s+hạn)\b")
SYNTAX_QUESTION_FOLDED = re.compile(r"\b(?:cu\s+phap|lenh\s+\w+(?:\s+\w+)?\s+la\s+gi|co\s+gioi\s+han)\b")
WRITE_BLOCKERS = {name: re.compile(p, re.IGNORECASE) for name, p in WRITE_BLOCKER_PATTERNS.items()}
# Folded twins. fold() lowercases, so these patterns use only lowercase escapes (\b \s \w), never \S or \W
WRITE_BLOCKERS_FOLDED = {name: re.compile(fold(p)) for name, p in WRITE_BLOCKER_PATTERNS.items()}

# ── 3. Decision table ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class Row:
    """One routing rule. Empty act / target / needs match anything; the first matching row decides.

    intent None leaves the message undecided: the LLM router reads it, and `write` still binds the result.
    """

    name: str
    intent: Optional[IntentType]
    confidence: float
    act: Optional[SpeechAct | tuple[SpeechAct, ...]] = None
    target: Optional[Target] = None
    # a cue the message must also have: search_word | known_title | opens_with_greeting | write_blocker
    needs: Optional[str] = None
    write: str = "none"          # see section 4


DECISION_TABLE: tuple[Row, ...] = (
    Row("plan", IntentType.PLAN_GOAL, 0.98, act=SpeechAct.PLAN),
    Row("off_topic", IntentType.OUT_OF_SCOPE, 0.90, target=Target.OFF_TOPIC),
    # Greetings, the user's own details and questions about the assistant are answered from the conversation
    Row("greeting", IntentType.CHITCHAT, 0.95, act=SpeechAct.GREETING),
    Row("recall", IntentType.CHITCHAT, 0.90, act=SpeechAct.RECALL),
    Row("about_assistant", IntentType.CHITCHAT, 0.90, target=Target.ASSISTANT),
    # Names a change without asking for one ("đừng xóa…", "lỡ xóa nhầm… thì…", "đã tạo…"): never written,
    # whatever the LLM router later says
    Row("blocked_change", None, 0.0, act=(SpeechAct.COMMAND, SpeechAct.REQUEST), needs="write_blocker", write="deny"),
    # A change asked politely or on a condition runs only after the user confirms the preview
    Row("change_request", IntentType.ROADMAP_CUD, 0.85, act=SpeechAct.REQUEST, write="confirm"),
    # A verb needs an object from the roadmap: "xóa nó đi" or "Xóa." alone is not a change request
    Row("change_command", IntentType.ROADMAP_CUD, 0.95, act=SpeechAct.COMMAND, target=Target.ROADMAP, write="allow"),
    # A search word ("là gì", "tìm") is a search by itself; a weak question marker ("?", trailing "k") also
    # needs roadmap content or a known lesson title, else the message goes to the LLM router
    Row("search_word", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, needs="search_word"),
    Row("roadmap_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP),
    Row("known_title_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, needs="known_title"),
    # "cách tạo topic trong Kafka", "mạng nơ-ron dùng thế nào": a how-to about no roadmap object is a lesson question
    Row("how_to_question", IntentType.KNOWLEDGE_QUERY, 0.85, act=SpeechAct.QUESTION, target=Target.NONE, needs="how_to"),
    # "cho mình xem lại toàn bộ cấu trúc các layer": seeing roadmap content, not changing it
    Row("show_request", IntentType.KNOWLEDGE_QUERY, 0.85, target=Target.ROADMAP, needs="show_request"),
    Row("greeting_opener", IntentType.CHITCHAT, 0.95, needs="opens_with_greeting"),
)

# ── 4. Write policy ─────────────────────────────────────────────────────────
# Every path to the database goes through write_gate.py, which returns one of:
WRITE_NONE = "none"        # not a change
WRITE_ALLOW = "allow"      # the change runs
WRITE_CONFIRM = "confirm"  # a preview card first; runs on "ok"
WRITE_DENY = "deny"        # never runs; the user gets a reply saying why

# A change only the LLM router chose (no heuristic row) needs this confidence, plus a change verb and an object
CUD_MIN_CONFIDENCE = 0.8
# A single delete skips the preview card only when the message says to do it now
IMMEDIATE_DELETE_WORDS = ("ngay", "immediately", "luôn")

# ── 5. LLM router examples and clause split ────────────────────────────────

# Messages the LLM router gets wrong without an example: questions without "?" are never changes.
ROUTER_EXAMPLES = [
    ("có thể thao tác gì ở dự án này", "CHITCHAT"),
    ("topic AI có mấy bài", "KNOWLEDGE_QUERY"),
    ("Docker Compose dùng để làm gì", "KNOWLEDGE_QUERY"),
    ("Kafka", "KNOWLEDGE_QUERY"),
    ("Redis Streams", "KNOWLEDGE_QUERY"),
    ("tạo topic Machine Learning", "ROADMAP_CUD"),
    ("xóa nó đi (sau khi vừa nói về bài Kafka)", "ROADMAP_CUD"),
    ("lập kế hoạch học backend trong 3 tháng", "PLAN_GOAL"),
    ("giá vàng hôm nay", "OUT_OF_SCOPE"),
    ("abc xyz", "UNCLEAR"),
]

# Clause joiners used to spot several requests in one message ("tìm bài A rồi tạo topic B").
# - A continuation ("…, nếu không thì tạo …", "…, chưa thì thêm vào") stays with the clause before it: the change
#   depends on that check, so it is one conditional request, not two steps.
# - "và" / "and" / "rồi" split only before a verb: "bài về Docker và Kafka" is one search, "tôi đã thêm bài X rồi"
#   ends a sentence.
_CLAUSE_VERBS = "|".join(
    re.escape(v) for v in sorted({*CUD_VERB_WORDS, *CUD_VERBS, "tìm", "tim", "liệt kê", "liet ke", "tra cứu",
                                  "tra cuu", "xem", "giải thích", "giai thich", "list", "find", "search"}, key=len, reverse=True)
)
MIXED_INTENT_SPLIT = re.compile(
    rf"\s*(?:[;\n]|,(?!\s*(?:chưa|chua|không|khong|nếu\s+(?:chưa|không)|neu\s+(?:chua|khong))\b)"
    rf"|\b(?:rồi|roi|và|va|and|then)\s+(?=(?:{_CLAUSE_VERBS})\b)|\bsau\s+(?:đó|do)\b|\bà\s+mà\b)\s*",
    re.IGNORECASE,
)
# Rows whose clause is not a request of its own: a greeting or thanks around another request does not make two
COMMENTARY_ROWS = frozenset({"greeting", "greeting_opener", "recall"})
