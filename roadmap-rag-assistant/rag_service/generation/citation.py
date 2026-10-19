"""Section 3 — Citation & Source Attribution.

Streaming filter over the model output. With a whitelist of known sources it turns links to
unknown ones into plain text (LinkGuard); without one it passes text through.
"""

from __future__ import annotations

from typing import List, Optional, Protocol

from rag_service.output_guard import LinkGuard


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
    def __init__(self, known: set[str]) -> None:
        self._guard = LinkGuard(known)

    @property
    def removed(self) -> List[str]:
        return self._guard.removed_slugs

    def feed(self, text: str) -> str:
        return self._guard.feed(text)

    def flush(self) -> str:
        return self._guard.flush()


def citation_filter(known: Optional[set[str]]) -> CitationFilter:
    return _LinkCitation(known) if known is not None else PassThrough()
