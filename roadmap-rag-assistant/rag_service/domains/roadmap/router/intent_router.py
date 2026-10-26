"""Fast Intent Router — routes user messages to the appropriate subsystem.

Two stages: understanding.py reads the message's speech act and target; classify_heuristics maps
act × target to an intent. Messages it cannot map go to the vocabulary check, then the LLM router.

Subsystems:
- ROADMAP_CUD: Structured CUD Extractor & Executor
- KNOWLEDGE_QUERY: Real Hybrid RAG Engine (search existing topics/layers/items/lessons)
- PLAN_GOAL: Autonomous blueprint generation / preview
- CHITCHAT: Conversational assistant greetings and help
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional, Sequence

from rag_service.llm_breaker import llm_breaker
from rag_service.llm_keys import invoke_structured, missed_structure
from rag_service.domains.roadmap.router.schemas import IntentClassificationResult, IntentType
from rag_service.domains.roadmap.retrieval.relevance import content_words
from rag_service.domains.roadmap.router.policy import (
    ANAPHORA_REF,
    ANAPHORA_REF_EN,
    COMMENTARY_ROWS,
    DECISION_TABLE,
    MIXED_INTENT_SPLIT,
    ROUTER_EXAMPLES,
    WRITE_CONFIRM,
    WRITE_NONE,
    Row,
)
from rag_service.domains.roadmap.router.understanding import Understanding, understand


@dataclass(frozen=True)
class Decision:
    """The heuristic router's answer for one message, with the reasons a person needs to recheck it.

    intent None means undecided: the vocabulary check and then the LLM router take over.
    """

    intent: Optional[IntentType]
    confidence: float
    write: str                 # policy section 4: none | allow | confirm | deny
    row: Optional[str]         # the decision-table row that matched
    understanding: Understanding

    @property
    def rules(self) -> list[str]:
        """Row, axes and cues behind the decision, in the order a person reads them."""
        u = self.understanding
        cues = [name for name, on in (
            ("change_verb", u.has_change_verb), ("object", u.has_object), ("search_word", u.has_search_word),
            ("usage", u.asks_usage), ("greeting_opener", u.opens_with_greeting),
        ) if on]
        if u.write_blocker:
            cues.append(f"blocker={u.write_blocker}")
        return [f"row={self.row or '-'}", f"act={u.act.value}", f"target={u.target.value}", *cues]

    def to_result(self) -> Optional[IntentClassificationResult]:
        if self.intent is None:
            return None
        return IntentClassificationResult(
            intent=self.intent,
            confidence=self.confidence,
            needs_cud_extraction=self.intent == IntentType.ROADMAP_CUD,
            needs_confirmation=self.write == WRITE_CONFIRM,
        )

    def snapshot(self) -> dict:
        """Plain fields for evals/router/decisions.jsonl."""
        if self.intent is None:
            return {"route": "undecided", "write": self.write, "rules": self.rules}
        return {
            "route": self.intent.value,
            "confirm": self.write == WRITE_CONFIRM,
            "confidence": self.confidence,
            "write": self.write,
            "rules": self.rules,
        }


def build_router_prompt(text: str, history: Sequence[Any] = ()) -> str:
    """Prompt for the LLM router: labels, rules, examples, then the recent conversation and the message."""
    examples = "\n".join(f'- "{msg}" → {label}' for msg, label in ROUTER_EXAMPLES)
    turns = "\n".join(f"{t.role}: {t.content}" for t in history) or "(chưa có)"
    return (
        "Phân loại ý định của người dùng trong hệ thống quản lý Roadmap:\n"
        "- ROADMAP_CUD: người dùng RA LỆNH tạo, thêm, sửa, xóa, chuyển một topic/layer/group/item cụ thể\n"
        "- KNOWLEDGE_QUERY: hỏi về kiến thức, tìm kiếm bài học, tra cứu roadmap hiện có\n"
        "- PLAN_GOAL: muốn lập kế hoạch hoặc sinh lộ trình trọn gói\n"
        "- CHITCHAT: chào hỏi, cảm ơn, hỏi trợ lý/dự án làm được gì, cách dùng\n"
        "- OUT_OF_SCOPE: không liên quan đến roadmap/topic/layer/bài học (thời tiết, tài chính, giải trí, lập trình chung...)\n"
        "Phân biệt theo CHỦ ĐỀ được hỏi (bỏ khung câu như 'bạn có biết thông tin về', 'cho mình hỏi'):\n"
        "  - chủ đề thuộc lĩnh vực của roadmap (AI, LLM, RAG, MLOps…), kể cả khi roadmap chưa có bài → KNOWLEDGE_QUERY\n"
        "  - chủ đề thuộc lĩnh vực khác (ứng dụng, mạng xã hội, đời sống, tài chính, phần mềm văn phòng…) → OUT_OF_SCOPE\n"
        "- UNCLEAR: không đủ thông tin để biết người dùng muốn gì\n\n"
        "Quy tắc:\n"
        "- Câu hỏi (kể cả không có dấu \"?\", ví dụ kết thúc bằng \"gì\", \"nào\", \"không\") KHÔNG BAO GIỜ là ROADMAP_CUD.\n"
        "- ROADMAP_CUD cần một động từ thay đổi và đối tượng rõ ràng (từ tin nhắn hoặc hội thoại trước).\n"
        "- Một tên công nghệ, khái niệm hay bài học đứng một mình (\"Kafka\", \"RAG\") là KNOWLEDGE_QUERY: người dùng muốn tra cứu nó.\n"
        "- UNCLEAR chỉ dành cho tin nhắn không đọc được ý nào (ký tự ngẫu nhiên, đại từ trơn như \"cái đó\" khi chưa có hội thoại).\n"
        "- Phân vân giữa ROADMAP_CUD và nhãn khác: chọn nhãn khác hoặc UNCLEAR, vì ROADMAP_CUD ghi vào dữ liệu.\n"
        "- confidence: mức chắc chắn từ 0.0 đến 1.0.\n\n"
        f"Ví dụ:\n{examples}\n\n"
        f"Hội thoại gần đây:\n{turns}\n\n"
        f"Tin nhắn: \"{text}\""
    )


class IntentRouter:
    """Fast Intent Classifier with deterministic heuristics and LLM fallback."""

    def __init__(
        self, llm_model: Optional[object] = None, vocabulary: Optional[Callable[[], set[str]]] = None
    ) -> None:
        self._llm = llm_model
        # Folded words of every lesson/layer/topic title; a statement naming one is a knowledge question
        self._vocabulary = vocabulary
        # Is a name a topic or layer of the roadmap? (Catalog.has_place; set by route_decision when it has one)
        self.known_place: Optional[Callable[[str], bool]] = None

    def names_known_lesson(self, text: str) -> bool:
        """True when the message shares a content word with a roadmap title ("LLM chấm điểm ..." -> LLM-as-a-Judge)."""
        if self._vocabulary is None:
            return False
        return bool(content_words(text) & self._vocabulary())

    def understand(self, text: str) -> Understanding:
        """The two axes of the message: speech act and target (understanding.py)."""
        return understand(text, self.known_place)

    def _matches(self, row: Row, u: Understanding, text: str) -> bool:
        if row.act is not None and u.act not in (row.act if isinstance(row.act, tuple) else (row.act,)):
            return False
        if row.target is not None and u.target != row.target:
            return False
        if row.needs == "search_word":
            return u.has_search_word
        if row.needs == "opens_with_greeting":
            return u.opens_with_greeting
        if row.needs == "write_blocker":
            return u.write_blocker is not None
        if row.needs == "advice":
            return u.advice
        if row.needs == "how_to":
            return u.how_to
        if row.needs == "show_request":
            return u.show_request
        if row.needs == "known_title":  # checked last: it reads the title vocabulary
            return self.names_known_lesson(text)
        return row.needs is None

    def decide(self, text: str) -> Decision:
        """Apply the policy decision table (policy.py section 3) to the message's act × target. Sub-5ms, no LLM."""
        u = understand(text, self.known_place)
        decision = next(
            (Decision(row.intent, row.confidence, row.write, row.name, u)
             for row in DECISION_TABLE if self._matches(row, u, text)),
            Decision(None, 0.0, WRITE_NONE, None, u),
        )
        if decision.intent != IntentType.ROADMAP_CUD:
            return decision
        # A change must come from one clause: "xóa layer X có ảnh hưởng gì không, rồi tìm bài Y" reads as a command
        # whole, but neither clause asks for a change. Then the first clause with an intent decides.
        parts = [p.strip() for p in MIXED_INTENT_SPLIT.split(text) if p and p.strip()]
        if len(parts) < 2:
            return decision
        clauses = [self.decide(p) for p in parts]
        if any(c.intent == IntentType.ROADMAP_CUD for c in clauses):
            return decision
        first = next((c for c in clauses if c.intent is not None), None)
        if first is None:
            return Decision(None, 0.0, WRITE_NONE, "change_not_in_any_clause", u)
        return Decision(first.intent, first.confidence, first.write, f"clause:{first.row}", u)

    def classify_heuristics(self, text: str) -> Optional[IntentClassificationResult]:
        """The heuristic decision as a classification result, or None to leave the message to the LLM router."""
        return self.decide(text).to_result()

    def mixed_intent_steps(self, text: str) -> list[str]:
        """The request clauses, in message order, when one message asks for several things, else [].

        Several = two or more clauses with their own intent, at least one of them a change or of different kinds
        ("tìm bài A rồi tạo topic B", "bạn làm được gì, rồi tạo topic C"). Greetings, thanks and blocked changes
        ("đừng xóa bài X, rồi tìm bài Y") are not requests; two searches are answered as one search.
        """
        parts = [p.strip() for p in MIXED_INTENT_SPLIT.split(text) if p and p.strip()]
        if len(parts) < 2:
            return []
        requests = [
            (p, d.intent) for p in parts
            if (d := self.decide(p)).intent is not None and d.row not in COMMENTARY_ROWS
        ]
        intents = [intent for _, intent in requests]
        if len(requests) < 2 or (IntentType.ROADMAP_CUD not in intents and len(set(intents)) < 2):
            return []
        return [p for p, _ in requests]

    def has_mixed_intents(self, text: str) -> bool:
        """True when one message asks for several things (see mixed_intent_steps)."""
        return bool(self.mixed_intent_steps(text))

    def has_change_request(self, text: str, follow_up: bool = False) -> bool:
        """The minimum before anything is written: a change verb and a roadmap object ("tạo topic X").

        In a follow-up the object may come from earlier turns, but only when the message points back to it
        ("xóa nó đi", "sửa bài đó"): a verb alone mid-conversation ("tạo mạng neural") is no evidence.
        """
        u = understand(text, self.known_place)
        return u.has_change_verb and (u.has_object or (follow_up and self.points_back(text)))

    def points_back(self, text: str) -> bool:
        """The message refers to an object named in earlier turns ("xóa nó đi", "sửa bài đó", "delete it")."""
        u = understand(text, self.known_place)
        return ANAPHORA_REF.search(u.flat) is not None or ANAPHORA_REF_EN.search(u.lower) is not None

    async def aclassify(self, text: str) -> IntentClassificationResult:
        """Classify message intent, falling back to LLM structured output if ambiguous."""
        return (await self.aroute(text))[0]

    async def aroute(self, text: str, history: Sequence[Any] = ()) -> tuple[IntentClassificationResult, str]:
        """Classify and say how it was decided: heuristic | llm | llm_error | rate_limited | default.

        `history` (recent turns with .role/.content) is shown to the LLM router only, for follow-ups like "xóa nó đi".
        """
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
                res = await invoke_structured(self._llm, IntentClassificationResult, build_router_prompt(text, history))
                if isinstance(res, IntentClassificationResult):
                    return res, "llm"
            except Exception as exc:
                print(f"[IntentRouter] LLM classification error: {exc}")
                # A skipped structured output is the model's answer, not the provider failing
                if not missed_structure(exc):
                    llm_breaker.record_failure(exc)

        # Default fallback
        return IntentClassificationResult(
            intent=IntentType.CHITCHAT,
            confidence=0.5,
            needs_cud_extraction=False,
        ), method
