"""Output guardrails: topic-link filtering on the token stream, grounding flags, PII masking."""

from rag_service.output_guard import LinkGuard, check_grounding
from rag_service.pii import mask_pii, mask_trace_data


def _stream(guard: LinkGuard, deltas: list[str]) -> str:
    return "".join(guard.feed(d) for d in deltas) + guard.flush()


def test_valid_topic_link_is_kept_across_chunks():
    guard = LinkGuard({"fe"})
    out = _stream(guard, ["Xem [Gene", "ral](/?to", "pic=fe) nhé"])
    assert out == "Xem [General](/?topic=fe) nhé"
    assert guard.removed_slugs == []


def test_unknown_topic_link_becomes_plain_text():
    guard = LinkGuard({"fe"})
    out = _stream(guard, ["Đọc [Frontend](/?topic=frontend)", " và [Docs](https://x.dev)."])
    assert out == "Đọc Frontend và [Docs](https://x.dev)."
    assert guard.removed_slugs == ["frontend"]


def test_brackets_that_are_not_links_pass_through():
    guard = LinkGuard(set())
    assert _stream(guard, ["mảng [0", "] và [ghi chú]", " xong"]) == "mảng [0] và [ghi chú] xong"
    assert _stream(LinkGuard(set()), ["dở dang [abc"]) == "dở dang [abc"


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
    assert res == {"ungrounded_terms": [], "future_promise": []}


def test_mask_pii_matches_next_app_patterns():
    text = "mail a.b@x.vn, gọi 0912 345 678 hoặc +1 415 555 0100, score 0.8067"
    assert mask_pii(text) == "mail [email], gọi [phone] hoặc [phone], score 0.8067"
    assert mask_trace_data(data={"message": "a@b.co", "n": [1, "0912345678"]}) == {
        "message": "[email]",
        "n": [1, "[phone]"],
    }
