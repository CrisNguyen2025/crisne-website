"""Fast Intent Router — routes user messages to the appropriate subsystem.

Subsystems:
- ROADMAP_CUD: Structured CUD Extractor & Executor
- KNOWLEDGE_QUERY: Real Hybrid RAG Engine (search existing topics/layers/items/lessons)
- PLAN_GOAL: Autonomous blueprint generation / preview
- CHITCHAT: Conversational assistant greetings and help
"""

from __future__ import annotations

import re
from typing import Optional

from rag_service.llm_breaker import llm_breaker
from rag_service.router.schemas import IntentClassificationResult, IntentType
from rag_service.router.vietnamese import normalize_vietnamese


# Subjects clearly outside the roadmap domain. Matched only when no roadmap entity word is present.
OFF_TOPIC_HINTS = [
    "thời tiết", "dự báo thời tiết", "giá vàng", "tỷ giá", "tỉ giá", "chứng khoán", "bitcoin", "crypto",
    "bóng đá", "tỷ số", "tỉ số", "phim", "bài hát", "nấu ăn", "công thức nấu", "du lịch",
    "weather", "stock price", "football score", "recipe",
    # Business records live outside the roadmap database
    "hợp đồng", "hóa đơn", "công nợ", "doanh thu", "bảng lương", "chấm công",
]

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

# Clause joiners used to spot several requests in one message.
MIXED_INTENT_SPLIT = re.compile(r"\s*(?:[,;]|\brồi\b|\bsau\s+đó\b|\bvà\b|\bthen\b|\band\b)\s*", re.IGNORECASE)


class IntentRouter:
    """Fast Intent Classifier with deterministic heuristics and LLM fallback."""

    def __init__(self, llm_model: Optional[object] = None) -> None:
        self._llm = llm_model

    def classify_heuristics(self, text: str) -> Optional[IntentClassificationResult]:
        """Perform sub-5ms heuristic classification on clear-cut syntax and keywords."""
        norm_text = normalize_vietnamese(text)
        lower = norm_text.lower().strip()

        # 1. Plan / Goal mode
        if any(lower.startswith(p) for p in ["/plan", "/goal"]) or any(
            k in lower for k in ["lập kế hoạch", "xem trước roadmap", "preview plan", "generate roadmap"]
        ):
            return IntentClassificationResult(
                intent=IntentType.PLAN_GOAL,
                confidence=0.98,
                needs_cud_extraction=False,
            )

        # 1b. Off-topic guardrail: clearly unrelated subjects without any roadmap entity word
        has_roadmap_entity = any(
            re.search(rf"\b{pat}\b", lower)
            for pat in [r"topics?c*", r"chủ\s+đề", r"lộ\s+trình", r"roadmaps?", r"layers?r*",
                        r"mảng", r"groups?", r"nhóm", r"items?m*", r"bài", r"mục", r"lessons?"]
        )
        if not has_roadmap_entity and any(hint in lower for hint in OFF_TOPIC_HINTS):
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
        if CONVERSATION_RECALL.search(lower):
            return IntentClassificationResult(
                intent=IntentType.CHITCHAT,
                confidence=0.9,
                needs_cud_extraction=False,
            )

        # 1e. Questions about the assistant itself ("bạn là ai?") are chitchat, even with a "?"
        if re.search(r"^\s*(?:bạn\s+là\s+(?:ai|gì)|bạn\s+tên\s+gì|bạn\s+là\s+bot|who\s+are\s+you)\b", lower):
            return IntentClassificationResult(
                intent=IntentType.CHITCHAT,
                confidence=0.9,
                needs_cud_extraction=False,
            )

        # 2. Knowledge query / Search patterns (checked first to avoid capturing questions like "hướng dẫn xóa topic")
        query_indicators = [
            "tìm", "kiếm", "tra cứu", "có bài nào", "nội dung", "danh sách", "liệt kê", "list",
            "giải thích", "hướng dẫn", "là gì", "thế nào", "làm sao", "search", "what is", "how to", "show me", "which",
            "tại sao", "như thế nào"
        ]
        has_query = any(re.search(rf"\b{re.escape(q)}\b", lower) for q in query_indicators)
        # Trailing "không / k / ko" marks a yes-no question only as a separate word ("có bài Docker k"),
        # so words like "ok" or "check" are not questions.
        is_question = has_query or "?" in lower or bool(re.search(r"\s(?:không|k|ko)$", lower))

        # 3. Strong CUD verbs + entity keywords (typo-tolerant and bare imperative support)
        cud_verbs = [
            "tạo", "thêm", "xóa", "xoá", "sửa", "đổi tên", "cập nhật", "gỡ", "hủy", "huỷ",
            "create", "add", "delete", "remove", "update", "rename", "make", "new"
        ]
        entity_patterns = [
            r"topics?c*", r"chủ\s+đề", r"lộ\s+trình", r"roadmaps?",
            r"layers?r*", r"mảng(?:\s+kiến\s+thức)?",
            r"groups?", r"nhóm",
            r"items?m*", r"bài(?:\s+học)?", r"mục", r"lessons?"
        ]

        has_verb = any(re.search(rf"\b{re.escape(v)}\b", lower) for v in cud_verbs)
        has_entity = any(re.search(rf"\b{pat}\b", lower) for pat in entity_patterns)
        verbs_or = "|".join(re.escape(v) for v in cud_verbs)
        starts_with_cud = bool(
            re.search(
                rf"^(?:(?:bạn\s+ơi|vui\s+lòng|nhờ\s+bạn|hộ\s+mình|giúp\s+mình)\s+)?(?:{verbs_or})\b",
                lower,
            )
        )

        if not is_question and ((has_verb and has_entity) or starts_with_cud):
            return IntentClassificationResult(
                intent=IntentType.ROADMAP_CUD,
                confidence=0.95,
                needs_cud_extraction=True,
            )

        if is_question:
            return IntentClassificationResult(
                intent=IntentType.KNOWLEDGE_QUERY,
                confidence=0.90,
                needs_cud_extraction=False,
            )

        # 4. Chitchat / Greetings
        greetings = [
            "chào", "hi", "hello", "hey", "alo", "bạn là ai", "who are you", "help", "trợ giúp",
            "cảm ơn", "thank", "thanks", "ok", "oke", "tuyệt", "good"
        ]
        if any(re.search(rf"^\s*{re.escape(g)}\b", lower) for g in greetings):
            return IntentClassificationResult(
                intent=IntentType.CHITCHAT,
                confidence=0.95,
                needs_cud_extraction=False,
            )

        return None

    def has_mixed_intents(self, text: str) -> bool:
        """True when joined clauses ask for both a search and a roadmap change ("tìm bài A rồi tạo topic B")."""
        parts = [p for p in MIXED_INTENT_SPLIT.split(text) if p.strip()]
        if len(parts) < 2:
            return False
        intents = {res.intent for p in parts if (res := self.classify_heuristics(p)) is not None}
        return {IntentType.KNOWLEDGE_QUERY, IntentType.ROADMAP_CUD} <= intents

    async def aclassify(self, text: str) -> IntentClassificationResult:
        """Classify message intent, falling back to LLM structured output if ambiguous."""
        return (await self.aroute(text))[0]

    async def aroute(self, text: str) -> tuple[IntentClassificationResult, str]:
        """Classify and say how it was decided: heuristic | llm | llm_error | rate_limited | default."""
        quick = self.classify_heuristics(text)
        if quick is not None:
            return quick, "heuristic"

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
