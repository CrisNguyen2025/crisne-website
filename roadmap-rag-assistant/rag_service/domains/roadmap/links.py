"""Roadmap link rules: which `[text](href)` the assistant may emit.

Canonical paths (ADR-0014): a topic is `/<topic>`, a lesson `/<topic>/<lesson>`, optionally with
`#heading`. Both slugs must be known. Old paths still 308 to the canonical ones, so they are still
checked the same way: `/lessons/<lesson>`, `/topic/<topic>[/<lesson>]`, `/?topic=<topic>&item=<id>`.
Any other link (external, anchors, app pages under RESERVED_TOPIC_SLUGS, files like `/og-image.png`)
is left alone.
"""

from __future__ import annotations

import re
from typing import Callable, Iterable
from urllib.parse import unquote

from rag_service.core.generation.links import is_external_or_scheme_href

# First path segments the app already uses; same list as RESERVED_TOPIC_SLUGS in lib/roadmap/paths.ts
RESERVED_TOPIC_SLUGS = frozenset({"api", "lessons", "topic", "notes", "portfolio", "login", "_next"})

ROADMAP_URL = re.compile(r"^/([^/?#.]+)(?:/([^/?#]+))?(?=$|[/?#])")
LESSON_URL = re.compile(r"^/lessons/([^/?#]+)")
TOPIC_URL = re.compile(r"^/topic/([^/?#]+)(?:/([^/?#]+))?")
LEGACY_TOPIC_URL = re.compile(r"^/\?topic=([^&#]+)")
LEGACY_ITEM_PARAM = re.compile(r"[?&]item=([^&#]+)")


def roadmap_link_allowed(
    valid_slugs: Iterable[str],
    valid_items: Iterable[str] | None = None,
    *,
    allowed_external_hrefs: Iterable[str] | None = None,
) -> Callable[[str], bool]:
    """allow(href) for LinkGuard: known topic/item slugs, and optional strict external URL allowlist."""
    slugs = set(valid_slugs)
    items = set(valid_items) if valid_items is not None else None
    external_allow = (
        frozenset(u.strip() for u in allowed_external_hrefs if u and u.strip())
        if allowed_external_hrefs is not None
        else None
    )

    def topic_and_item_known(topic: str, item: str | None) -> bool:
        if unquote(topic) not in slugs:
            return False
        return items is None or item is None or unquote(item) in items

    def allow(href: str) -> bool:
        clean = (href or "").strip()
        if external_allow is not None and is_external_or_scheme_href(clean):
            return clean in external_allow

        lesson_match = LESSON_URL.match(clean)
        if lesson_match is not None:
            return items is None or unquote(lesson_match.group(1)) in items

        topic_match = TOPIC_URL.match(clean)
        if topic_match is not None:
            return topic_and_item_known(topic_match.group(1), topic_match.group(2))

        legacy = LEGACY_TOPIC_URL.match(clean)
        if legacy is not None:
            item = LEGACY_ITEM_PARAM.search(clean)
            return topic_and_item_known(legacy.group(1), item.group(1) if item else None)

        canonical = ROADMAP_URL.match(clean)
        if canonical is not None and unquote(canonical.group(1)).lower() not in RESERVED_TOPIC_SLUGS:
            return topic_and_item_known(canonical.group(1), canonical.group(2))

        return True

    return allow
