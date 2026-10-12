"""Unit tests for NLP cleaner, entity extraction, and short code generator (Vietnamese & English)."""

from __future__ import annotations

import pytest
from rag_service.nlp_cleaner import (
    expand_contracted_titles,
    extract_group_creation_params,
    extract_item_creation_params,
    extract_layer_creation_params,
    extract_topic_names,
    generate_short_code,
    normalize_level,
)


# ── TOPIC TESTS (VN + EN) ────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("prompt", "expected_topics", "expected_codes"),
    [
        # Vietnamese single
        ("tạo ABC topic", ["ABC"], ["ABC"]),
        ("tạo topic ABC", ["ABC"], ["ABC"]),
        ("tạo cho tôi ABC topic", ["ABC"], ["ABC"]),
        ("tạo giúp mình ABC topic với nhé", ["ABC"], ["ABC"]),
        ("tạo ABC roadmap", ["ABC"], ["ABC"]),
        ("tạo ABC chủ đề", ["ABC"], ["ABC"]),
        ("thêm XYZ topic", ["XYZ"], ["XYZ"]),
        ('tạo "ABC" topic', ["ABC"], ["ABC"]),
        ("tạo ABC", ["ABC"], ["ABC"]),
        ("tạo AI Engineering topic", ["AI Engineering"], ["AI"]),
        ("tạo Cloud DevOps roadmap", ["Cloud DevOps"], ["CD"]),
        # Vietnamese batch
        ("tạo cho tôi 2 topic: A, B cho tôi", ["A", "B"], ["A", "B"]),
        ("tạo cho tôi 3 topic A, B và C", ["A", "B", "C"], ["A", "B", "C"]),
        ("thêm 2 topic Frontend và Backend với", ["Frontend", "Backend"], ["FRO", "BAC"]),
        ("tạo A và B topic", ["A", "B"], ["A", "B"]),
        # English single
        ("create ABC topic", ["ABC"], ["ABC"]),
        ("create topic ABC", ["ABC"], ["ABC"]),
        ("create topic AI Engineering", ["AI Engineering"], ["AI"]),
        ("add topic Database", ["Database"], ["DAT"]),
        ("make topic Cloud Infrastructure", ["Cloud Infrastructure"], ["CI"]),
        # English batch
        ("create 2 topics Frontend and Backend", ["Frontend", "Backend"], ["FRO", "BAC"]),
        ("create 3 topics A, B and C", ["A", "B", "C"], ["A", "B", "C"]),
        ("create A and B topics", ["A", "B"], ["A", "B"]),
    ],
)
def test_extract_and_generate_code(prompt, expected_topics, expected_codes):
    topics = extract_topic_names(prompt)
    assert topics == expected_topics
    codes = [generate_short_code(t) for t in topics]
    assert codes == expected_codes


def test_short_code_generator_acronyms():
    assert generate_short_code("ABC") == "ABC"
    assert generate_short_code("AI") == "AI"
    assert generate_short_code("AWS") == "AWS"
    assert generate_short_code("ML") == "ML"
    assert generate_short_code("AI Engineering") == "AI"
    assert generate_short_code("Cloud DevOps") == "CD"
    assert generate_short_code("Next.js") == "NEX"


def test_expand_contracted_titles():
    assert expand_contracted_titles(["mock 1", "2"]) == ["mock 1", "mock 2"]
    assert expand_contracted_titles(["mock 1", "2", "3"]) == ["mock 1", "mock 2", "mock 3"]
    assert expand_contracted_titles(["layer A", "B"]) == ["layer A", "layer B"]
    assert expand_contracted_titles(["level 1", "2"]) == ["level 1", "level 2"]
    assert expand_contracted_titles(["Frontend", "Backend"]) == ["Frontend", "Backend"]


# ── LAYER TESTS (VN + EN) ────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("prompt", "expected_titles", "expected_slug"),
    [
        # English single
        ("create aaa layer on fe", ["aaa"], "fe"),
        ("create aaa layer on fe?", ["aaa"], "fe"),
        ("create layer aaa on fe", ["aaa"], "fe"),
        ("create aaa layer on fe topic", ["aaa"], "fe"),
        ("add layer Database to topic ai-engineering", ["Database"], "ai-engineering"),
        # Vietnamese single
        ("tạo layer aaa trong topic fe", ["aaa"], "fe"),
        ("thêm layer Database vào topic ai-engineering", ["Database"], "ai-engineering"),
        ("tạo aaa layer cho fe", ["aaa"], "fe"),
        ("thêm layer Fundamentals vào fe", ["Fundamentals"], "fe"),
        # English batch
        ("create 2 layers mock 1 and 2 on be topic", ["mock 1", "mock 2"], "be"),
        ("create mock 1 and 2 layers on be", ["mock 1", "mock 2"], "be"),
        ("add 3 layers A, B and C to topic be", ["A", "B", "C"], "be"),
        # Vietnamese batch
        ("tạo 2 layer mock 1 và 2 trong be topic", ["mock 1", "mock 2"], "be"),
        ("tạo 2 layer mock 1 và mock 2 trong be topic", ["mock 1", "mock 2"], "be"),
        ("thêm 3 layer A, B và C vào topic be", ["A", "B", "C"], "be"),
        ("tạo mock 1 và 2 layers trong topic be", ["mock 1", "mock 2"], "be"),
    ],
)
def test_extract_layer_creation_params(prompt, expected_titles, expected_slug):
    res = extract_layer_creation_params(prompt)
    assert res is not None
    titles, slug = res
    assert titles == expected_titles
    assert slug == expected_slug


# ── GROUP TESTS (VN + EN) ────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("prompt", "expected_titles", "expected_layer", "expected_level"),
    [
        # Vietnamese
        ("tạo group Core trong layer aaa", ["Core"], "aaa", ""),
        ("thêm nhóm Advanced vào layer 02-AAA", ["Advanced"], "02-AAA", ""),
        ("tạo 2 group Core và Advanced trong layer mock 1", ["Core", "Advanced"], "mock 1", ""),
        ("tạo 2 group mock 1 và 2 trong layer aaa", ["mock 1", "mock 2"], "aaa", ""),
        ("thêm nhóm Cơ bản vào layer 01-GEN", ["Cơ bản"], "01-GEN", ""),
        # English
        ("create group Core in layer aaa", ["Core"], "aaa", ""),
        ("add group Advanced to layer 02-AAA", ["Advanced"], "02-AAA", ""),
        ("create 2 groups Core and Advanced in layer mock 1", ["Core", "Advanced"], "mock 1", ""),
        ("create group Intermediate on layer 01-DB", ["Intermediate"], "01-DB", ""),
    ],
)
def test_extract_group_creation_params(prompt, expected_titles, expected_layer, expected_level):
    res = extract_group_creation_params(prompt)
    assert res is not None
    titles, layer_id, level = res
    assert titles == expected_titles
    assert layer_id == expected_layer
    assert level == expected_level


# ── ITEM TESTS (VN + EN) ─────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("prompt", "expected_titles", "expected_layer", "expected_level"),
    [
        # Vietnamese
        ("tạo item Prompt Engineering trong layer 01-LLM level core", ["Prompt Engineering"], "01-LLM", "core"),
        ("thêm 3 item: Vector DB, Embeddings, RAG Pipeline vào layer 01-LLM level core", ["Vector DB", "Embeddings", "RAG Pipeline"], "01-LLM", "core"),
        ("tạo 2 item mock 1 và 2 trong layer aaa level core", ["mock 1", "mock 2"], "aaa", "core"),
        ("thêm 2 item mock 1 và 2 vào layer mock 1 level core", ["mock 1", "mock 2"], "mock 1", "core"),
        ("thêm bài học Docker Basics vào layer devops", ["Docker Basics"], "devops", "core"),
        # English
        ("create item Prompt Engineering in layer 01-LLM level core", ["Prompt Engineering"], "01-LLM", "core"),
        ("add 3 items: Vector DB, Embeddings, RAG Pipeline to layer 01-LLM level core", ["Vector DB", "Embeddings", "RAG Pipeline"], "01-LLM", "core"),
        ("create 2 items mock 1 and 2 in layer 02-MOC level advanced", ["mock 1", "mock 2"], "02-MOC", "advanced"),
        ("create items A, B and C in layer aaa", ["A", "B", "C"], "aaa", "core"),
    ],
)
def test_extract_item_creation_params(prompt, expected_titles, expected_layer, expected_level):
    res = extract_item_creation_params(prompt)
    assert res is not None
    titles, layer_id, level = res
    assert titles == expected_titles
    assert layer_id == expected_layer
    assert level == expected_level


def test_normalize_level():
    assert normalize_level("core") == "core"
    assert normalize_level("cơ bản") == "core"
    assert normalize_level("basic") == "core"
    assert normalize_level("advanced") == "advanced"
    assert normalize_level("nâng cao") == "advanced"
    assert normalize_level("intermediate") == "intermediate"
    assert normalize_level("trung cấp") == "intermediate"
