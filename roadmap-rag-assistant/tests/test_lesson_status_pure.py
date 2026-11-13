"""Unit tests for pure sorting, filtering, and parsing in lesson_status.py (Step 1)."""

import pytest
from rag_service.domains.roadmap.lesson_status import (
    asks_next_learning,
    asks_review,
    asks_what_i_know,
    filter_and_sort_next_lessons,
    filter_and_sort_review_lessons,
    filter_known_lessons,
    format_next_learning_reply,
    format_review_reply,
    format_what_i_know_reply,
    parse_status_change_request,
)


def test_review_lessons_null_status_updated_at_first_then_ascending():
    items = [
        {"id": "1", "title": "Lesson 1", "status": "known", "statusUpdatedAt": "2026-10-01T10:00:00Z"},
        {"id": "2", "title": "Lesson 2", "status": "known", "statusUpdatedAt": None},
        {"id": "3", "title": "Lesson 3", "status": "known", "statusUpdatedAt": "2026-09-01T10:00:00Z"},
        {"id": "4", "title": "Lesson 4", "status": "learning"},
        {"id": "5", "title": "Lesson 5", "status": "target"},
        {"id": "6", "title": "Lesson 6"},  # default known, statusUpdatedAt null
    ]

    result = filter_and_sort_review_lessons(items)
    # Only known items: 1, 2, 3, 6
    assert len(result) == 4
    # Nulls first: 2 and 6
    assert result[0]["id"] in ("2", "6")
    assert result[1]["id"] in ("2", "6")
    # Then ascending: 2026-09-01 before 2026-10-01
    assert result[2]["id"] == "3"
    assert result[3]["id"] == "1"


def test_next_lessons_learning_first_then_target():
    items = [
        {"id": "1", "title": "Known Lesson", "status": "known"},
        {"id": "2", "title": "Learning Lesson 1", "status": "learning"},
        {"id": "3", "title": "Target Lesson 1", "status": "target"},
        {"id": "4", "title": "Learning Lesson 2", "status": "learning"},
        {"id": "5", "title": "Target Lesson 2", "status": "target"},
    ]

    learning, target = filter_and_sort_next_lessons(items)
    assert [i["id"] for i in learning] == ["2", "4"]
    assert [i["id"] for i in target] == ["3", "5"]


def test_filter_known_lessons():
    items = [
        {"id": "1", "status": "known"},
        {"id": "2", "status": "learning"},
        {"id": "3", "status": "target"},
        {"id": "4"},  # default known
    ]
    known = filter_known_lessons(items)
    assert [i["id"] for i in known] == ["1", "4"]


def test_format_replies():
    # Empty review
    rep_empty = format_review_reply([], "AI")
    assert "chưa có bài nào" in rep_empty.lower()

    # Formatted review
    rep = format_review_reply([{"title": "Chunking", "topic_title": "RAG"}])
    assert "Chunking" in rep
    assert "Các bài cần ôn lại" in rep

    # Next learning
    learning = [{"title": "RAG Intro"}]
    target = [{"title": "Agentic Workflows"}]
    rep_next = format_next_learning_reply(learning, target, "AI")
    assert "RAG Intro" in rep_next
    assert "Agentic Workflows" in rep_next
    assert "Đang học" in rep_next
    assert "Mục tiêu" in rep_next

    # What I know
    rep_kwn = format_what_i_know_reply([{"title": "Python"}], "AI")
    assert "Python" in rep_kwn
    assert "Đã nắm" in rep_kwn


def test_parse_status_change_request_valid():
    cases = [
        ("đánh dấu bài Prompt Engineering là đang học", "Prompt Engineering", "learning"),
        ("chuyển bài Vector Search sang đã nắm", "Vector Search", "known"),
        ("đặt bài Chunking thành mục tiêu", "Chunking", "target"),
        ("mark lesson RAG as known", "RAG", "known"),
        ("cập nhật trạng thái bài 'Hybrid Search' sang đang học", "Hybrid Search", "learning"),
        ("đổi trạng thái bài này thành mục tiêu", "", "target"),
    ]
    for msg, exp_lesson, exp_status in cases:
        req = parse_status_change_request(msg)
        assert req is not None, f"Failed to parse '{msg}'"
        assert req.lesson == exp_lesson, f"Wrong lesson in '{msg}': got {req.lesson}"
        assert req.new_status == exp_status, f"Wrong status in '{msg}': got {req.new_status}"


def test_parse_status_change_request_non_change():
    # Sentences that must NOT be parsed as status changes
    non_changes = [
        "tôi đang học RAG, giải thích chunking",
        "tôi đang học python",
        "bài nào cần ôn lại",
        "nên học gì tiếp",
        "tôi đang biết gì về AI Architecture",
        "giải thích về Prompt Engineering",
    ]
    for msg in non_changes:
        req = parse_status_change_request(msg)
        assert req is None, f"Should not parse as status change: '{msg}'"


def test_query_recognition():
    assert asks_review("bài nào cần ôn lại")
    assert asks_review("tôi cần ôn lại bài nào trong topic AI")
    assert asks_review("ôn tập bài nào bây giờ")

    assert asks_next_learning("nên học gì tiếp")
    assert asks_next_learning("tiếp theo nên học gì")
    assert asks_next_learning("gợi ý học tiếp")

    assert asks_what_i_know("tôi đang biết gì về AI Architecture")
    assert asks_what_i_know("tôi đã nắm những gì về RAG")
    assert asks_what_i_know("tiến độ học về topic AI")


def test_query_recognition_new_phrasings():
    assert asks_what_i_know("Tôi đã nắm được những bài học nào rồi")
    assert asks_what_i_know("Bài Docker đã nắm chưa")
    assert asks_next_learning("Sau bài Docker Compose thì nên học bài nào")
    assert asks_next_learning("Gợi ý bài tiếp theo trong topic Docker")
    assert asks_review("Những bài đã nắm lâu rồi chưa xem lại")


def test_query_recognition_look_alikes_are_not_status_queries():
    for text in [
        "Tiến độ giải ngân vốn đầu tư công hiện nay thế nào",  # "tiến độ" alone is not about lessons
        "Học gì tiếp theo sau khi tốt nghiệp cấp 3",  # life advice
        "bài tiếp theo của series này nói về gì",  # asks what a lesson says
    ]:
        assert not (asks_review(text) or asks_next_learning(text) or asks_what_i_know(text)), text
