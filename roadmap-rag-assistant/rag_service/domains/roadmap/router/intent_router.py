"""Fast Intent Router — routes user messages to the appropriate subsystem.

Subsystems:
- ROADMAP_CUD: Structured CUD Extractor & Executor
- KNOWLEDGE_QUERY: Real Hybrid RAG Engine (search existing topics/layers/items/lessons)
- PLAN_GOAL: Autonomous blueprint generation / preview
- CHITCHAT: Conversational assistant greetings and help
"""

from __future__ import annotations

import re
from typing import Callable, Optional

from rag_service.llm_breaker import llm_breaker
from rag_service.domains.roadmap.router.schemas import IntentClassificationResult, IntentType
from rag_service.domains.roadmap.retrieval.relevance import content_words, fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese


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

OFF_TOPIC_STRONG_HINTS = [
    "bài thơ", "viết thơ", "truyện", "tin tức", "poem", "romantic", "joke", "câu chuyện cười",
    "kể chuyện", "dịch giúp", "dịch đoạn", "translate",
]

# Matched against the normalized message, so each phrase goes through the same normalization
PLAN_PHRASES = [
    normalize_vietnamese(p).lower() for p in ["lập kế hoạch", "xem trước roadmap", "preview plan", "generate roadmap"]
]

# Leading greeting, stripped before checking what follows it ("xin chào bạn, ...", "hi Abot!")
GREETING_PREFIX = re.compile(
    r"^\s*(?:xin\s+)?(?:chào|hi|hello|hey|alo)(?:\s+(?:bạn|abot|bot|em|anh|chị))?\b[\s,!.]*"
)

# Questions about the user or the conversation so far ("tôi tên gì?", "nãy tôi nói gì?").
# Answered from conversation history in chitchat, never by searching the knowledge base.
_ME = r"(?:tôi|mình|tớ|tao|em)"
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
    rf"|\b(?:lúc\s+nãy|vừa\s+nãy|ban\s+nãy|nãy\s+giờ|nãy|vừa\s+rồi|trước\s+đó)\s+{_ME}\s+(?:đã\s+|vừa\s+)?(?:nói|hỏi|kể|bảo)\b"
    rf"|\b{_ME}\s+(?:vừa|đã|mới)\s+(?:nói|hỏi|kể|bảo)\s+(?:những\s+)?(?:gì|cái\s+gì)\b"
    r"|\bwhat(?:'s|\s+is)\s+my\s+name\b|\bwho\s+am\s+i\b|\bwhat\s+did\s+i\s+(?:say|ask|tell)\b",
    re.IGNORECASE,
)

# A self-introduction or a check of it: "tôi là Huy", "tôi là Huy đúng k?". Only a short name, no roadmap word.
IDENTITY_STATEMENT = re.compile(
    rf"^{_ME}\s+(?:tên\s+)?là\s+[\w]+(?:\s+[\w]+){{0,2}}?(?:\s+(?:đúng|phải)(?:\s+(?:k|ko|không|chưa))?)?\s*[?!.]*$",
    re.IGNORECASE,
)

# Clause joiners used to spot several requests in one message.
MIXED_INTENT_SPLIT = re.compile(r"\s*(?:[,;\n]|\brồi\b|\bsau\s+đó\b|\bvà\b|\bthen\b|\band\b)\s*", re.IGNORECASE)


class IntentRouter:
    """Fast Intent Classifier with deterministic heuristics and LLM fallback."""

    def __init__(
        self, llm_model: Optional[object] = None, vocabulary: Optional[Callable[[], set[str]]] = None
    ) -> None:
        self._llm = llm_model
        # Folded words of every lesson/layer/topic title; a statement naming one is a knowledge question
        self._vocabulary = vocabulary

    def names_known_lesson(self, text: str) -> bool:
        """True when the message shares a content word with a roadmap title ("LLM chấm điểm ..." -> LLM-as-a-Judge)."""
        if self._vocabulary is None:
            return False
        return bool(content_words(text) & self._vocabulary())

    def classify_heuristics(self, text: str) -> Optional[IntentClassificationResult]:
        """Perform sub-5ms heuristic classification on clear-cut syntax and keywords."""
        norm_text = normalize_vietnamese(text)
        lower = norm_text.lower().strip()

        # 1. Plan / Goal mode
        if any(lower.startswith(p) for p in ["/plan", "/goal"]) or any(
            k in lower for k in PLAN_PHRASES
        ):
            return IntentClassificationResult(
                intent=IntentType.PLAN_GOAL,
                confidence=0.98,
                needs_cud_extraction=False,
            )

        # 1b. Off-topic guardrail: clearly unrelated subjects without any roadmap entity word
        # Keyword matching runs on the folded text, so "xoa bai" and "xóa bài" are the same request
        flat = fold(lower)
        has_roadmap_entity = any(
            re.search(rf"\b{pat}\b", flat)
            for pat in [r"topics?c*", r"chu\s+de", r"lo\s+trinh", r"roadmaps?", r"layers?r*",
                        r"mang", r"groups?", r"nhom", r"items?m*", r"bai", r"muc", r"lessons?"]
        )
        # Creative writing and news cues ("bài thơ") use "bài", a roadmap word too, so they skip the entity check
        def _has_hint(hints: list[str]) -> bool:
            return any(re.search(rf"\b{re.escape(fold(h))}\b", flat) for h in hints)

        if _has_hint(OFF_TOPIC_STRONG_HINTS) or (not has_roadmap_entity and _has_hint(OFF_TOPIC_HINTS)):
            return IntentClassificationResult(
                intent=IntentType.OUT_OF_SCOPE,
                confidence=0.90,
                needs_cud_extraction=False,
            )

        # 1c. Prompt suggestions ("gợi ý", "prompt mẫu") are chitchat-style help, not a search.
        # "gợi ý bài về X" still searches, so a topic qualifier ("về") keeps it on the knowledge path.
        if re.search(r"\b(?:gợi\s*ý|goi\s*y|prompt\s+mẫu|vài\s+prompt|ví\s+dụ\s+prompt)\b", lower) and not re.search(r"\bvề\b", lower):
            return IntentClassificationResult(
                intent=IntentType.CHITCHAT,
                confidence=0.9,
                needs_cud_extraction=False,
            )

        # 1d. Recall of the user or earlier turns is chitchat: the answer is in the history, not the KB.
        if CONVERSATION_RECALL.search(lower) or (not has_roadmap_entity and IDENTITY_STATEMENT.match(lower)):
            return IntentClassificationResult(
                intent=IntentType.CHITCHAT,
                confidence=0.9,
                needs_cud_extraction=False,
            )

        # 1e. A greeting alone, or a greeting followed by a question about the assistant
        # ("Xin chào, bạn là ai?"), is chitchat, even with a "?"
        rest = GREETING_PREFIX.sub("", lower, count=1)
        if rest != lower and not rest.strip(" ?!.,"):
            return IntentClassificationResult(
                intent=IntentType.CHITCHAT,
                confidence=0.95,
                needs_cud_extraction=False,
            )
        if re.search(r"^\s*(?:bạn\s+là\s+(?:ai|gì)|bạn\s+tên\s+gì|bạn\s+là\s+bot|who\s+are\s+you)\b", rest):
            return IntentClassificationResult(
                intent=IntentType.CHITCHAT,
                confidence=0.9,
                needs_cud_extraction=False,
            )

        # 2. Knowledge query / Search patterns (checked first to avoid capturing questions like "hướng dẫn xóa topic")
        query_indicators = [
            # "nội dung" is not a question marker: it is the content field of a create ("Nội dung: ...")
            "tìm", "kiếm", "tra cứu", "có bài nào", "danh sách", "liệt kê", "list",
            "giải thích", "hướng dẫn", "là gì", "thế nào", "làm sao", "search", "what is", "how to", "show me", "which",
            "tại sao", "như thế nào"
        ]
        has_query = any(re.search(rf"\b{re.escape(fold(q))}\b", flat) for q in query_indicators)
        # Trailing "không / k / ko" marks a yes-no question only as a separate word ("có bài Docker k"),
        # so words like "ok" or "check" are not questions.
        is_question = has_query or "?" in lower or bool(re.search(r"\s(?:không|k|ko)$", lower))

        # 3. Strong CUD verbs + entity keywords (typo-tolerant and bare imperative support)
        # "gỡ" is left out: folded it becomes "go", an English word
        cud_verbs = [
            fold(v) for v in [
                "tạo", "thêm", "xóa", "xoá", "sửa", "đổi tên", "cập nhật", "hủy", "huỷ", "chuyển", "di chuyển",
                "create", "add", "delete", "remove", "update", "rename", "make", "new", "move",
            ]
        ]
        entity_patterns = [
            r"topics?c*", r"chu\s+de", r"lo\s+trinh", r"roadmaps?",
            r"layers?r*", r"mang(?:\s+kien\s+thuc)?",
            r"groups?", r"nhom",
            r"items?m*", r"bai(?:\s+hoc)?", r"muc", r"lessons?"
        ]

        has_verb = any(re.search(rf"\b{re.escape(v)}\b", flat) for v in cud_verbs)
        has_entity = any(re.search(rf"\b{pat}\b", flat) for pat in entity_patterns)
        verbs_or = "|".join(re.escape(v) for v in cud_verbs)
        starts_with_cud = bool(
            re.search(
                rf"^(?:(?:ban\s+oi|vui\s+long|nho\s+ban|ho\s+minh|giup\s+minh)\s+)?(?:{verbs_or})\b",
                flat,
            )
        )

        # A verb needs an object from the roadmap: "xóa nó đi" or "Xóa." alone is not a change request
        if not is_question and has_entity and (has_verb or starts_with_cud):
            return IntentClassificationResult(
                intent=IntentType.ROADMAP_CUD,
                confidence=0.95,
                needs_cud_extraction=True,
            )

        # A question word ("là gì", "tìm") is a search by itself. A weak marker alone ("?", trailing "k")
        # is not: the message must also name roadmap content, else it goes on to the vocabulary check and the LLM router.
        if is_question and (has_query or has_entity or self.names_known_lesson(text)):
            return IntentClassificationResult(
                intent=IntentType.KNOWLEDGE_QUERY,
                confidence=0.90,
                needs_cud_extraction=False,
            )

        # 4. Chitchat / Greetings
        greetings = [
            "chào", "hi", "hello", "hey", "alo", "bạn là ai", "bạn giúp được gì", "bạn làm được gì",
            "who are you", "help", "trợ giúp",
            "cảm ơn", "thank", "thanks", "ok", "oke", "tuyệt", "good"
        ]
        if any(re.search(rf"^\s*{re.escape(g)}\b", lower) for g in greetings):
            return IntentClassificationResult(
                intent=IntentType.CHITCHAT,
                confidence=0.95,
                needs_cud_extraction=False,
            )

        return None

    def mixed_intent_steps(self, text: str) -> list[str]:
        """Search and change clauses in message order when both are asked at once ("tìm bài A rồi tạo topic B"), else []."""
        parts = [p.strip() for p in MIXED_INTENT_SPLIT.split(text) if p.strip()]
        if len(parts) < 2:
            return []
        wanted = {IntentType.KNOWLEDGE_QUERY, IntentType.ROADMAP_CUD}
        steps = [(p, res.intent) for p in parts if (res := self.classify_heuristics(p)) is not None and res.intent in wanted]
        if {intent for _, intent in steps} != wanted:
            return []
        return [p for p, _ in steps]

    def has_mixed_intents(self, text: str) -> bool:
        """True when joined clauses ask for both a search and a roadmap change."""
        return bool(self.mixed_intent_steps(text))

    async def aclassify(self, text: str) -> IntentClassificationResult:
        """Classify message intent, falling back to LLM structured output if ambiguous."""
        return (await self.aroute(text))[0]

    async def aroute(self, text: str) -> tuple[IntentClassificationResult, str]:
        """Classify and say how it was decided: heuristic | llm | llm_error | rate_limited | default."""
        quick = self.classify_heuristics(text)
        if quick is not None:
            return quick, "heuristic"
        # A statement without a question word ("LLM chấm điểm câu trả lời của chính nó") that names a known
        # title is a knowledge question; the LLM router tends to call it out of scope.
        if self.names_known_lesson(text):
            return IntentClassificationResult(
                intent=IntentType.KNOWLEDGE_QUERY, confidence=0.8, needs_cud_extraction=False
            ), "vocabulary"

        method = "default"
        if self._llm is not None and llm_breaker.is_open:
            method = "rate_limited"
        elif self._llm is not None:
            method = "llm_error"
            try:
                structured_llm = self._llm.with_structured_output(IntentClassificationResult)
                prompt = (
                    "Phân loại ý định của người dùng trong hệ thống quản lý Roadmap:\n"
                    "- ROADMAP_CUD: khi người dùng muốn tạo, thêm, sửa, xóa topic/layer/group/item\n"
                    "- KNOWLEDGE_QUERY: khi người dùng hỏi về kiến thức, tìm kiếm bài học, tra cứu roadmap hiện có\n"
                    "- PLAN_GOAL: khi người dùng muốn lập kế hoạch hoặc sinh lộ trình trọn gói\n"
                    "- CHITCHAT: chào hỏi, cảm ơn, hỏi thông tin trợ lý\n"
                    "- OUT_OF_SCOPE: nội dung không liên quan đến roadmap/topic/layer/bài học (thời tiết, tài chính, giải trí, lập trình chung...)\n\n"
                    f"Tin nhắn: \"{text}\""
                )
                res = await structured_llm.ainvoke(prompt)
                if isinstance(res, IntentClassificationResult):
                    return res, "llm"
            except Exception as exc:
                print(f"[IntentRouter] LLM classification error: {exc}")
                llm_breaker.record_failure(exc)

        # Default fallback
        return IntentClassificationResult(
            intent=IntentType.CHITCHAT,
            confidence=0.5,
            needs_cud_extraction=False,
        ), method
