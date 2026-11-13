"""Pydantic Schemas for Intent Classification and Structured Entity Extraction.

Enforces strict contracts on user intent and entity extraction so that LLMs
never leak conversational verbs ('tạo', 'thêm', 'create', 'add') into entity titles.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator


class IntentType(str, Enum):
    ROADMAP_CUD = "roadmap_cud"         # Create or delete a topic or lesson; rename a section
    KNOWLEDGE_QUERY = "knowledge_query" # Ask about existing lessons, concepts, search docs
    PLAN_GOAL = "plan_goal"             # A learning plan, answered from the existing lessons
    CHITCHAT = "chitchat"               # Greetings, thanks, identity questions
    OUT_OF_SCOPE = "out_of_scope"       # Unrelated to roadmaps (weather, finance, general coding...)
    UNCLEAR = "unclear"                 # LLM router could not tell; the user is asked to rephrase


class KnowledgeSubIntent(str, Enum):
    """Which downstream answers a KNOWLEDGE_QUERY. Set by the decision table only, never by the LLM router."""

    SEARCH = "search"                # Vector RAG: concepts, lesson content
    CATALOG = "catalog"              # Roadmap structure: topic and section lists, counts, positions
    LESSON_STATUS = "lesson_status"  # ADR-0010: the Owner's target / learning / known lessons (read-only)


class ActionType(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class EntityLevel(str, Enum):
    TOPIC = "topic"   # A topic (Roadmap); holds its lessons directly (ADR-0009)
    ITEM = "item"     # A lesson, optionally in a section of its topic


class SingleEntity(BaseModel):
    title: str = Field(
        ...,
        description=(
            "The pure, clean name of the entity. "
            "CRITICAL: Strip out any action verbs ('tạo', 'thêm', 'create', 'add', 'make', 'new') "
            "and category words ('topic', 'chủ đề', 'lộ trình', 'item', 'bài học', 'mục'). "
            "Example: for 'tạo ABC topic', title MUST be 'ABC'. "
            "For 'thêm bài aaa vào topic fe', title MUST be 'aaa'. "
            "For 'thêm 2 bài mock 1 và 2', title is 'mock 1' for the first, 'mock 2' for the second."
        ),
    )
    section: Optional[str] = Field(
        None,
        description=(
            "For lessons only: the section (mục) of the topic the lesson goes into, as the user names it "
            "(\"vào mục RAG\" -> \"RAG\"). Never guess one; leave it empty otherwise."
        ),
    )
    description: Optional[str] = Field(
        "",
        description="Optional brief description of the entity.",
    )


class StructuredRoadmapAction(BaseModel):
    action: ActionType = Field(
        ...,
        description="The CUD action to perform: 'create', 'update', or 'delete'.",
    )
    entity_level: EntityLevel = Field(
        ...,
        description="What the action is about: 'topic' | 'item'.",
    )
    target_parent_identifier: Optional[str] = Field(
        None,
        description=(
            "Slug or name of the topic this action belongs to (e.g. 'ai-engineering', 'be'). "
            "For a lesson, the topic it is in. "
            "If the prompt refers to 'đó' or 'trên' or previous context, set to 'CONTEXT_ACTIVE'."
        ),
    )
    entities: List[SingleEntity] = Field(
        ...,
        description=(
            "List of entities to create/update/delete. "
            "If the user asks to add 2 lessons 'mock 1 và 2', this list MUST contain 2 elements: "
            "[{'title': 'mock 1'}, {'title': 'mock 2'}]."
        ),
    )
    is_batch: bool = Field(
        False,
        description="True if multiple entities are being manipulated simultaneously.",
    )
    raw_intent_summary: str = Field(
        "",
        description="One-sentence human-readable summary in Vietnamese of what will be performed.",
    )


class IntentClassificationResult(BaseModel):
    intent: IntentType = Field(
        ...,
        description="Primary intent of the user message.",
    )
    confidence: float = Field(
        ...,
        description="Confidence score between 0.0 and 1.0.",
    )
    needs_cud_extraction: bool = Field(
        False,
        description="True if the message requires extracting StructuredRoadmapAction.",
    )
    needs_confirmation: bool = Field(
        False,
        description="True if the change is asked politely or on a condition and must be confirmed before it runs.",
    )
    sub_intent: Optional[KnowledgeSubIntent] = Field(
        None,
        description="Set by the decision table for KNOWLEDGE_QUERY only; leave empty.",
    )

    @property
    def sub_intent_value(self) -> Optional[str]:
        """The sub-intent's string, or None: safe where `sub_intent.value` would raise on None."""
        return self.sub_intent.value if self.sub_intent is not None else None

    @model_validator(mode="after")
    def _only_knowledge_query_has_sub_intent(self) -> "IntentClassificationResult":
        if self.intent != IntentType.KNOWLEDGE_QUERY:
            self.sub_intent = None
        return self
