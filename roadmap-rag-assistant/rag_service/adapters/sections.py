"""Section (mục) names inside a topic, the Python twin of lib/roadmap/sections.ts (ADR-0009).

Two names are the same section when they differ only by case or spacing; the spelling already in the
topic is the one kept.
"""

from __future__ import annotations

import re

from rag_service.adapters.errors import normalize_title


def clean_section(name: str | None) -> str | None:
    """Trim and collapse spaces; a blank name means no section."""
    cleaned = re.sub(r"\s+", " ", (name or "").strip())
    return cleaned or None


def resolve_section(existing: list[str | None], given: str | None) -> str | None:
    """The section a lesson goes to: an existing one by its spelling, or the cleaned new name, or None."""
    cleaned = clean_section(given)
    if cleaned is None:
        return None
    wanted = normalize_title(cleaned)
    for name in existing:
        if name and normalize_title(name) == wanted:
            return name
    return cleaned


def sections_in_order(items: list[dict]) -> list[str | None]:
    """Section names in page order, first appearance wins; None once if any lesson has none."""
    seen: dict[str, str | None] = {}
    for item in items:
        name = item.get("section")
        key = normalize_title(name) if name else ""
        seen.setdefault(key, name)
    return list(seen.values())
