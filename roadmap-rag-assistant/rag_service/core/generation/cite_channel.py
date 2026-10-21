"""Section 3c — Inline citations.

The model writes `[[id]]` or `[[id1, id2]]` right after a sentence that uses those retrieved documents.
Two streaming filters turn that into clean text plus citation ranges:

- CiteChannel (right after the sources channel) checks the ids against the retrieved ones and replaces a
  marker with an internal mark: two private-use characters, no digits, so the link and PII filters
  downstream pass it through untouched. A marker without any retrieved id is removed.
- CitationTracker (last, right before tokens go out) takes the marks out and records, for each one, the
  claim it closes as a range on the text the client receives.

Ranges count UTF-16 code units, the unit of JavaScript string indexes, so the client slices its message
with them directly. A claim runs from the previous mark on the same line, or else from the start of the
line after its markdown prefix, to the mark; it never crosses a line.

Nothing here knows the business: the caller passes the retrieved ids.
"""

from __future__ import annotations

import re
from typing import Iterable, List

from rag_service.core.generation.sources_channel import ID_TOKEN

MARK = ""
GROUP_BASE = 0xE100
OPEN = "[["
CLOSE = "]]"
# A "[[" with no "]]" this far on is not a marker
MAX_MARKER = 200
FENCE = "```"
CLOSING_PUNCT = ".,;:!?"
MARK_RE = re.compile(MARK + r"(.)", re.DOTALL)
# Inside the brackets: ids separated by commas, nothing else
MARKER_BODY = re.compile(r"\s*[\w][\w\-./:]*(?:\s*,\s*[\w][\w\-./:]*)*\s*")
MARKER_CHARS = re.compile(r"[\w\-./:,\s]*")
# Markdown that opens a line (indent, bullet, number, heading, quote, checkbox): a claim starts after it
LINE_PREFIX = re.compile(r"^\s*(?:(?:[-*•]|\d+\.)\s+|#{1,6}\s+|>\s*)?(?:\[[ xX]\]\s+)?")


def strip_marks(text: str) -> str:
    """The text without internal marks, for checks and logs that must not see them."""
    return MARK_RE.sub("", text).replace(MARK, "")


def _utf16_len(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


class CiteChannel:
    def __init__(self, known_ids: Iterable[str]) -> None:
        self._known = {str(i) for i in known_ids}
        self._buf = ""
        self._fences = 0  # code fences seen in the text already passed on
        self._tail = ""  # last characters passed on, to count a fence split across chunks
        self.groups: List[List[str]] = []  # ids of each mark, by mark number
        self.ids: List[str] = []  # every cited id, in order of first use
        self.invalid: List[str] = []  # ids the model wrote that were not retrieved

    def feed(self, delta: str) -> str:
        self._buf += delta
        return self._pass(self._scan(final=False))

    def flush(self) -> str:
        return self._pass(self._scan(final=True))

    def _scan(self, final: bool) -> str:
        out: List[str] = []
        while self._buf:
            i = self._buf.find(OPEN)
            if i == -1:
                # A trailing "[" may still become a marker, and the spaces before it may have to go with it
                cut = len(self._buf) - (1 if self._buf.endswith("[") else 0)
                cut = len(self._buf) if final else len(self._buf[:cut].rstrip(" "))
                out.append(self._buf[:cut])
                self._buf = self._buf[cut:]
                break
            out.append(self._buf[:i])
            self._buf = self._buf[i:]
            if self._in_fence("".join(out)):
                out.append(OPEN)
                self._buf = self._buf[len(OPEN):]
                continue
            j = self._buf.find(CLOSE)
            # Still open, the text may end in the first "]" of the closing pair
            inner = self._buf[len(OPEN): j] if j != -1 else self._buf[len(OPEN):].removesuffix("]")
            if (
                len(inner) > MAX_MARKER
                or not MARKER_CHARS.fullmatch(inner)
                or (j != -1 and not MARKER_BODY.fullmatch(inner))
                or (j == -1 and final)
            ):
                out.append(self._buf[0])
                self._buf = self._buf[1:]
                continue
            after = self._buf[j + len(CLOSE):] if j != -1 else ""
            if j == -1 or (not after and not final):
                # Wait for the rest of the marker and the character after it, holding back the spaces before it too
                if out:
                    kept = out[-1].rstrip(" ")
                    self._buf = out[-1][len(kept):] + self._buf
                    out[-1] = kept
                break
            if out:
                out[-1] = out[-1].rstrip(" ")  # the mark or nothing replaces the space before the marker
            # "claim [[id]]." closes the claim after its punctuation, as if written "claim. [[id]]"
            punct = after[:1] if after[:1] in CLOSING_PUNCT else ""
            out.append(punct + self._mark(inner))
            self._buf = after[len(punct):]
        return "".join(out)

    def _mark(self, inner: str) -> str:
        ids: List[str] = []
        for token in ID_TOKEN.findall(inner):
            if token not in self._known:
                self.invalid.append(token)
            elif token not in ids:
                ids.append(token)
        if not ids:
            return ""
        self.ids.extend(i for i in ids if i not in self.ids)
        self.groups.append(ids)
        return MARK + chr(GROUP_BASE + len(self.groups) - 1)

    def _in_fence(self, pending: str) -> bool:
        return (self._fences + (self._tail + pending).count(FENCE)) % 2 == 1

    def _pass(self, text: str) -> str:
        self._fences += (self._tail + text).count(FENCE)
        self._tail = (self._tail + text)[-(len(FENCE) - 1):]
        return text


class CitationTracker:
    def __init__(self, channel: CiteChannel) -> None:
        self._groups = channel.groups
        self._pending = ""  # a mark split across chunks
        self._pos = 0  # UTF-16 length of the text passed on so far
        self._line = ""  # text passed on since the last newline
        self._line_pos = 0  # UTF-16 offset where the current line starts
        self._claim_from: int | None = None  # index in the line after the previous mark on it
        self.citations: List[dict] = []

    def feed(self, text: str) -> str:
        text = self._pending + text
        self._pending = ""
        if text.endswith(MARK):
            self._pending, text = MARK, text[:-1]
        out: List[str] = []
        last = 0
        for m in MARK_RE.finditer(text):
            out.append(self._advance(text[last: m.start()]))
            self._close_claim(ord(m.group(1)) - GROUP_BASE)
            last = m.end()
        out.append(self._advance(text[last:]))
        return "".join(out)

    def flush(self) -> str:
        self._pending = ""  # a lone mark at the very end carries no group
        return ""

    def _advance(self, chunk: str) -> str:
        if "\n" in chunk:
            head, _, self._line = chunk.rpartition("\n")
            self._line_pos = self._pos + _utf16_len(head) + 1
            self._claim_from = None
        else:
            self._line += chunk
        self._pos += _utf16_len(chunk)
        return chunk

    def _close_claim(self, group: int) -> None:
        line = self._line
        start = self._claim_from if self._claim_from is not None else LINE_PREFIX.match(line).end()
        self._claim_from = len(line)
        end = len(line.rstrip())
        start += len(line[start:end]) - len(line[start:end].lstrip())
        # Table rows are split into cells by "|": a claim there would cross cells
        if end <= start or line.lstrip().startswith("|") or not 0 <= group < len(self._groups):
            return
        self.citations.append(
            {
                "start": self._line_pos + _utf16_len(line[:start]),
                "end": self._line_pos + _utf16_len(line[:end]),
                "text": line[start:end],
                "source_ids": list(self._groups[group]),
            }
        )
