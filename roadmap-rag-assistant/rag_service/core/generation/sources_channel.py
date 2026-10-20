"""Section 4b — Structured source channel.

The model ends an answer with one line `<sources>id1, id2</sources>` naming the retrieved documents it used.
While the answer streams, this filter:
- takes that line out of the text and returns its ids (only ids that were actually retrieved count);
- drops lines that are only a sources label ("Nguồn", "Sources", "**Nguồn:**") or a bare document id,
  which the model sometimes writes on its own even when told not to.

Nothing here knows the business: the caller passes the retrieved ids.
"""

from __future__ import annotations

import re
from typing import Iterable, List

TAG_OPEN = "<sources"
TAG_CLOSE = "</sources>"
LABEL_LINE = re.compile(r"^\W*(?:nguồn|sources?)\b\W*$|^\W*(?:nguồn|sources?)\s*:", re.IGNORECASE)
ID_TOKEN = re.compile(r"[\w][\w\-./:]*")


class SourceChannel:
    def __init__(self, known_ids: Iterable[str]) -> None:
        self._known = {str(i) for i in known_ids}
        self._buf = ""
        self._tag = ""
        self._capturing = False
        self.ids: List[str] = []
        self.found = False  # the model wrote a <sources> tag at all

    def feed(self, delta: str) -> str:
        self._buf += delta
        out = []
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            out.append(self._line(line + "\n"))
        return "".join(out)

    def flush(self) -> str:
        rest, self._buf = self._buf, ""
        return self._line(rest) if rest else ""

    def _line(self, line: str) -> str:
        if self._capturing or TAG_OPEN in line:
            self._tag += line
            if TAG_CLOSE in self._tag:
                self._finish_tag()
            elif not self._capturing:
                self._capturing = True
            return ""
        return "" if self._is_noise(line) else line

    def _finish_tag(self) -> None:
        self._capturing = False
        self.found = True
        inner = self._tag[self._tag.find(TAG_OPEN) + len(TAG_OPEN): self._tag.find(TAG_CLOSE)]
        inner = inner[inner.find(">") + 1:] if ">" in inner else inner
        for token in ID_TOKEN.findall(inner):
            if token in self._known and token not in self.ids:
                self.ids.append(token)
        self._tag = ""

    def _is_noise(self, line: str) -> bool:
        text = line.strip().strip("*_#`-• ").strip()
        if not text:
            return False
        if LABEL_LINE.search(line.strip()):
            return True
        return text in self._known
