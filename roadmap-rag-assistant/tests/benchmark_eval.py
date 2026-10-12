"""Automated Evaluation & Intelligence Benchmark Suite for Roadmap Assistant.

Evaluates:
- Entity extraction precision (Zero verb leakage, pure title extraction)
- Acronym & short-code derivation (No 'TAT' bugs)
- Contracted enumeration expansion (mock 1 và 2 -> ['mock 1', 'mock 2'])
- Multi-turn anaphora resolution ('vào đó' -> active_topic_slug)
- Real Database Knowledge Retrieval accuracy
"""

from __future__ import annotations

import asyncio
from typing import NamedTuple
import pytest

from rag_service.rag.rag_engine import rag_engine
from rag_service.router import (
    ActionType,
    EntityLevel,
    StructuredEntityExtractor,
)
from rag_service.state import AnaphoraResolver, session_store


class BenchmarkTestCase(NamedTuple):
    prompt: str
    expected_action: ActionType
    expected_level: EntityLevel
    expected_titles: list[str]
    forbidden_in_titles: list[str]
    expected_parent: str | None = None
    expected_short_code: str | None = None


BENCHMARK_DATASET: list[BenchmarkTestCase] = [
    # ── 1. TOPIC CREATION (Zero Verb Leakage & Clean Short Codes) ─────────────
    BenchmarkTestCase(
        prompt="tạo ABC topic",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["ABC"],
        forbidden_in_titles=["tạo", "topic"],
        expected_short_code="ABC",
    ),
    BenchmarkTestCase(
        prompt="create topic AI Engineering",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["AI Engineering"],
        forbidden_in_titles=["create", "topic"],
    ),
    BenchmarkTestCase(
        prompt="thêm topic Backend Go cho tôi với nhé",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["Backend Go"],
        forbidden_in_titles=["thêm", "topic", "cho tôi"],
    ),
    BenchmarkTestCase(
        prompt="create 2 topics Frontend and Backend",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["Frontend", "Backend"],
        forbidden_in_titles=["create", "topics"],
    ),
    BenchmarkTestCase(
        prompt="tạo 3 topic A, B và C",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["A", "B", "C"],
        forbidden_in_titles=["tạo", "topic"],
    ),
    BenchmarkTestCase(
        prompt="xoá abc topic",
        expected_action=ActionType.DELETE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["abc"],
        forbidden_in_titles=["xoá", "xóa", "topic"],
        expected_short_code="ABC",
    ),
    BenchmarkTestCase(
        prompt="xóa abc topic",
        expected_action=ActionType.DELETE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["abc"],
        forbidden_in_titles=["xoá", "xóa", "topic"],
        expected_short_code="ABC",
    ),
    BenchmarkTestCase(
        prompt="xóa aaa topic giúp tôi đi bạn",
        expected_action=ActionType.DELETE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["aaa"],
        forbidden_in_titles=["xóa", "topic", "giúp", "tôi", "đi", "bạn"],
        expected_short_code="AAA",
    ),
    BenchmarkTestCase(
        prompt="xóa topic aaa giúp tôi với bạn ơi",
        expected_action=ActionType.DELETE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["aaa"],
        forbidden_in_titles=["xóa", "topic", "giúp", "tôi", "với", "bạn", "ơi"],
        expected_short_code="AAA",
    ),
    BenchmarkTestCase(
        prompt="xoá abc topiccc",
        expected_action=ActionType.DELETE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["abc"],
        forbidden_in_titles=["xoá", "xóa", "topic", "topiccc"],
        expected_short_code="ABC",
    ),
    BenchmarkTestCase(
        prompt="xoá abc topicc",
        expected_action=ActionType.DELETE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["abc"],
        forbidden_in_titles=["xoá", "xóa", "topic", "topicc"],
        expected_short_code="ABC",
    ),
    BenchmarkTestCase(
        prompt="xoá abc",
        expected_action=ActionType.DELETE,
        expected_level=EntityLevel.TOPIC,
        expected_titles=["abc"],
        forbidden_in_titles=["xoá", "xóa"],
        expected_short_code="ABC",
    ),

    # ── 2. LAYER CREATION (Contracted Numbers & Parent Association) ───────────
    BenchmarkTestCase(
        prompt="create aaa layer on fe",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.LAYER,
        expected_titles=["aaa"],
        forbidden_in_titles=["create", "layer", "on", "fe"],
        expected_parent="fe",
    ),
    BenchmarkTestCase(
        prompt="tạo 2 layer mock 1 và 2 trong be topic",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.LAYER,
        expected_titles=["mock 1", "mock 2"],
        forbidden_in_titles=["tạo", "layer", "trong", "be"],
        expected_parent="be",
    ),
    BenchmarkTestCase(
        prompt="create 2 layers mock 1 and 2 on be topic",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.LAYER,
        expected_titles=["mock 1", "mock 2"],
        forbidden_in_titles=["create", "layers", "on", "be"],
        expected_parent="be",
    ),
    BenchmarkTestCase(
        prompt="thêm layer Database Architecture vào topic ai-architecture",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.LAYER,
        expected_titles=["Database Architecture"],
        forbidden_in_titles=["thêm", "layer", "vào"],
        expected_parent="ai-architecture",
    ),

    # ── 3. GROUP CREATION ─────────────────────────────────────────────────────
    BenchmarkTestCase(
        prompt="create group Core in layer 02-AAA",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.GROUP,
        expected_titles=["Core"],
        forbidden_in_titles=["create", "group", "in"],
        expected_parent="02-AAA",
    ),
    BenchmarkTestCase(
        prompt="tạo nhóm Advanced trong layer mock 1",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.GROUP,
        expected_titles=["Advanced"],
        forbidden_in_titles=["tạo", "nhóm", "trong"],
        expected_parent="mock 1",
    ),

    # ── 4. ITEM CREATION ──────────────────────────────────────────────────────
    BenchmarkTestCase(
        prompt="thêm 3 item bài 1, 2 và 3 vào layer 01-LLM level core",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.ITEM,
        expected_titles=["bài 1", "bài 2", "bài 3"],
        forbidden_in_titles=["thêm", "item", "vào", "level"],
        expected_parent="01-LLM",
    ),
    BenchmarkTestCase(
        prompt="create item Prompt Engineering in layer 01-LLM level core",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.ITEM,
        expected_titles=["Prompt Engineering"],
        forbidden_in_titles=["create", "item", "in"],
        expected_parent="01-LLM",
    ),
    BenchmarkTestCase(
        prompt="add 3 items: Vector DB, Embeddings, RAG Pipeline to layer 01-LLM level core",
        expected_action=ActionType.CREATE,
        expected_level=EntityLevel.ITEM,
        expected_titles=["Vector DB", "Embeddings", "RAG Pipeline"],
        forbidden_in_titles=["add", "items", "to"],
        expected_parent="01-LLM",
    ),
]


@pytest.mark.asyncio
async def test_benchmark_suite_accuracy():
    """Run full intelligence benchmark and verify zero-defect accuracy."""
    extractor = StructuredEntityExtractor(llm_model=None)
    passed_cases = 0
    total_cases = len(BENCHMARK_DATASET)
    failures = []

    for idx, case in enumerate(BENCHMARK_DATASET, 1):
        action = await extractor.aextract(case.prompt)

        errors = []
        if action.action != case.expected_action:
            errors.append(f"Action mismatch: expected {case.expected_action}, got {action.action}")

        if action.entity_level != case.expected_level:
            errors.append(f"Level mismatch: expected {case.expected_level}, got {action.entity_level}")

        extracted_titles = [e.title.lower() for e in action.entities]
        for exp in case.expected_titles:
            if exp.lower() not in extracted_titles:
                errors.append(f"Missing expected title '{exp}' in {extracted_titles}")

        for forbidden in case.forbidden_in_titles:
            for t in extracted_titles:
                if forbidden.lower() in t.split():
                    errors.append(f"Forbidden word '{forbidden}' leaked into title '{t}'")

        if case.expected_parent:
            if action.target_parent_identifier != case.expected_parent:
                errors.append(f"Parent mismatch: expected '{case.expected_parent}', got '{action.target_parent_identifier}'")

        if case.expected_short_code:
            extracted_codes = [e.short_code for e in action.entities if e.short_code]
            if case.expected_short_code not in extracted_codes:
                errors.append(f"Short code mismatch: expected '{case.expected_short_code}', got {extracted_codes}")

        if not errors:
            passed_cases += 1
        else:
            failures.append((case.prompt, errors))

    accuracy = (passed_cases / total_cases) * 100
    print(f"\n🎯 BENCHMARK RESULT: {passed_cases}/{total_cases} Passed ({accuracy:.1f}%)")

    for prompt, errs in failures:
        print(f"❌ FAILED: \"{prompt}\"")
        for e in errs:
            print(f"   -> {e}")

    assert accuracy >= 95.0, f"Benchmark accuracy too low: {accuracy:.1f}%"


@pytest.mark.asyncio
async def test_benchmark_live_rag_search():
    """Verify live knowledge search retrieves real database items."""
    await rag_engine.sync_live_database()
    matches = await rag_engine.search_live_knowledge("Knowledge Base", limit=3)
    assert len(matches) > 0
    assert any("Knowledge Base" in doc.title for doc, _ in matches)

    db_matches = await rag_engine.search_live_knowledge("Database", limit=3)
    assert len(db_matches) > 0
    assert any("Database" in doc.title for doc, _ in db_matches)


@pytest.mark.asyncio
async def test_benchmark_anaphora_resolution():
    """Verify multi-turn reference resolution without user repeating context."""
    extractor = StructuredEntityExtractor(llm_model=None)
    sid = "benchmark-turn-session"

    # Turn 1: Create Golang topic
    session_store.set_active_topic(sid, slug="golang-backend", title="Golang Backend")

    # Turn 2: User says 'thêm 2 layer syntax và concurrency vào đó'
    action = await extractor.aextract("thêm 2 layer syntax và concurrency vào đó")
    resolved, note = AnaphoraResolver.resolve_action(action, session_id=sid)

    assert resolved.entity_level == EntityLevel.LAYER
    assert resolved.target_parent_identifier == "golang-backend"
    assert "syntax" in [e.title.lower() for e in resolved.entities]
    assert "concurrency" in [e.title.lower() for e in resolved.entities]
    assert note is not None
