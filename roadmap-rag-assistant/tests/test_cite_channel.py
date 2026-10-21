"""Inline citations: `[[id]]` markers become clean text plus citation ranges on the text the client receives."""

from __future__ import annotations

from rag_service.core.generation.cite_channel import MARK, CiteChannel, CitationTracker, strip_marks
from rag_service.core.generation.guardrails import PiiStreamFilter


def _cite(chunks: list[str], known=("d1", "d2", "d3")) -> tuple[str, CiteChannel]:
    ch = CiteChannel(known)
    out = "".join(ch.feed(c) for c in chunks) + ch.flush()
    return out, ch


def _run(chunks: list[str], known=("d1", "d2", "d3"), pii: bool = False) -> tuple[str, list[dict], CiteChannel]:
    """Channel → (PII) → tracker, as the pipeline wires them."""
    ch = CiteChannel(known)
    tracker = CitationTracker(ch)
    f = PiiStreamFilter() if pii else None
    out = []
    for c in chunks:
        text = ch.feed(c)
        out.append(tracker.feed(f.feed(text) if f else text))
    tail = ch.flush()
    out.append(tracker.feed(f.feed(tail) + f.flush() if f else tail))
    out.append(tracker.flush())
    return "".join(out), tracker.citations, ch


def _slice16(text: str, start: int, end: int) -> str:
    """JavaScript `text.slice(start, end)`: indexes are UTF-16 code units."""
    raw = text.encode("utf-16-le")
    return raw[start * 2: end * 2].decode("utf-16-le")


def _every_split(text: str) -> list[list[str]]:
    return [[text[:i], text[i:]] for i in range(1, len(text))]


# ── CiteChannel ────────────────────────────────────────────────────────────


def test_valid_marker_becomes_a_mark_and_ids_are_kept():
    out, ch = _cite(["Hybrid search dùng BM25. [[d1]] Rerank dùng cross-encoder. [[d2, d3]]"])
    assert "[[" not in out and out.count(MARK) == 2
    assert ch.groups == [["d1"], ["d2", "d3"]] and ch.ids == ["d1", "d2", "d3"]


def test_unknown_ids_are_dropped_and_reported():
    out, ch = _cite(["Câu một. [[zzz, d1]] Câu hai. [[nope]]"])
    assert ch.groups == [["d1"]] and ch.invalid == ["zzz", "nope"]
    assert strip_marks(out) == "Câu một. Câu hai."


def test_marker_split_at_every_position_is_still_parsed():
    text = "Docker đóng gói ứng dụng. [[d1]]\n"
    for chunks in _every_split(text):
        out, ch = _cite(chunks)
        assert strip_marks(out) == "Docker đóng gói ứng dụng.\n", chunks
        assert ch.groups == [["d1"]], chunks


def test_unclosed_or_too_long_brackets_pass_through():
    out, ch = _cite(["Mảng [[1, 2], [3]] trong Python. [[d1"])
    assert out == "Mảng [[1, 2], [3]] trong Python. [[d1" and ch.groups == []
    long = "[[" + "x" * 300 + "]]"
    out, ch = _cite([long])
    assert out == long and ch.groups == []


def test_marker_inside_code_fence_is_left_alone():
    text = "Ví dụ:\n```python\nx = [[d1]]\n```\nXong. [[d1]]"
    out, ch = _cite([text])
    assert "x = [[d1]]" in out and ch.groups == [["d1"]]


def test_marker_before_the_full_stop_closes_the_claim_after_it():
    text = "RAG dùng dữ liệu thật [[d1]]. Nó nằm ở tầng 03 [[d2]].\n"
    for chunks in [[text]] + _every_split(text):
        out, cites, _ = _run(chunks)
        assert out == "RAG dùng dữ liệu thật. Nó nằm ở tầng 03.\n", chunks
        assert [c["text"] for c in cites] == ["RAG dùng dữ liệu thật.", "Nó nằm ở tầng 03."], chunks


def test_marker_at_the_very_end_is_kept_on_flush():
    out, cites, _ = _run(["Câu cuối [[d1]]"])
    assert out == "Câu cuối" and [c["text"] for c in cites] == ["Câu cuối"]


def test_same_id_twice_is_listed_once():
    _, ch = _cite(["A. [[d1]] B. [[d1]]"])
    assert ch.ids == ["d1"] and ch.groups == [["d1"], ["d1"]]


# ── CitationTracker ────────────────────────────────────────────────────────


def test_clean_text_and_ranges_slice_back_to_the_claim():
    text = "- **Hiện tại**: Quy mô đạt 514 tỷ USD. [[d1]]\n- Mục tiêu 2026 là 10%. [[d2]]\n"
    out, cites, _ = _run([text])
    assert out == "- **Hiện tại**: Quy mô đạt 514 tỷ USD.\n- Mục tiêu 2026 là 10%.\n"
    assert [c["text"] for c in cites] == ["**Hiện tại**: Quy mô đạt 514 tỷ USD.", "Mục tiêu 2026 là 10%."]
    for c in cites:
        assert _slice16(out, c["start"], c["end"]) == c["text"]
    assert [c["source_ids"] for c in cites] == [["d1"], ["d2"]]


def test_ranges_count_utf16_units_past_emoji():
    text = "## 📊 Các mốc GDP\n💡 GDP tăng 8%. [[d1]] Thu nhập tăng. [[d2]]\n"
    out, cites, _ = _run([text])
    assert [_slice16(out, c["start"], c["end"]) for c in cites] == ["💡 GDP tăng 8%.", "Thu nhập tăng."]
    # Python indexes would be off by one per emoji before the claim
    assert cites[1]["start"] != out.index("Thu nhập")


def test_two_claims_on_one_line_split_at_the_previous_mark():
    out, cites, _ = _run(["Câu A đúng. [[d1]] Câu B cũng đúng. [[d1, d2]]"])
    assert [c["text"] for c in cites] == ["Câu A đúng.", "Câu B cũng đúng."]
    assert cites[1]["source_ids"] == ["d1", "d2"]


def test_heading_quote_and_numbered_prefixes_are_skipped():
    text = "### Tiêu đề có nguồn [[d1]]\n> Trích dẫn. [[d2]]\n12. Mục số. [[d3]]\n"
    _, cites, _ = _run([text])
    assert [c["text"] for c in cites] == ["Tiêu đề có nguồn", "Trích dẫn.", "Mục số."]


def test_table_rows_and_bare_markers_get_no_range():
    text = "| Cột | Giá trị. [[d1]] |\n[[d2]]\nCâu thường. [[d3]]\n"
    out, cites, ch = _run([text])
    assert "[[" not in out and MARK not in out
    assert [c["text"] for c in cites] == ["Câu thường."] and ch.ids == ["d1", "d2", "d3"]


def test_ranges_hold_for_every_chunk_split():
    text = "Mở đầu.\n- Ý 1 có 📊 emoji. [[d1]]\n- Ý 2. [[d2]] Ý 3. [[d3]]\nKết."
    expected_out, expected, _ = _run([text])
    for chunks in _every_split(text):
        out, cites, _ = _run(chunks)
        assert out == expected_out and cites == expected, chunks


def test_ranges_are_measured_after_pii_masking():
    text = "Liên hệ cris@example.com để hỏi thêm về khoá học này nhé. [[d1]]\nCâu sau. [[d2]]\n"
    chunks = [text[i: i + 7] for i in range(0, len(text), 7)]
    out, cites, _ = _run(chunks, pii=True)
    assert "cris@example.com" not in out and "[email]" in out
    for c in cites:
        assert _slice16(out, c["start"], c["end"]) == c["text"]
    assert cites[0]["text"].startswith("Liên hệ [email]")
