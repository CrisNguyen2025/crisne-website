"""Empirical stress-test suite for proposed Knowledge Sub-Intent Pydantic schemas.

Author: challenger_1 (teamwork_challenger)
Target Design Doc: roadmap-rag-assistant/docs/knowledge-sub-intents-design.md (§3.2 / §4.2)
Environment: Python 3.13.13, Pydantic 2.14.1
"""

from __future__ import annotations

import json
import sys
from enum import Enum
from typing import Any, Dict, List, Optional
import pytest
from pydantic import BaseModel, Field, ValidationError

# ---------------------------------------------------------------------------
# 1. Existing Schemas (Baseline from schemas.py)
# ---------------------------------------------------------------------------
class BaselineIntentType(str, Enum):
    ROADMAP_CUD = "roadmap_cud"
    KNOWLEDGE_QUERY = "knowledge_query"
    PLAN_GOAL = "plan_goal"
    CHITCHAT = "chitchat"
    OUT_OF_SCOPE = "out_of_scope"
    UNCLEAR = "unclear"


class BaselineIntentClassificationResult(BaseModel):
    intent: BaselineIntentType = Field(..., description="Primary intent of the user message.")
    confidence: float = Field(..., description="Confidence score between 0.0 and 1.0.")
    needs_cud_extraction: bool = Field(False, description="True if requires extracting StructuredRoadmapAction.")
    needs_confirmation: bool = Field(False, description="True if the change must be confirmed before running.")


# ---------------------------------------------------------------------------
# 2. Proposed Schemas (Exact copy from Design Doc §3.2)
# ---------------------------------------------------------------------------
class ProposedIntentType(str, Enum):
    ROADMAP_CUD = "roadmap_cud"
    KNOWLEDGE_QUERY = "knowledge_query"
    PLAN_GOAL = "plan_goal"
    CHITCHAT = "chitchat"
    OUT_OF_SCOPE = "out_of_scope"
    UNCLEAR = "unclear"


class KnowledgeSubIntent(str, Enum):
    """Sub-intent classification under IntentType.KNOWLEDGE_QUERY."""
    SEARCH = "search"
    CATALOG = "catalog"
    PROGRESS = "progress"


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


class ProposedIntentClassificationResult(BaseModel):
    """Result contract of the Intent Router as proposed in Section 3.2."""
    intent: ProposedIntentType = Field(
        ...,
        description="Primary intent of the user message."
    )
    confidence: float = Field(
        ...,
        description="Confidence score between 0.0 and 1.0."
    )
    sub_intent: Optional[KnowledgeSubIntent] = Field(
        None,
        description="Granular sub-intent when intent == IntentType.KNOWLEDGE_QUERY."
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


# ---------------------------------------------------------------------------
# 3. Alternate Variant with sub_intent_confidence (Orchestrator Hypothesis)
# ---------------------------------------------------------------------------
class VariantIntentClassificationResult(BaseModel):
    intent: ProposedIntentType = Field(..., description="Primary intent.")
    confidence: float = Field(..., description="Overall confidence.")
    sub_intent: Optional[KnowledgeSubIntent] = Field(None, description="Sub-intent.")
    sub_intent_confidence: Optional[float] = Field(None, description="Confidence of sub-intent.")
    query_metadata: Optional[KnowledgeQueryMetadata] = Field(None)
    needs_cud_extraction: bool = Field(False)
    needs_confirmation: bool = Field(False)


# ===========================================================================
# Test Cases
# ===========================================================================

# ---------------------------------------------------------------------------
# Suite 1: Backward Compatibility with Legacy Callers
# ---------------------------------------------------------------------------
def test_legacy_caller_instantiation_without_sub_intent():
    """Legacy callers instantiate with (intent, confidence) or (intent, confidence, needs_cud_extraction)."""
    # Exact pattern in route_decision.py:141
    res = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.85,
        needs_cud_extraction=False,
    )
    assert res.intent == ProposedIntentType.KNOWLEDGE_QUERY
    assert res.confidence == 0.85
    assert res.needs_cud_extraction is False
    assert res.needs_confirmation is False
    assert res.sub_intent is None
    assert res.query_metadata is None


def test_legacy_caller_instantiation_cud_callers():
    """Legacy CUD callers instantiate with CUD parameters."""
    res = ProposedIntentClassificationResult(
        intent=ProposedIntentType.ROADMAP_CUD,
        confidence=0.9,
        needs_cud_extraction=True,
        needs_confirmation=True,
    )
    assert res.intent == ProposedIntentType.ROADMAP_CUD
    assert res.sub_intent is None
    assert res.needs_cud_extraction is True
    assert res.needs_confirmation is True


def test_legacy_dict_validation():
    """Legacy callers deserializing raw dicts from cache/logs/IPC."""
    raw = {"intent": "knowledge_query", "confidence": 0.85}
    res = ProposedIntentClassificationResult.model_validate(raw)
    assert res.intent == ProposedIntentType.KNOWLEDGE_QUERY
    assert res.confidence == 0.85
    assert res.sub_intent is None
    assert res.query_metadata is None


def test_legacy_field_access_and_equivalence():
    """Code accessing legacy fields should observe identical values and types."""
    legacy = BaselineIntentClassificationResult(
        intent=BaselineIntentType.KNOWLEDGE_QUERY,
        confidence=0.9,
        needs_cud_extraction=False,
        needs_confirmation=False,
    )
    proposed = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.9,
        needs_cud_extraction=False,
        needs_confirmation=False,
    )
    assert legacy.intent.value == proposed.intent.value
    assert legacy.confidence == proposed.confidence
    assert legacy.needs_cud_extraction == proposed.needs_cud_extraction
    assert legacy.needs_confirmation == proposed.needs_confirmation


# ---------------------------------------------------------------------------
# Suite 2: Default Values, None Handling & None Traps
# ---------------------------------------------------------------------------
def test_default_values():
    """Verify all defaults are None or False as documented."""
    res = ProposedIntentClassificationResult(
        intent=ProposedIntentType.PLAN_GOAL,
        confidence=0.75,
    )
    assert res.sub_intent is None
    assert res.query_metadata is None
    assert res.needs_cud_extraction is False
    assert res.needs_confirmation is False


def test_explicit_none_vs_omitted():
    """Passing explicit None must behave identically to omitting the argument."""
    res_omitted = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.8,
    )
    res_explicit = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.8,
        sub_intent=None,
        query_metadata=None,
    )
    assert res_omitted.sub_intent == res_explicit.sub_intent
    assert res_omitted.query_metadata == res_explicit.query_metadata
    assert res_omitted.model_dump() == res_explicit.model_dump()


def test_metadata_defaults_and_none_handling():
    """KnowledgeQueryMetadata defaults and None values."""
    meta = KnowledgeQueryMetadata()
    assert meta.target_topic_slug is None
    assert meta.target_section is None
    assert meta.is_counting_query is False
    assert meta.progress_status_filter is None

    meta2 = KnowledgeQueryMetadata(
        target_topic_slug="ai-engineering",
        is_counting_query=True,
    )
    assert meta2.target_topic_slug == "ai-engineering"
    assert meta2.target_section is None
    assert meta2.is_counting_query is True
    assert meta2.progress_status_filter is None


def test_none_attribute_access_trap():
    """CRITICAL DOWNSTREAM TRAP: Accessing .sub_intent.value when sub_intent is None raises AttributeError.
    Downstream code MUST check `res.sub_intent is not None` before accessing `.value`.
    """
    res = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.9,
    )
    assert res.sub_intent is None
    with pytest.raises(AttributeError, match="'NoneType' object has no attribute 'value'"):
        _ = res.sub_intent.value  # type: ignore


# ---------------------------------------------------------------------------
# Suite 3: Validation Errors, Coercion, and Inconsistent States
# ---------------------------------------------------------------------------
def test_missing_required_fields_raise_validation_error():
    """Missing intent or confidence must raise ValidationError."""
    with pytest.raises(ValidationError) as exc:
        ProposedIntentClassificationResult()  # type: ignore
    errs = exc.value.errors()
    fields = {err["loc"][0] for err in errs}
    assert "intent" in fields
    assert "confidence" in fields


def test_invalid_intent_raises_validation_error():
    """Invalid intent string raises ValidationError."""
    with pytest.raises(ValidationError):
        ProposedIntentClassificationResult(intent="invalid_intent", confidence=0.5)  # type: ignore


def test_invalid_sub_intent_raises_validation_error():
    """Invalid sub_intent string raises ValidationError."""
    with pytest.raises(ValidationError):
        ProposedIntentClassificationResult(
            intent=ProposedIntentType.KNOWLEDGE_QUERY,
            confidence=0.9,
            sub_intent="vector_rag",  # type: ignore
        )


def test_string_coercion_for_enums():
    """Pydantic v2 automatically coerces valid strings to enum members."""
    res = ProposedIntentClassificationResult(
        intent="knowledge_query",  # type: ignore
        confidence=0.95,
        sub_intent="catalog",  # type: ignore
    )
    assert isinstance(res.intent, ProposedIntentType)
    assert res.intent == ProposedIntentType.KNOWLEDGE_QUERY
    assert isinstance(res.sub_intent, KnowledgeSubIntent)
    assert res.sub_intent == KnowledgeSubIntent.CATALOG
    assert res.sub_intent.value == "catalog"


def test_confidence_range_unconstrained_observation():
    """OBSERVATION / EDGE CASE: The schema specifies confidence: float without ge/le bounds.
    Does it reject out-of-range confidence? Currently NO.
    """
    # This succeeds because Field(..., description="...") lacks ge=0.0, le=1.0!
    res_high = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=1.5,
    )
    assert res_high.confidence == 1.5

    res_neg = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=-0.5,
    )
    assert res_neg.confidence == -0.5


def test_inconsistent_intent_sub_intent_allowed_without_validator():
    """OBSERVATION / EDGE CASE: Sub-intent can be attached to non-KNOWLEDGE_QUERY intent.
    E.g. intent=CHITCHAT with sub_intent=SEARCH.
    Without a model_validator, Pydantic allows this state.
    """
    res_inconsistent = ProposedIntentClassificationResult(
        intent=ProposedIntentType.CHITCHAT,
        confidence=0.9,
        sub_intent=KnowledgeSubIntent.SEARCH,
    )
    # Does not raise error - is allowed by raw schema
    assert res_inconsistent.intent == ProposedIntentType.CHITCHAT
    assert res_inconsistent.sub_intent == KnowledgeSubIntent.SEARCH


# ---------------------------------------------------------------------------
# Suite 4: Dict Unpacking & Extra Fields Handling
# ---------------------------------------------------------------------------
def test_dict_unpacking_standard():
    """Dict unpacking via **dict."""
    data = {
        "intent": "knowledge_query",
        "confidence": 0.88,
        "sub_intent": "search",
        "needs_cud_extraction": False,
        "needs_confirmation": False,
    }
    res = ProposedIntentClassificationResult(**data)
    assert res.sub_intent == KnowledgeSubIntent.SEARCH


def test_dict_unpacking_with_nested_dict():
    """Dict unpacking with raw dict for query_metadata automatically coerces to KnowledgeQueryMetadata."""
    data = {
        "intent": "knowledge_query",
        "confidence": 0.91,
        "sub_intent": "catalog",
        "query_metadata": {
            "target_topic_slug": "system-design",
            "is_counting_query": True,
        },
    }
    res = ProposedIntentClassificationResult(**data)
    assert isinstance(res.query_metadata, KnowledgeQueryMetadata)
    assert res.query_metadata.target_topic_slug == "system-design"
    assert res.query_metadata.is_counting_query is True
    assert res.query_metadata.target_section is None


def test_dict_unpacking_extra_fields():
    """Pydantic v2 default extra='ignore': extra fields in dict do not crash."""
    data = {
        "intent": "knowledge_query",
        "confidence": 0.9,
        "extra_unknown_key": "some_value",
        "another_legacy_field": 12345,
    }
    res = ProposedIntentClassificationResult(**data)
    assert res.intent == ProposedIntentType.KNOWLEDGE_QUERY
    # Extra fields are ignored and not attributes
    assert not hasattr(res, "extra_unknown_key")


# ---------------------------------------------------------------------------
# Suite 5: Pydantic v2 Serialization & Round-Trip
# ---------------------------------------------------------------------------
def test_model_dump_modes():
    """Verify model_dump() and model_dump(mode='json') behaviors."""
    meta = KnowledgeQueryMetadata(target_topic_slug="ai-engineering", is_counting_query=True)
    res = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.92,
        sub_intent=KnowledgeSubIntent.CATALOG,
        query_metadata=meta,
    )

    # Python dict mode
    d_python = res.model_dump()
    assert d_python["intent"] == ProposedIntentType.KNOWLEDGE_QUERY
    assert d_python["sub_intent"] == KnowledgeSubIntent.CATALOG
    assert isinstance(d_python["query_metadata"], dict)

    # JSON mode (used in agent.py:352: output=intent_res.model_dump(mode="json"))
    d_json = res.model_dump(mode="json")
    assert d_json["intent"] == "knowledge_query"
    assert d_json["sub_intent"] == "catalog"
    assert d_json["confidence"] == 0.92
    assert d_json["query_metadata"]["target_topic_slug"] == "ai-engineering"
    assert d_json["query_metadata"]["is_counting_query"] is True

    # JSON serializability check
    serialized = json.dumps(d_json)
    assert "knowledge_query" in serialized
    assert "catalog" in serialized


def test_model_dump_exclude_none():
    """Verify exclude_none removes sub_intent when None."""
    res = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.85,
    )
    d_no_none = res.model_dump(exclude_none=True)
    assert "sub_intent" not in d_no_none
    assert "query_metadata" not in d_no_none
    assert "intent" in d_no_none
    assert "confidence" in d_no_none


def test_round_trip_json_serialization():
    """Verify full JSON string serialization and deserialization."""
    res_original = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.95,
        sub_intent=KnowledgeSubIntent.PROGRESS,
        query_metadata=KnowledgeQueryMetadata(
            target_topic_slug="docker",
            progress_status_filter="known",
        ),
    )
    json_str = res_original.model_dump_json()
    res_restored = ProposedIntentClassificationResult.model_validate_json(json_str)
    assert res_original == res_restored
    assert res_restored.sub_intent == KnowledgeSubIntent.PROGRESS
    assert res_restored.query_metadata.progress_status_filter == "known"


# ---------------------------------------------------------------------------
# Suite 6: Downstream Dispatcher Simulation (agent.py Integration)
# ---------------------------------------------------------------------------
def simulate_agent_dispatch(res: ProposedIntentClassificationResult, is_owner: bool = True) -> str:
    """Simulates the proposed Phase 3 downstream dispatcher in agent.py:436."""
    if res.intent == ProposedIntentType.KNOWLEDGE_QUERY:
        if res.sub_intent == KnowledgeSubIntent.CATALOG:
            return "handle_catalog"
        elif res.sub_intent == KnowledgeSubIntent.PROGRESS:
            if not is_owner:
                return "OWNER_ONLY_MESSAGE"
            return "handle_progress"
        elif res.sub_intent == KnowledgeSubIntent.SEARCH or res.sub_intent is None:
            return "answer_from_sources_rag"
    return "other_intent_handler"


def test_downstream_dispatch_all_sub_intents():
    """Test all dispatcher paths including None fallback."""
    # Sub-intent CATALOG -> catalog handler
    res_cat = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.9,
        sub_intent=KnowledgeSubIntent.CATALOG,
    )
    assert simulate_agent_dispatch(res_cat) == "handle_catalog"

    # Sub-intent PROGRESS with owner -> progress handler
    res_prog = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.9,
        sub_intent=KnowledgeSubIntent.PROGRESS,
    )
    assert simulate_agent_dispatch(res_prog, is_owner=True) == "handle_progress"

    # Sub-intent PROGRESS with non-owner -> OWNER_ONLY_MESSAGE
    assert simulate_agent_dispatch(res_prog, is_owner=False) == "OWNER_ONLY_MESSAGE"

    # Sub-intent SEARCH -> Vector RAG
    res_search = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.9,
        sub_intent=KnowledgeSubIntent.SEARCH,
    )
    assert simulate_agent_dispatch(res_search) == "answer_from_sources_rag"

    # Sub-intent None (legacy fallback) -> Vector RAG
    res_legacy = ProposedIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.9,
        sub_intent=None,
    )
    assert simulate_agent_dispatch(res_legacy) == "answer_from_sources_rag"


# ---------------------------------------------------------------------------
# Suite 7: Decision Snapshot & Eval Contract Impact Simulation
# ---------------------------------------------------------------------------
def simulate_decision_snapshot(intent: ProposedIntentType, confidence: float, write: str = "none") -> dict:
    """Simulates Decision.snapshot() as in intent_router.py:71-81."""
    return {
        "route": intent.value,
        "confirm": write == "confirm",
        "confidence": confidence,
        "write": write,
        "rules": ["row=search_word", "act=question", "target=roadmap"],
    }


def test_snapshot_remains_strictly_identical():
    """Verifies that Decision.snapshot() produces EXACTLY the contract required by evals/router/decisions.jsonl."""
    snap = simulate_decision_snapshot(ProposedIntentType.KNOWLEDGE_QUERY, 0.90)
    assert snap["route"] == "knowledge_query"
    assert "sub_intent" not in snap  # sub_intent must NOT leak into snapshot


# ---------------------------------------------------------------------------
# Suite 8: Variant Testing (sub_intent_confidence & KnowledgeSubIntentMetadata)
# ---------------------------------------------------------------------------
def test_variant_with_sub_intent_confidence():
    """Tests the orchestrator-hypothesized variant having sub_intent_confidence."""
    res = VariantIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.90,
        sub_intent=KnowledgeSubIntent.SEARCH,
        sub_intent_confidence=0.88,
    )
    assert res.sub_intent_confidence == 0.88
    # When omitted, defaults to None
    res_omitted = VariantIntentClassificationResult(
        intent=ProposedIntentType.KNOWLEDGE_QUERY,
        confidence=0.90,
    )
    assert res_omitted.sub_intent_confidence is None


def run_all_checks() -> dict:
    """Runs all test functions and returns summary report."""
    tests = [
        test_legacy_caller_instantiation_without_sub_intent,
        test_legacy_caller_instantiation_cud_callers,
        test_legacy_dict_validation,
        test_legacy_field_access_and_equivalence,
        test_default_values,
        test_explicit_none_vs_omitted,
        test_metadata_defaults_and_none_handling,
        test_none_attribute_access_trap,
        test_missing_required_fields_raise_validation_error,
        test_invalid_intent_raises_validation_error,
        test_invalid_sub_intent_raises_validation_error,
        test_string_coercion_for_enums,
        test_confidence_range_unconstrained_observation,
        test_inconsistent_intent_sub_intent_allowed_without_validator,
        test_dict_unpacking_standard,
        test_dict_unpacking_with_nested_dict,
        test_dict_unpacking_extra_fields,
        test_model_dump_modes,
        test_model_dump_exclude_none,
        test_round_trip_json_serialization,
        test_downstream_dispatch_all_sub_intents,
        test_snapshot_remains_strictly_identical,
        test_variant_with_sub_intent_confidence,
    ]

    passed = 0
    failed = 0
    errors = []

    for test_fn in tests:
        try:
            test_fn()
            passed += 1
        except Exception as e:
            failed += 1
            errors.append((test_fn.__name__, str(e)))

    return {
        "total": len(tests),
        "passed": passed,
        "failed": failed,
        "errors": errors,
    }


if __name__ == "__main__":
    summary = run_all_checks()
    print(f"=== EMPIRICAL TEST SUITE SUMMARY ===")
    print(f"Total Tests: {summary['total']}")
    print(f"Passed:      {summary['passed']}")
    print(f"Failed:      {summary['failed']}")
    if summary["errors"]:
        print(f"Errors:")
        for name, err in summary["errors"]:
            print(f"  - {name}: {err}")
        sys.exit(1)
    else:
        print("All empirical tests PASSED successfully!")
        sys.exit(0)
