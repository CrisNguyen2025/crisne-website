"""Item levels (the group an item is filed under).

Same aliases and titles as lib/roadmap/levels.ts in the Next.js app; keep the two in sync.
"""

from __future__ import annotations

import re
import unicodedata

LEVEL_ALIASES = {
    "core": "core",
    "basic": "core",
    "cơ bản": "core",
    "intermediate": "intermediate",
    "trung bình": "intermediate",
    "trung cấp": "intermediate",
    "advanced": "advanced",
    "nâng cao": "advanced",
}

DEFAULT_TITLES = {
    "core": "🟢 Core",
    "intermediate": "🟡 Intermediate",
    "advanced": "🔴 Advanced",
}


def normalize_level(raw: object) -> str:
    """Canonical level: known aliases map to core | intermediate | advanced; custom levels are kept, lowercased."""
    level = re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(raw or "")).strip().lower())
    if not level:
        return "core"
    return LEVEL_ALIASES.get(level, level)


def default_group_title(level: str) -> str:
    """Title of a group created for a level; custom levels are title-cased."""
    canonical = normalize_level(level)
    return DEFAULT_TITLES.get(canonical) or " ".join(w[:1].upper() + w[1:] for w in canonical.split(" "))
