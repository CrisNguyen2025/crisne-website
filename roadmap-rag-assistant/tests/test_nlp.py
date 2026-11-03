"""Unit tests for NLP cleaner and entity extraction (Vietnamese & English)."""

from __future__ import annotations

import pytest
from rag_service.nlp_cleaner import (
    expand_contracted_titles,
    extract_item_creation_params,
    extract_topic_names,
)


# ── TOPIC TESTS (VN + EN) ────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("prompt", "expected_topics"),
    [
        # Vietnamese single
        ("tạo ABC topic", ["ABC"]),
        ("tạo topic ABC", ["ABC"]),
        ("tạo cho tôi ABC topic", ["ABC"]),
        ("tạo giúp mình ABC topic với nhé", ["ABC"]),
        ("tạo ABC roadmap", ["ABC"]),
        ("tạo ABC chủ đề", ["ABC"]),
        ("thêm XYZ topic", ["XYZ"]),
        ('tạo "ABC" topic', ["ABC"]),
        ("tạo ABC", ["ABC"]),
        ("tạo AI Engineering topic", ["AI Engineering"]),
        ("tạo Cloud DevOps roadmap", ["Cloud DevOps"]),
        # Vietnamese batch
        ("tạo cho tôi 2 topic: A, B cho tôi", ["A", "B"]),
        ("tạo cho tôi 3 topic A, B và C", ["A", "B", "C"]),
        ("thêm 2 topic Frontend và Backend với", ["Frontend", "Backend"]),
        ("tạo A và B topic", ["A", "B"]),
        # English single
        ("create ABC topic", ["ABC"]),
        ("create topic ABC", ["ABC"]),
        ("create topic AI Engineering", ["AI Engineering"]),
        ("add topic Database", ["Database"]),
        ("make topic Cloud Infrastructure", ["Cloud Infrastructure"]),
        # English batch
        ("create 2 topics Frontend and Backend", ["Frontend", "Backend"]),
        ("create 3 topics A, B and C", ["A", "B", "C"]),
        ("create A and B topics", ["A", "B"]),
    ],
)
def test_extract_topic_names(prompt, expected_topics):
    assert extract_topic_names(prompt) == expected_topics


def test_expand_contracted_titles():
    assert expand_contracted_titles(["mock 1", "2"]) == ["mock 1", "mock 2"]
    assert expand_contracted_titles(["mock 1", "2", "3"]) == ["mock 1", "mock 2", "mock 3"]
    assert expand_contracted_titles(["layer A", "B"]) == ["layer A", "layer B"]
    assert expand_contracted_titles(["level 1", "2"]) == ["level 1", "level 2"]
    assert expand_contracted_titles(["Frontend", "Backend"]) == ["Frontend", "Backend"]


# ── ITEM TESTS (VN + EN) ─────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("prompt", "expected_titles", "expected_topic"),
    [
        # Vietnamese
        ("tạo item Prompt Engineering trong topic ai-engineering", ["Prompt Engineering"], "ai-engineering"),
        ("thêm 3 item: Vector DB, Embeddings, RAG Pipeline vào topic ai-engineering", ["Vector DB", "Embeddings", "RAG Pipeline"], "ai-engineering"),
        ("tạo 2 item mock 1 và 2 trong topic aaa", ["mock 1", "mock 2"], "aaa"),
        ("thêm 2 item mock 1 và 2 vào topic mock 1", ["mock 1", "mock 2"], "mock 1"),
        ("thêm bài học Docker Basics vào topic devops", ["Docker Basics"], "devops"),
        # English
        ("create item Prompt Engineering in topic ai-engineering", ["Prompt Engineering"], "ai-engineering"),
        ("add 3 items: Vector DB, Embeddings, RAG Pipeline to topic ai-engineering", ["Vector DB", "Embeddings", "RAG Pipeline"], "ai-engineering"),
        ("create 2 items mock 1 and 2 in topic be", ["mock 1", "mock 2"], "be"),
        ("create items A, B and C in topic aaa", ["A", "B", "C"], "aaa"),
    ],
)
def test_extract_item_creation_params(prompt, expected_titles, expected_topic):
    res = extract_item_creation_params(prompt)
    assert res is not None
    titles, topic = res
    assert titles == expected_titles
    assert topic == expected_topic
