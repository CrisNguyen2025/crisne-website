"""The group a lesson goes to (ADR-0008).

Same rule as lib/roadmap/groups.ts in the Next.js app; both read tests/data/group_cases.json.
"""

from __future__ import annotations

import re
import unicodedata

from rag_service.adapters.errors import find_duplicate


class GroupChoiceRequired(Exception):
    """A lesson names no group and its layer does not settle it; `titles` are the layer's groups."""

    def __init__(self, titles: list[str]) -> None:
        self.titles = titles
        super().__init__(
            f"Choose a group: {', '.join(titles)}, or name a new one." if titles else "This layer has no group yet. Name one."
        )


def clean_group_title(raw: object) -> str:
    """The title as stored: NFC, trimmed, inner spaces collapsed. Empty stays empty."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(raw or "")).strip())


def pick_group(groups: list[dict], group_id: str | None = None, group_title: str | None = None) -> tuple[str, object]:
    """("existing", group) | ("create", title) | ("ask", titles).

    The named group, a new one when the title is not taken yet, the layer's only group when none is named;
    otherwise the caller must ask.
    """
    titles = [g.get("title", "") for g in groups]
    if group_id:
        found = next((g for g in groups if g.get("id") == group_id), None)
        return ("existing", found) if found else ("ask", titles)
    title = clean_group_title(group_title)
    if title:
        found = find_duplicate(groups, title)
        return ("existing", found) if found else ("create", title)
    if len(groups) == 1:
        return ("existing", groups[0])
    return ("ask", titles)
