"""Unit tests for Vietnamese normalization (Unicode NFC and tone mark placement)."""

from __future__ import annotations

import unicodedata

import pytest
from rag_service.router.intent_router import IntentRouter
from rag_service.router.schemas import IntentType
from rag_service.router.vietnamese import normalize_vietnamese


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # Open syllable: traditional placement moves to the modern one
        ("xoá topic", "xóa topic"),
        ("huỷ", "hủy"),
        ("khoẻ", "khỏe"),
        ("hoà", "hòa"),
        ("thuý", "thúy"),
        ("XOÁ", "XÓA"),
        ("Hoà", "Hòa"),
    ],
)
def test_open_syllable_tone_is_modernized(text, expected):
    assert normalize_vietnamese(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        # A final letter keeps the tone on the main vowel in both styles
        "lập kế hoạch",
        "hoạt động",
        "toán học",
        "hoàn thành",
        "huỳnh",
        "khuỵu",
        "HOÀN",
        # After 'q' the 'u' belongs to the consonant
        "quý",
        "Quý",
        "quỳnh",
        "QUÝ",
    ],
)
def test_correct_words_are_unchanged(text):
    assert normalize_vietnamese(text) == text


def test_nfd_input_is_composed():
    nfd = unicodedata.normalize("NFD", "hoạt động")
    assert normalize_vietnamese(nfd) == "hoạt động"


def test_plan_keyword_matches_after_normalization():
    res = IntentRouter().classify_heuristics("lập kế hoạch học DevOps trong 3 tháng")
    assert res is not None and res.intent == IntentType.PLAN_GOAL
