"""Structured source channel: the sources line is parsed and removed, source labels and bare ids are dropped."""

from __future__ import annotations

from rag_service.core.generation.sources_channel import SourceChannel


def _run(chunks: list[str], known=("d1", "d2", "d3")) -> tuple[str, SourceChannel]:
    ch = SourceChannel(known)
    out = "".join(ch.feed(c) for c in chunks) + ch.flush()
    return out, ch


def test_sources_line_is_removed_and_ids_parsed():
    out, ch = _run(["Trả lời ngắn.\n", "<sources>d2, d1</sources>\n"])
    assert out == "Trả lời ngắn.\n"
    assert ch.ids == ["d2", "d1"] and ch.found


def test_tag_split_across_chunks_is_still_parsed():
    out, ch = _run(["Ok.\n<sour", "ces>d", "3</sour", "ces>"])
    assert out == "Ok.\n" and ch.ids == ["d3"]


def test_unknown_ids_are_ignored():
    _, ch = _run(["<sources>zzz, d1</sources>"])
    assert ch.ids == ["d1"]


def test_empty_sources_tag_means_no_sources():
    out, ch = _run(["Không có bài nào.\n<sources></sources>\n"])
    assert out == "Không có bài nào.\n" and ch.ids == [] and ch.found


def test_missing_tag_is_reported_as_not_found():
    out, ch = _run(["Xin chào.\n"])
    assert out == "Xin chào.\n" and not ch.found


def test_sources_label_and_bare_id_lines_are_dropped():
    text = "Hybrid Search là BM25 + vector.\n\n**Nguồn**\nd1\n**Sources:** d2\n`d3`\nKết thúc.\n"
    out, _ = _run([text])
    assert out == "Hybrid Search là BM25 + vector.\n\nKết thúc.\n"


def test_normal_sentences_containing_the_word_pass_through():
    out, _ = _run(["Nguồn nước sạch quan trọng.\n"])
    assert out == "Nguồn nước sạch quan trọng.\n"
