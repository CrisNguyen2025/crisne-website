"""System 2 — the LLM's reading of a message that may change roadmap data.

System 1 (the heuristic router) reads words; it cannot tell "tạo nhóm Zalo" from "tạo nhóm Advanced RAG",
or "thôi khỏi tạo topic X" from "tạo topic X". Every write candidate is therefore read once more by a model,
which returns what the message does (speech act), which system it is about, and which roadmap entity it
names. The write policy (write_policy.py) combines this with System 1 and the roadmap data itself.

No model, a timeout, an error or an unreadable reply returns None: the policy then never writes at once.
"""

from __future__ import annotations

import asyncio
from enum import Enum
from typing import Any, Optional, Sequence

from pydantic import BaseModel, Field, model_validator

from rag_service.llm_keys import invoke_structured
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, IntentType, StructuredRoadmapAction

VERIFY_TIMEOUT = 15.0


class Act(str, Enum):
    COMMAND = "command"            # "thêm bài X vào layer Y", "xóa nó đi"
    REQUEST = "request"            # "thêm giúp mình bài X được không?"
    QUESTION = "question"          # "làm sao để xóa một topic", "tạo embedding thế nào"
    NEGATION = "negation"          # "thôi khỏi tạo topic X", "không phải xóa, chỉ ẩn"
    HYPOTHETICAL = "hypothetical"  # "giả sử xóa layer 2 thì sao"
    REPORTED = "reported"          # "sếp bảo xóa hết topic", "đồng nghiệp vừa đổi tên topic"
    SARCASM = "sarcasm"            # "xóa luôn cả roadmap cho rồi 😩"
    OTHER = "other"


class TargetSystem(str, Enum):
    ROADMAP = "roadmap"    # topics / layers / groups / lessons of this learning roadmap
    EXTERNAL = "external"  # Zalo, Facebook, Figma, AWS, Kafka, a database, code, a playlist…
    UNKNOWN = "unknown"


class WriteVerdict(BaseModel):
    intent: IntentType = Field(description="Ý định chính của tin nhắn")
    act: Act = Field(description="Tin nhắn làm gì: ra lệnh, nhờ, hỏi, phủ định, giả định, kể lại, mỉa mai")
    target_system: TargetSystem = Field(description="Hệ thống mà hành động nhắm tới")
    action: Optional[ActionType] = Field(default=None, description="create / update / delete nếu là thay đổi")
    entity_level: Optional[EntityLevel] = Field(default=None, description="topic / layer / group / item")
    target_name: Optional[str] = Field(
        default=None, description="Tên entity ĐANG CÓ bị sửa/xóa/chuyển (lấy từ hội thoại nếu tin nhắn dùng 'nó', 'bài đó')"
    )
    container_name: Optional[str] = Field(
        default=None, description="Layer/topic sẽ chứa entity MỚI khi tạo (ví dụ '03-RAG', 'layer 1')"
    )
    evidence_span: str = Field(default="", description="Đoạn trích nguyên văn trong tin nhắn thể hiện hành động")
    # The full action when it is a roadmap change: the change handler runs it without a second extraction call
    change: Optional[StructuredRoadmapAction] = Field(
        default=None, description="Chỉ khi là thay đổi Roadmap: hành động đầy đủ (entities với tên sạch, parent)"
    )
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _one_action(self) -> "WriteVerdict":
        # The action is in two places; models often fill only `change` ("tạo topic Data Engineering" came back
        # with action=None and change.action=create). One fact: take the missing half from the other.
        if self.change is not None:
            self.action = self.action or self.change.action
            self.entity_level = self.entity_level or self.change.entity_level
        return self

    @property
    def says_roadmap_command(self) -> bool:
        """System 2 reads a command or request aimed at this roadmap, whatever intent or action it filled in."""
        return self.act in (Act.COMMAND, Act.REQUEST) and self.target_system == TargetSystem.ROADMAP

    @property
    def is_roadmap_change(self) -> bool:
        return self.says_roadmap_command and self.intent == IntentType.ROADMAP_CUD and self.action is not None


VERIFY_EXAMPLES = [
    ("thêm bài Kafka Streams vào layer 03-RAG", "ROADMAP_CUD, command, roadmap, create item, container=03-RAG"),
    ("xóa nó đi (vừa nói về bài Semantic Caching)", "ROADMAP_CUD, command, roadmap, delete item, target=Semantic Caching"),
    ("tạo nhóm Zalo cho lớp học", "OUT_OF_SCOPE, command, external"),
    ("tạo topic SNS trên AWS", "KNOWLEDGE_QUERY, command, external"),
    ("thêm layer dropout vào model Keras", "KNOWLEDGE_QUERY, command, external"),
    ("tạo index HNSW trong Qdrant", "KNOWLEDGE_QUERY, command, external"),
    ("thôi khỏi tạo topic System Design nữa", "CHITCHAT, negation, roadmap"),
    ("sếp bảo xóa hết topic cũ đi, bạn thấy có nên không", "KNOWLEDGE_QUERY, reported, roadmap"),
    ("xóa luôn cả roadmap cho rồi, học mãi không vào 😩", "CHITCHAT, sarcasm, roadmap"),
    ("làm sao để xóa một topic", "CHITCHAT, question, roadmap"),
    ("giải thích câu lệnh `DELETE FROM topics`", "KNOWLEDGE_QUERY, question, external"),
]


def build_verify_prompt(text: str, history: Sequence[Any] = (), page_context: str = "") -> str:
    examples = "\n".join(f'- "{msg}" → {label}' for msg, label in VERIFY_EXAMPLES)
    turns = "\n".join(f"{t.role}: {t.content}" for t in history) or "(chưa có)"
    return (
        "Bạn kiểm tra một tin nhắn gửi tới trợ lý quản lý Roadmap học tập (topic → layer → group → bài học).\n"
        "Chỉ được coi là thay đổi Roadmap khi người dùng THẬT SỰ yêu cầu ngay bây giờ thay đổi một topic/layer/"
        "group/bài học CỦA ROADMAP NÀY.\n\n"
        "Quy tắc:\n"
        "- target_system=external khi đối tượng thuộc hệ thống khác: mạng xã hội, ứng dụng, phần mềm thiết kế, "
        "cloud, cơ sở dữ liệu, thư viện, code, playlist, menu, lớp học... dù có các từ topic/layer/nhóm/bài/mục.\n"
        "- act=question cho câu hỏi cách làm, kể cả khi có động từ tạo/xóa/thêm.\n"
        "- act=request (KHÔNG phải question) cho lời nhờ có đối tượng cụ thể: '... được không', "
        "'giúp mình ... được không', 'có thể ... không', 'dc ko', 'nhé', 'giùm'.\n"
        "- act=negation cho từ chối/hủy ('thôi', 'khỏi', 'đừng', 'không phải ... mà').\n"
        "- act=reported khi kể lại lời người khác hoặc việc đã xảy ra; act=hypothetical cho 'giả sử', 'nếu', 'lỡ'.\n"
        "- act=sarcasm khi rõ ràng là than thở, mỉa mai.\n"
        "- Đoạn code hay câu lệnh SQL/CLI trong tin nhắn là thứ được hỏi, không phải lệnh cho Roadmap.\n"
        "- target_name/container_name: chép đúng tên trong tin nhắn hoặc hội thoại; để trống nếu không có.\n"
        "- change (chỉ khi là thay đổi Roadmap): entities[].title là tên SẠCH, bỏ động từ và từ loại "
        "('tạo ABC topic' → 'ABC'; 'tạo 2 layer mock 1 và 2' → 'mock 1', 'mock 2'); target_parent_identifier là "
        "layer/topic chứa (shortTag như '03-RAG' nếu có), 'CONTEXT_ACTIVE' khi tin nhắn nói 'đó', 'trên', 'này'; "
        "is_batch=true khi nhiều entity; raw_intent_summary là một câu tiếng Việt mô tả việc sẽ làm.\n"
        "- Phân vân: KHÔNG coi là thay đổi Roadmap.\n\n"
        f"Ví dụ:\n{examples}\n\n"
        f"Hội thoại gần đây:\n{turns}\n\n"
        f"Trang người dùng đang mở: {page_context or '(không có)'}\n\n"
        f"Tin nhắn: \"{text}\""
    )


async def verify_write(
    llm: Any, text: str, history: Sequence[Any] = (), page_context: str = ""
) -> Optional[WriteVerdict]:
    if llm is None:
        return None
    try:
        verdict = await asyncio.wait_for(
            invoke_structured(llm, WriteVerdict, build_verify_prompt(text, history, page_context)), VERIFY_TIMEOUT
        )
    except Exception as exc:
        print(f"[Verifier] System 2 unavailable ({type(exc).__name__}: {str(exc)[:120]}); no write runs at once.")
        return None
    return verdict if isinstance(verdict, WriteVerdict) else None
