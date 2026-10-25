"""Roadmap on-topic gate: lessons that share no content word with the question are dropped before the LLM."""

from __future__ import annotations

from types import SimpleNamespace

from rag_service.domains.roadmap.retrieval.relevance import content_words, corpus_vocabulary, filter_on_topic


def _doc(title: str, description: str = "", content: str = ""):
    return SimpleNamespace(title=title, description=description, content_text=content, searchable_text=title)


def test_question_about_an_uncovered_topic_keeps_nothing():
    matches = [(_doc("Prompt Versioning & Registry"), 0.6), (_doc("Production Readiness Checklist"), 0.6)]
    assert filter_on_topic("Có bài nào về Kubernetes và Helm chart không?", matches) == []


def test_on_topic_question_keeps_the_matching_lesson():
    hybrid = (_doc("Hybrid Search", "Kết hợp BM25 và vector"), 0.9)
    other = (_doc("Chunking Strategy"), 0.8)
    assert filter_on_topic("Bài Hybrid Search là gì?", [hybrid, other]) == [hybrid]


def test_question_words_alone_do_not_count_as_a_match():
    assert "có" not in content_words("Có bài nào không?")
    assert content_words("Có bài nào không?") == set()


def test_query_without_content_words_is_left_to_the_search():
    matches = [(_doc("Hybrid Search"), 0.9)]
    assert filter_on_topic("bài nào?", matches) == matches


def test_question_without_diacritics_matches_a_lesson_with_them():
    chunking = (_doc("Chunking Strategy", "Chiến lược chia nhỏ tài liệu trước khi embedding"), 0.7)
    assert filter_on_topic("cach chia nho tai lieu truoc khi embed", [chunking]) == [chunking]


def test_question_words_are_ignored_with_or_without_diacritics():
    assert content_words("co bai nao khong?") == set()


def _model_lessons():
    return [
        (_doc("Model Routing & Cascading", "Chọn mô hình theo độ khó của câu hỏi"), 0.7),
        (_doc("Hybrid Search", "Kết hợp BM25 và vector retrieval cho mô hình"), 0.7),
    ]


def test_question_naming_only_unknown_techniques_keeps_nothing():
    lessons = _model_lessons()
    vocabulary = corpus_vocabulary(doc for doc, _ in lessons)
    # "mô hình" is shared with every lesson, but LoRA and fine-tuning are in none of them
    assert filter_on_topic("fine-tuning mô hình bằng LoRA", lessons, vocabulary) == []


def test_misspelled_known_term_still_matches():
    lessons = _model_lessons()
    vocabulary = corpus_vocabulary(doc for doc, _ in lessons)
    assert filter_on_topic("hybird search", lessons, vocabulary) == [lessons[1]]


def test_one_known_term_is_enough_to_keep_matches():
    lessons = _model_lessons()
    vocabulary = corpus_vocabulary(doc for doc, _ in lessons)
    assert filter_on_topic("Website có bài nào về vector retrieval không?", lessons, vocabulary) == [lessons[1]]


def test_short_word_of_another_length_is_not_a_typo_match():
    lessons = [(_doc("Đánh giá từng bước", "Kiểm tra từng câu trả lời"), 0.7)]
    vocabulary = corpus_vocabulary(doc for doc, _ in lessons)
    assert filter_on_topic("tuning câu trả lời", lessons, vocabulary) == []
