"""Section 3 — Citation & Source Attribution.

Streaming filter over the model output. Given an `allow(href)` rule from the domain, it turns
disallowed links into plain text (LinkGuard); without a rule it passes text through.
"""

from __future__ import annotations

from typing import Callable, List, Optional, Protocol

from rag_service.core.generation.links import LinkGuard


class CitationFilter(Protocol):
    removed: List[str]

    def feed(self, text: str) -> str: ...

    def flush(self) -> str: ...


class PassThrough:
    def __init__(self) -> None:
        self.removed: List[str] = []

    def feed(self, text: str) -> str:
        return text

    def flush(self) -> str:
        return ""


class _LinkCitation:
    def __init__(self, allow: Callable[[str], bool]) -> None:
        self._guard = LinkGuard(allow)

    @property
    def removed(self) -> List[str]:
        return self._guard.removed

    def feed(self, text: str) -> str:
        return self._guard.feed(text)

    def flush(self) -> str:
        return self._guard.flush()


def citation_filter(allow: Optional[Callable[[str], bool]]) -> CitationFilter:
    """`allow` is the domain's link rule; None disables link filtering."""
    return _LinkCitation(allow) if allow is not None else PassThrough()
