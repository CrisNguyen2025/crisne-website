"""Focus: the topic a message is about, once its question frame is removed."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from rag_service.domains.roadmap.router.focus import focus_of, focus_written


@pytest.mark.parametrize("text,focus", [
    ("bạn có biết thông tin về telegram k", "telegram"),
    ("ban co biet thong tin ve telegram k", "telegram"),
    ("bạn có biết thông tin về RLHF không", "rlhf"),
    ("cho mình hỏi chút là semantic caching dùng làm gì", "semantic caching"),
    ("Hybrid Search là gì", "hybrid search"),
    ("what is a vector database", "vector database"),
    ("tell me about Instagram reels", "instagram reels"),
    ("giải thích knowledge distillation cho mình", "knowledge distillation"),
    ("mình muốn tìm hiểu về context window", "context window"),
    ("tom tat giup minh ve prompt injection", "prompt injection"),
    ("so sánh GAN và VAE", "gan | vae"),
    ("speculative decoding là gì vậy", "speculative decoding"),
    ("Kafka thì sao", "kafka"),
    ("con trỏ trong C là gì", "con tro trong c"),  # "con" is part of the topic here
])
def test_frame_is_removed_and_the_topic_kept(text, focus):
    assert focus_of(text) == focus


@pytest.mark.parametrize("text", [
    "bài đó sao", "?", "cái kia thì sao", "thế còn cái trên", "hmm", "ok vậy còn gì nữa",
    "vậy à", "nó là gì", "bài trên thì sao", "cái này là gì", "còn nữa không", "ừ", "thế à",
])
def test_message_without_a_topic_has_no_focus(text):
    assert focus_of(text) is None


def test_every_scope_sample_with_a_topic_has_a_focus_and_none_without():
    path = Path(__file__).resolve().parents[1] / "evals/datasets/_scope/samples.jsonl"
    for line in path.read_text(encoding="utf-8").splitlines():
        sample = json.loads(line)
        has_topic = sample["expected"]["target"] != "none"
        assert (focus_of(sample["input"]) is not None) == has_topic, sample["input"]


@pytest.mark.parametrize("text,focus", [
    ("ờ cho mình hỏi là cái vector database ấy nó khác gì với database bình thường à", "vector database"),
    ("ừm cái semantic caching ấy dùng làm gì", "semantic caching"),
    ("ờ thì là mình muốn hỏi về reranking", "reranking"),
    ("bạn ơi bạn có biết cái gì về ờ cái telegram không", "telegram"),
    ("a b testing là gì", "a b testing"),  # "à" folds to "a": not a filler
])
def test_spoken_fillers_and_cai_x_ay_leave_the_topic(text, focus):
    assert focus_of(text) == focus


# ── A reply names the topic as written (2026-10-28, live: "cach fine-tune llama 3 bang lora tren 1 gpu") ──


@pytest.mark.parametrize("text,written", [
    ("cách fine-tune Llama 3 bằng LoRA trên 1 GPU", "fine-tune Llama 3 bằng LoRA trên 1 GPU"),
    ("bạn có biết thông tin về Telegram không", "Telegram"),
])
def test_written_focus_keeps_tones_and_case(text, written):
    assert written in focus_written(text)


def test_written_focus_is_none_without_a_topic():
    assert focus_written("bài đó sao") is None
