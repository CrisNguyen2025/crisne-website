"""Pydantic Schemas for Intent Classification and Structured Entity Extraction.

Enforces strict contracts on user intent and entity extraction so that LLMs
never leak conversational verbs ('tạo', 'thêm', 'create', 'add') into entity titles.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class IntentType(str, Enum):
    ROADMAP_CUD = "roadmap_cud"         # Create, update, or delete roadmap/layer/group/item
    KNOWLEDGE_QUERY = "knowledge_query" # Ask about existing lessons, concepts, search docs
    PLAN_GOAL = "plan_goal"             # /plan preview outline or /goal end-to-end generation
    CHITCHAT = "chitchat"               # Greetings, thanks, identity questions
    OUT_OF_SCOPE = "out_of_scope"       # Unrelated to roadmaps (weather, finance, general coding...)
    UNCLEAR = "unclear"                 # LLM router could not tell; the user is asked to rephrase


class ActionType(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class EntityLevel(str, Enum):
    TOPIC = "topic"   # Top-level Roadmap
    LAYER = "layer"   # Knowledge domain within a roadmap
    GROUP = "group"   # Level grouping (core/intermediate/advanced)
    ITEM = "item"     # Individual lesson or knowledge node


class SingleEntity(BaseModel):
    title: str = Field(
        ...,
        description=(
            "The pure, clean name of the entity. "
            "CRITICAL: Strip out any action verbs ('tạo', 'thêm', 'create', 'add', 'make', 'new') "
            "and category words ('topic', 'chủ đề', 'lộ trình', 'layer', 'group', 'nhóm', 'item', 'bài học'). "
            "Example: for 'tạo ABC topic', title MUST be 'ABC'. "
            "For 'create aaa layer on fe', title MUST be 'aaa'. "
            "For 'tạo 2 layer mock 1 và 2', title is 'mock 1' for the first, 'mock 2' for the second."
        ),
    )
    short_code: Optional[str] = Field(
        None,
        description=(
            "Uppercase 2-4 letter abbreviation derived ONLY from the clean title. "
            "Never derive from the action verb. For title 'ABC' -> short_code 'ABC'. "
            "For title 'AI Engineering' -> short_code 'AIE' or 'AI'."
        ),
    )
    short_tag: Optional[str] = Field(
        None,
        description="For layers: formatted as '01-TAG', '02-TAG'.",
    )
    level: Optional[str] = Field(
        "core",
        description="For groups and items: 'core' | 'intermediate' | 'advanced'. Default 'core'.",
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
        description="Hierarchy tier: 'topic' | 'layer' | 'group' | 'item'.",
    )
    target_parent_identifier: Optional[str] = Field(
        None,
        description=(
            "Slug, ID, or name of the parent entity this action belongs to. "
            "For a layer, this is the topic slug/name (e.g. 'be', 'fe', 'ai-architecture'). "
            "For a group or item, this is the layer ID or shortTag (e.g. '01-LLM', '02-AAA'). "
            "If the prompt refers to 'đó' or 'trên' or previous context, set to 'CONTEXT_ACTIVE'."
        ),
    )
    entities: List[SingleEntity] = Field(
        ...,
        description=(
            "List of entities to create/update/delete. "
            "If the user asks to create 2 layers 'mock 1 và 2', this list MUST contain 2 elements: "
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
