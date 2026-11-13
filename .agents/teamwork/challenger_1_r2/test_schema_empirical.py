"""Empirical Verification & Adversarial Stress Suite for Proposed Pydantic Schema.

Target: Section 3.2 of roadmap-rag-assistant/docs/knowledge-sub-intents-design.md
Tested components:
  1. KnowledgeSubIntent Enum
  2. KnowledgeQueryMetadata Model
  3. IntentClassificationResult Model:
     - @property sub_intent_value safe accessor
     - @model_validator(mode="after") enforce_sub_intent_hierarchy
     - Serialization roundtrip (model_dump, model_dump_json, model_validate, model_validate_json)
     - Dict/JSON mode behavior (agent.py compatibility)
     - Backward compatibility with existing decision snapshot fixtures
     - Adversarial stress tests (normalization, edge cases, type coercion)
"""

from __future__ import annotations

import json
from enum import Enum
from pathlib import Path
from typing import Any, List, Optional
import pytest
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


# ── Schemas under test (verbatim from Section 3.2) ──

class IntentType(str, Enum):
    """Primary intent of the user message (Top-Level Intent)."""
    ROADMAP_CUD = "roadmap_cud"         # Create or delete a topic or lesson; rename a section
    KNOWLEDGE_QUERY = "knowledge_query" # Ask about existing lessons, concepts, search docs
    PLAN_GOAL = "plan_goal"             # A learning plan, answered from the existing lessons
    CHITCHAT = "chitchat"               # Greetings, thanks, identity questions
    OUT_OF_SCOPE = "out_of_scope"       # Unrelated to roadmaps (weather, finance, general coding...)
    UNCLEAR = "unclear"                 # LLM router could not tell; the user is asked to rephrase


class KnowledgeSubIntent(str, Enum):
    """Sub-intent classification under IntentType.KNOWLEDGE_QUERY.
    
    Determines the exact downstream execution engine, optimizing compute resources,
    latency profile, and strict privacy boundaries.
    """
    SEARCH = "search"      # Vector RAG: Deep semantic search, concept QA, lesson explanations
    CATALOG = "catalog"    # In-memory Catalog: Structural hierarchy, topic/section listing, lesson counts
    PROGRESS = "progress"  # User Learning State (ADR-0010): Personal known/learning/target queries (Owner only)


class KnowledgeQueryMetadata(BaseModel):
    """Extracted semantic metadata for knowledge queries to assist downstream dispatching."""
    target_topic_slug: Optional[str] = Field(
        None,
        description="Slug or identifier of the topic if explicitly mentioned (e.g. 'ai-engineering')."
    )
    target_section: Optional[str] = Field(
        None,
        description="Section name within a topic if referenced (e.g. 'RAG', 'Fundamentals')."
    )
    is_counting_query: bool = Field(
        False,
        description="True if the user is asking for quantity/counts ('mấy bài', 'bao nhiêu topic')."
    )
    progress_status_filter: Optional[str] = Field(
        None,
        description="Specific status filter for PROGRESS sub-intent: 'known' | 'learning' | 'target' | 'review'."
    )


class IntentClassificationResult(BaseModel):
    """Result contract of the Intent Router."""
    model_config = ConfigDict(extra="ignore")

    intent: IntentType = Field(
        ...,
        description="Primary intent of the user message."
    )
    confidence: float = Field(
        ...,
        description="Confidence score between 0.0 and 1.0."
    )
    sub_intent: Optional[KnowledgeSubIntent] = Field(
        None,
        description=(
            "Granular sub-intent when intent == IntentType.KNOWLEDGE_QUERY. "
            "Dictates downstream execution: SEARCH (Vector RAG), CATALOG (RAM metadata), or PROGRESS (ADR-0010)."
        )
    )
    query_metadata: Optional[KnowledgeQueryMetadata] = Field(
        None,
        description="Optional structured parameters extracted during classification."
    )
    needs_cud_extraction: bool = Field(
        False,
        description="True if the message requires extracting StructuredRoadmapAction."
    )
    needs_confirmation: bool = Field(
        False,
        description="True if the change is asked politely or on a condition and must be confirmed before it runs."
    )

    @property
    def sub_intent_value(self) -> Optional[str]:
        """Safe accessor returning string value of sub_intent or None if not set.
        
        Prevents AttributeError: 'NoneType' object has no attribute 'value'
        when sub_intent is None across non-KNOWLEDGE_QUERY intents.
        """
        return self.sub_intent.value if self.sub_intent is not None else None

    @model_validator(mode="after")
    def enforce_sub_intent_hierarchy(self) -> "IntentClassificationResult":
        """Defense-in-depth: Ensure sub_intent only exists when intent == KNOWLEDGE_QUERY.
        
        If intent is CHITCHAT, ROADMAP_CUD, PLAN_GOAL, or OUT_OF_SCOPE, sub_intent is
        automatically normalized to None, preventing inconsistent state coupling.
        """
        if self.intent != IntentType.KNOWLEDGE_QUERY and self.sub_intent is not None:
            object.__setattr__(self, "sub_intent", None)
            object.__setattr__(self, "query_metadata", None)
        return self


# ── Test Suite 1: @property sub_intent_value Safe Accessor ──

class TestSubIntentValueSafeAccessor:
    """Empirical verification of safe sub_intent accessor behavior."""

    def test_sub_intent_none_returns_none_safely(self):
        """When sub_intent is None, accessing sub_intent.value would crash with AttributeError,
        but sub_intent_value safely returns None."""
        res = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.90,
            sub_intent=None,
        )
        assert res.sub_intent is None
        # Raw access demonstrates the bug that sub_intent_value prevents
        with pytest.raises(AttributeError, match="'NoneType' object has no attribute 'value'"):
            _ = res.sub_intent.value
        # Safe property returns None
        assert res.sub_intent_value is None

    @pytest.mark.parametrize("sub_enum, expected_str", [
        (KnowledgeSubIntent.SEARCH, "search"),
        (KnowledgeSubIntent.CATALOG, "catalog"),
        (KnowledgeSubIntent.PROGRESS, "progress"),
    ])
    def test_sub_intent_enum_values(self, sub_enum, expected_str):
        """When sub_intent is assigned an enum, sub_intent_value returns the exact string value."""
        res = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.92,
            sub_intent=sub_enum,
        )
        assert res.sub_intent is sub_enum
        assert res.sub_intent_value == expected_str
        assert res.sub_intent_value == sub_enum.value
        assert isinstance(res.sub_intent_value, str)

    @pytest.mark.parametrize("sub_str", ["search", "catalog", "progress"])
    def test_sub_intent_str_coercion(self, sub_str):
        """Pydantic v2 automatically coerces valid strings to KnowledgeSubIntent enums."""
        res = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.92,
            sub_intent=sub_str,
        )
        assert isinstance(res.sub_intent, KnowledgeSubIntent)
        assert res.sub_intent == sub_str
        assert res.sub_intent_value == sub_str

    @pytest.mark.parametrize("non_kq_intent", [
        IntentType.ROADMAP_CUD,
        IntentType.PLAN_GOAL,
        IntentType.CHITCHAT,
        IntentType.OUT_OF_SCOPE,
        IntentType.UNCLEAR,
    ])
    def test_sub_intent_value_safe_across_all_intents(self, non_kq_intent):
        """All non-KNOWLEDGE_QUERY intents safely evaluate sub_intent_value to None."""
        res = IntentClassificationResult(
            intent=non_kq_intent,
            confidence=0.99,
        )
        assert res.sub_intent is None
        assert res.sub_intent_value is None


# ── Test Suite 2: @model_validator(mode="after") enforce_sub_intent_hierarchy ──

class TestModelValidatorHierarchyEnforcement:
    """Stress-test defense-in-depth hierarchy enforcement."""

    @pytest.mark.parametrize("non_kq_intent", [
        IntentType.ROADMAP_CUD,
        IntentType.PLAN_GOAL,
        IntentType.CHITCHAT,
        IntentType.OUT_OF_SCOPE,
        IntentType.UNCLEAR,
    ])
    @pytest.mark.parametrize("sub_enum", [
        KnowledgeSubIntent.SEARCH,
        KnowledgeSubIntent.CATALOG,
        KnowledgeSubIntent.PROGRESS,
    ])
    def test_sub_intent_stripped_for_non_kq_intents(self, non_kq_intent, sub_enum):
        """Validator forces sub_intent=None when intent != KNOWLEDGE_QUERY."""
        res = IntentClassificationResult(
            intent=non_kq_intent,
            confidence=0.90,
            sub_intent=sub_enum,
        )
        assert res.intent == non_kq_intent
        assert res.sub_intent is None
        assert res.sub_intent_value is None

    @pytest.mark.parametrize("non_kq_intent", [
        IntentType.ROADMAP_CUD,
        IntentType.PLAN_GOAL,
        IntentType.CHITCHAT,
        IntentType.OUT_OF_SCOPE,
        IntentType.UNCLEAR,
    ])
    def test_query_metadata_stripped_with_sub_intent_on_non_kq(self, non_kq_intent):
        """query_metadata is normalized to None alongside sub_intent when non-KQ is initialized."""
        meta = KnowledgeQueryMetadata(target_topic_slug="ai-engineering", is_counting_query=True)
        res = IntentClassificationResult(
            intent=non_kq_intent,
            confidence=0.90,
            sub_intent=KnowledgeSubIntent.CATALOG,
            query_metadata=meta,
        )
        assert res.sub_intent is None
        assert res.sub_intent_value is None
        assert res.query_metadata is None

    def test_kq_preserves_sub_intent_and_metadata(self):
        """KNOWLEDGE_QUERY retains sub_intent and query_metadata without alteration."""
        meta = KnowledgeQueryMetadata(
            target_topic_slug="docker",
            target_section="Fundamentals",
            is_counting_query=True,
            progress_status_filter="learning",
        )
        res = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.95,
            sub_intent=KnowledgeSubIntent.PROGRESS,
            query_metadata=meta,
        )
        assert res.intent == IntentType.KNOWLEDGE_QUERY
        assert res.sub_intent == KnowledgeSubIntent.PROGRESS
        assert res.sub_intent_value == "progress"
        assert res.query_metadata == meta

    def test_invalid_sub_intent_string_fails_validation(self):
        """Passing an unrecognized sub_intent string raises ValidationError."""
        with pytest.raises(ValidationError) as exc:
            IntentClassificationResult(
                intent=IntentType.KNOWLEDGE_QUERY,
                confidence=0.9,
                sub_intent="unknown_sub_intent",
            )
        assert "sub_intent" in str(exc.value)

    def test_normalization_reflected_in_model_dump_and_json(self):
        """Empirical verification: does object.__setattr__ correctly update model_dump & model_dump_json?"""
        res = IntentClassificationResult(
            intent=IntentType.CHITCHAT,
            confidence=0.95,
            sub_intent=KnowledgeSubIntent.SEARCH,
            query_metadata=KnowledgeQueryMetadata(target_topic_slug="ai"),
        )
        # Direct attributes
        assert res.sub_intent is None
        assert res.query_metadata is None

        # Dict dump
        dump = res.model_dump()
        assert dump["sub_intent"] is None
        assert dump["query_metadata"] is None

        # JSON dump
        dump_json = res.model_dump_json()
        parsed = json.loads(dump_json)
        assert parsed["sub_intent"] is None
        assert parsed["query_metadata"] is None

    def test_adversarial_standalone_metadata_on_non_kq(self):
        """Adversarial scenario: caller passes query_metadata but sub_intent=None on non-KQ intent.
        
        Section 3.2 code:
        if self.intent != IntentType.KNOWLEDGE_QUERY and self.sub_intent is not None:
            object.__setattr__(self, "sub_intent", None)
            object.__setattr__(self, "query_metadata", None)
            
        Observation: If sub_intent was already None, query_metadata is NOT stripped!
        """
        meta = KnowledgeQueryMetadata(target_topic_slug="ai")
        res = IntentClassificationResult(
            intent=IntentType.CHITCHAT,
            confidence=0.90,
            sub_intent=None,
            query_metadata=meta,
        )
        # Empirical finding: query_metadata remains attached if sub_intent was None
        assert res.query_metadata == meta


# ── Test Suite 3: Backward Compatibility & Decision Snapshots ──

class TestBackwardCompatibility:
    """Verify 100% backward compatibility with existing codebase."""

    def test_legacy_keyword_instantiation(self):
        """Legacy instantiation with only intent and confidence."""
        res = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.85,
        )
        assert res.intent == IntentType.KNOWLEDGE_QUERY
        assert res.confidence == 0.85
        assert res.sub_intent is None
        assert res.sub_intent_value is None
        assert res.query_metadata is None
        assert res.needs_cud_extraction is False
        assert res.needs_confirmation is False

    def test_legacy_cud_instantiation(self):
        """Legacy CUD instantiation from route_decision.py."""
        res = IntentClassificationResult(
            intent=IntentType.ROADMAP_CUD,
            confidence=0.90,
            needs_cud_extraction=False,
            needs_confirmation=False,
        )
        assert res.intent == IntentType.ROADMAP_CUD
        assert res.confidence == 0.90
        assert res.needs_cud_extraction is False
        assert res.sub_intent is None
        assert res.sub_intent_value is None

    def test_extra_fields_ignored_safely(self):
        """Extra fields from upstream API/eval payloads are ignored without error."""
        data = {
            "intent": "knowledge_query",
            "confidence": 0.90,
            "method": "decision_table",
            "row": "search_word",
            "extra_field": "test",
        }
        res = IntentClassificationResult.model_validate(data)
        assert res.intent == IntentType.KNOWLEDGE_QUERY
        assert res.confidence == 0.90
        assert not hasattr(res, "extra_field")

    def test_all_158_knowledge_queries_in_decisions_jsonl(self):
        """Test against all 158 knowledge_query decisions in evals/router/decisions.jsonl."""
        decisions_path = Path(__file__).resolve().parents[3] / "roadmap-rag-assistant" / "evals" / "router" / "decisions.jsonl"
        assert decisions_path.exists(), f"decisions.jsonl must exist at {decisions_path}"

        kq_count = 0
        total_decisions = 0
        with open(decisions_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                total_decisions += 1
                route = entry.get("route")
                if route not in IntentType._value2member_map_:
                    continue
                # Construct result as Decision.as_intent() does
                res = IntentClassificationResult(
                    intent=IntentType(route),
                    confidence=entry.get("confidence", 0.9),
                    needs_cud_extraction=route == IntentType.ROADMAP_CUD,
                    needs_confirmation=entry.get("confirm", False),
                )
                assert res.intent == route
                if route == "knowledge_query":
                    kq_count += 1
                    # By default existing snapshots have no sub_intent
                    assert res.sub_intent is None
                    assert res.sub_intent_value is None

        assert total_decisions >= 700, f"Expected ~749 decisions, found {total_decisions}"
        assert kq_count == 158, f"Expected exactly 158 knowledge_query decisions, found {kq_count}"


# ── Test Suite 4: Pydantic v2 Serialization & Agent Integration ──

class TestSerializationAndAgentIntegration:
    """Verify roundtrip serialization and agent.py:352 compatibility."""

    def test_agent_model_dump_json_mode(self):
        """agent.py:352 calls output=intent_res.model_dump(mode='json')."""
        res = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.91,
            sub_intent=KnowledgeSubIntent.SEARCH,
        )
        dump = res.model_dump(mode="json")
        assert dump["intent"] == "knowledge_query"
        assert dump["sub_intent"] == "search"
        assert dump["confidence"] == 0.91
        assert isinstance(dump["intent"], str)
        assert isinstance(dump["sub_intent"], str)

    def test_full_model_dump_roundtrip(self):
        """Full roundtrip through dict serialization."""
        original = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.95,
            sub_intent=KnowledgeSubIntent.CATALOG,
            query_metadata=KnowledgeQueryMetadata(
                target_topic_slug="backend-roadmap",
                is_counting_query=True,
            ),
            needs_cud_extraction=False,
            needs_confirmation=False,
        )
        dumped = original.model_dump()
        restored = IntentClassificationResult.model_validate(dumped)
        assert restored == original
        assert restored.sub_intent_value == "catalog"
        assert restored.query_metadata.target_topic_slug == "backend-roadmap"

    def test_full_json_roundtrip(self):
        """Full roundtrip through JSON serialization string."""
        original = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.93,
            sub_intent=KnowledgeSubIntent.PROGRESS,
            query_metadata=KnowledgeQueryMetadata(
                progress_status_filter="known",
            ),
        )
        json_str = original.model_dump_json()
        restored = IntentClassificationResult.model_validate_json(json_str)
        assert restored == original
        assert restored.sub_intent_value == "progress"
        assert restored.query_metadata.progress_status_filter == "known"

    def test_equality_with_string_and_enum(self):
        """KnowledgeSubIntent allows direct equality comparison with both Enum and str."""
        res = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.90,
            sub_intent=KnowledgeSubIntent.SEARCH,
        )
        assert res.sub_intent == "search"
        assert res.sub_intent == KnowledgeSubIntent.SEARCH
        assert res.sub_intent_value == "search"
        assert res.sub_intent_value == KnowledgeSubIntent.SEARCH
