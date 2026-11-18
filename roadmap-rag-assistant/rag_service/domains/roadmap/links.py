"""Roadmap link rules: which `[text](href)` the assistant may emit.

Lesson links must name a known lesson (`/lessons/<slug>`), and topic links must name
a known topic (`/topic/<slug>` or legacy `/topic/<slug>/<item-slug>` / `/?topic=<slug>&item=<id>`).
Any other link (external, anchors) is left alone.
"""

from __future__ import annotations

import re
from typing import Callable, Iterable
from urllib.parse import unquote

LESSON_URL = re.compile(r"^/lessons/([^/?#]+)")
TOPIC_URL = re.compile(r"^/topic/([^/?#]+)(?:/([^/?#]+))?")
LEGACY_TOPIC_URL = re.compile(r"^/\?topic=([^&#]+)")
LEGACY_ITEM_PARAM = re.compile(r"[?&]item=([^&#]+)")


def roadmap_link_allowed(valid_slugs: Iterable[str], valid_items: Iterable[str] | None = None) -> Callable[[str], bool]:
    """allow(href) for LinkGuard: known topic slug, and known item slug/id when `valid_items` is given."""
    slugs = set(valid_slugs)
    items = set(valid_items) if valid_items is not None else None

    def allow(href: str) -> bool:
        lesson_match = LESSON_URL.match(href)
        if lesson_match is not None:
            return items is None or unquote(lesson_match.group(1)) in items

        topic_match = TOPIC_URL.match(href)
        if topic_match is not None:
            if unquote(topic_match.group(1)) not in slugs:
                return False
            item_slug = topic_match.group(2)
            return items is None or item_slug is None or unquote(item_slug) in items

        legacy = LEGACY_TOPIC_URL.match(href)
        if legacy is not None:
            if unquote(legacy.group(1)) not in slugs:
                return False
            item = LEGACY_ITEM_PARAM.search(href)
            return items is None or item is None or unquote(item.group(1)) in items

        return True

    return allow
