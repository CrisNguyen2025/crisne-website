"""Roadmap link rules: which `[text](href)` the assistant may emit.

Topic links must name a known topic (`/?topic=<slug>`); an `&item=<id>` must be a known lesson.
Any other link (external, anchors) is left alone.
"""

from __future__ import annotations

import re
from typing import Callable, Iterable
from urllib.parse import unquote

TOPIC_URL = re.compile(r"^/\?topic=([^&#]+)")
ITEM_PARAM = re.compile(r"[?&]item=([^&#]+)")


def roadmap_link_allowed(valid_slugs: Iterable[str], valid_items: Iterable[str] | None = None) -> Callable[[str], bool]:
    """allow(href) for LinkGuard: known topic slug, and known item id when `valid_items` is given."""
    slugs = set(valid_slugs)
    items = set(valid_items) if valid_items is not None else None

    def allow(href: str) -> bool:
        topic = TOPIC_URL.match(href)
        if topic is None:
            return True
        if unquote(topic.group(1)) not in slugs:
            return False
        item = ITEM_PARAM.search(href)
        return items is None or item is None or unquote(item.group(1)) in items

    return allow
