"""Streaming markdown-link filter: an unwanted link is turned into plain text while the answer streams.

The domain decides what is allowed: `allow(href)` returns False for links the model must not emit.
Nothing here knows about any particular site or URL scheme.
"""

from __future__ import annotations

import re
from typing import Callable

LINK = re.compile(r"\[([^\]\n]*)\]\(([^)\s]*)\)")
# A "[" that may still become a link once more tokens arrive
PARTIAL_LINK = re.compile(r"\[[^\]\n]*(?:\](?:\([^)\s]*)?)?")
# Held back at most this long; anything longer is not a link the model is writing
MAX_PENDING = 300


class LinkGuard:
    """Feed streamed deltas in, get the same text out with disallowed links unlinked.

    `removed` lists the hrefs that were unlinked, so callers can report them.
    """

    def __init__(self, allow: Callable[[str], bool]) -> None:
        self._allow = allow
        self._buf = ""
        self.removed: list[str] = []

    def _check(self, m: re.Match) -> str:
        href = m.group(2)
        if self._allow(href):
            return m.group(0)
        self.removed.append(href)
        return m.group(1)

    def feed(self, delta: str) -> str:
        self._buf += delta
        out: list[str] = []
        while self._buf:
            i = self._buf.find("[")
            if i == -1:
                out.append(self._buf)
                self._buf = ""
                break
            out.append(self._buf[:i])
            self._buf = self._buf[i:]
            m = LINK.match(self._buf)
            if m:
                out.append(self._check(m))
                self._buf = self._buf[m.end():]
                continue
            partial = PARTIAL_LINK.match(self._buf)
            if partial and partial.end() == len(self._buf) and len(self._buf) < MAX_PENDING:
                break  # wait for the rest of the link
            out.append(self._buf[0])
            self._buf = self._buf[1:]
        return "".join(out)

    def flush(self) -> str:
        rest, self._buf = self._buf, ""
        return rest
