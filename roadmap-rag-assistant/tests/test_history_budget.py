"""format_history keeps the newest turns within history_total_chars."""

from __future__ import annotations

from dataclasses import replace

from rag_service.core.augmentation.context import format_history
from rag_service.core.augmentation.history import Turn
from rag_service.domains.roadmap.profile import PROFILE


def test_drops_oldest_turns_over_budget():
    profile = replace(PROFILE, history_max_chars=100, history_total_chars=250)
    turns = [Turn("user", f"{i}" * 100) for i in range(5)]
    out = format_history(turns, profile)
    assert "0" * 100 not in out and "1" * 100 not in out and "2" * 100 not in out
    assert out.index("3" * 100) < out.index("4" * 100)


def test_keeps_all_turns_within_budget():
    turns = [Turn("user", "hỏi"), Turn("assistant", "đáp")]
    out = format_history(turns, PROFILE)
    assert out.index("hỏi") < out.index("đáp")


def test_newest_turn_kept_even_if_over_budget():
    profile = replace(PROFILE, history_max_chars=100, history_total_chars=10)
    out = format_history([Turn("user", "old"), Turn("user", "x" * 100)], profile)
    assert "x" * 100 in out and "old" not in out


def test_empty_history():
    assert format_history([], PROFILE) == ""
