"""Output guardrails: topic-link filtering on the token stream, grounding flags, PII masking."""

import pytest

from rag_service.core.generation.grounding import check_grounding
from rag_service.core.generation.links import LinkGuard
from rag_service.domains.roadmap.links import roadmap_link_allowed
from rag_service.pii import mask_pii, mask_trace_data


def _stream(guard: LinkGuard, deltas: list[str]) -> str:
    return "".join(guard.feed(d) for d in deltas) + guard.flush()


def _roadmap(slugs, items=None) -> LinkGuard:
    return LinkGuard(roadmap_link_allowed(slugs, items))


def test_valid_topic_link_is_kept_across_chunks():
    guard = _roadmap({"fe"})
    out = _stream(guard, ["Xem [Gene", "ral](/?to", "pic=fe) nhé"])
    assert out == "Xem [General](/?topic=fe) nhé"
    assert guard.removed == []


def test_unknown_topic_link_becomes_plain_text():
    guard = _roadmap({"fe"})
    out = _stream(guard, ["Đọc [Frontend](/?topic=frontend)", " và [Docs](https://x.dev)."])
    assert out == "Đọc Frontend và [Docs](https://x.dev)."
    assert guard.removed == ["/?topic=frontend"]


def test_brackets_that_are_not_links_pass_through():
    guard = _roadmap(set())
    assert _stream(guard, ["mảng [0", "] và [ghi chú]", " xong"]) == "mảng [0] và [ghi chú] xong"
    assert _stream(_roadmap(set()), ["dở dang [abc"]) == "dở dang [abc"


def test_grounding_flags_invented_names_and_promises():
    context = "#### 📑 Mảng kiến thức: [01-GEN] General\n- **Thuộc Lộ trình:** fe (`fe`)"
    answer = (
        "Chưa có bài về **Docker**. Xem lộ trình **Frontend**. **Lưu ý:** "
        "Nếu có bài mới, chúng tôi sẽ cập nhật ngay."
    )
    res = check_grounding(answer, context, "Website có bài nào về Docker không?")
    assert res["ungrounded_terms"] == ["Frontend"]
    assert res["future_promise"]


def test_reformatted_names_from_the_context_are_grounded():
    context = "#### 📑 Mảng kiến thức: [01-GEN] General\n- **Thuộc Lộ trình:** fe (`fe`)"
    res = check_grounding("Xem **Mảng kiến thức 01\u2011GEN General**.", context, "fe có gì")
    assert res["ungrounded_terms"] == []


def test_grounded_answer_has_no_flags():
    res = check_grounding("Có bài **General** trong lộ trình **fe**.", "General ... fe", "fe có gì")
    assert res == {"ungrounded_terms": [], "future_promise": [], "unbacked_action": []}


def test_mask_pii_matches_next_app_patterns():
    text = "mail a.b@x.vn, gọi 0912 345 678 hoặc +1 415 555 0100, score 0.8067"
    assert mask_pii(text) == "mail [email], gọi [phone] hoặc [phone], score 0.8067"
    assert mask_trace_data(data={"message": "a@b.co", "n": [1, "0912345678"]}) == {
        "message": "[email]",
        "n": [1, "[phone]"],
    }


@pytest.mark.parametrize(
    "text,expected",
    [
        ("CCCD 012345678901 nhé", "CCCD [cccd] nhé"),
        ("thẻ 4111 1111 1111 1111", "thẻ [card]"),
        ("thẻ 4111-1111-1111-1111 hết hạn", "thẻ [card] hết hạn"),
        ("key sk-abc123def456ghi789jkl", "key [secret]"),
        ("sk-proj-AbCdEf0123456789xyz và gsk_0123456789abcdefghij", "[secret] và [secret]"),
        ("pk-lf-0123456789abcdef01", "[secret]"),
        ("AIzaSyA1234567890abcdefghijklmnopqrstuv", "[secret]"),
        ("AKIAABCDEFGHIJKLMNOP", "[secret]"),
        ("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijk", "[secret]"),
    ],
)
def test_mask_pii_secrets_cards_and_ids(text, expected):
    assert mask_pii(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "4111 1111 1111 1112",  # fails Luhn: not a card
        "score 0.806753858365573",
        "2026-10-14T01:44:41.623Z",
        "01a1493b-a588-7ec1-b3d2-959390846119",
        "a159474aacdc6e27ed985fc04ca02a1b",
        "1234567890123 lượt xem",  # 13 digits, fails Luhn
        "task-abcdefghijklmnopqrstuv",  # not a known key prefix
    ],
)
def test_mask_pii_keeps_lookalikes(text):
    assert mask_pii(text) == text


@pytest.mark.parametrize(
    "answer",
    [
        "✅ Đã tạo bài post mới trong layer General.",
        "Bài đã được lưu và hiển thị trong roadmap của bạn.",
        "Mình vừa thêm xong bài học.",
    ],
)
def test_invented_action_is_flagged(answer):
    assert check_grounding(answer, "ctx", "q")["unbacked_action"]


def test_normal_answers_are_not_flagged_as_actions():
    assert not check_grounding("Bài này nói về chunking, lưu ý nội dung cần đọc kỹ.", "ctx", "q")["unbacked_action"]



def test_link_guard_checks_item_ids_when_given():
    guard = _roadmap({"ai"}, {"vdb"})
    out = guard.feed("[A](/?topic=ai&item=vdb) [B](/?topic=ai&item=fake) [C](/?topic=ai)") + guard.flush()
    assert out == "[A](/?topic=ai&item=vdb) B [C](/?topic=ai)"
    assert guard.removed == ["/?topic=ai&item=fake"]


def test_link_guard_without_item_set_keeps_item_links_of_known_topics():
    guard = _roadmap({"ai"})
    assert guard.feed("[A](/?topic=ai&item=anything)") + guard.flush() == "[A](/?topic=ai&item=anything)"
