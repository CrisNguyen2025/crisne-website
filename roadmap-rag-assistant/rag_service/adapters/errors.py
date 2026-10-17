"""Errors shared by the data adapters."""

from __future__ import annotations

import re
import unicodedata


def normalize_title(title: str) -> str:
    """Same rule as lib/roadmap/duplicates.ts: case and spacing don't count, diacritics do."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", title or "").strip()).lower()


def find_duplicate(siblings: list[dict], title: str) -> dict | None:
    wanted = normalize_title(title)
    return next((s for s in siblings if normalize_title(s.get("title", "")) == wanted), None)


class DuplicateEntityError(Exception):
    """The entry already exists under the same parent; `existing` is that entry."""

    def __init__(self, kind: str, title: str, existing: dict | None = None) -> None:
        self.kind = kind
        self.title = title
        self.existing = existing or {}
        super().__init__(f"{kind} '{title}' already exists")


def with_skipped(summary: str, skipped: list[str]) -> str:
    """Append the titles a batch left alone because they already exist."""
    if not skipped:
        return summary
    note = f"ℹ️ Đã có sẵn, không tạo thêm: {', '.join(skipped)}"
    return note if summary.startswith("✅ Đã tạo 0 ") else f"{summary}\n{note}"
