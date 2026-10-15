"""Output guardrails for synthesized answers.

- LinkGuard: streaming filter that turns `[text](/?topic=slug)` links to unknown slugs into
  plain text, so the model cannot send visitors to roadmaps that do not exist.
- check_grounding: after the answer is complete, flags names and promises that are not backed
  by the retrieved context. Flags only (Langfuse metadata); nothing is blocked.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable
from urllib.parse import unquote

LINK = re.compile(r"\[([^\]\n]*)\]\(([^)\s]*)\)")
# A "[" that may still become a link once more tokens arrive
PARTIAL_LINK = re.compile(r"\[[^\]\n]*(?:\](?:\([^)\s]*)?)?")
TOPIC_URL = re.compile(r"^/\?topic=([^&#]+)")
# Held back at most this long; anything longer is not a link the model is writing
MAX_PENDING = 300

BOLD = re.compile(r"\*\*([^*\n]+?)\*\*")
FUTURE_PROMISE = re.compile(
    r"(sẽ (?:sớm |được )?(?:cập nhật|bổ sung|thêm|ra mắt|có)|sắp (?:có|ra mắt|cập nhật)|chúng tôi sẽ|will be (?:added|updated))",
    re.IGNORECASE,
)


class LinkGuard:
    """Feed streamed deltas in, get the same text out with invalid topic links unlinked."""

    def __init__(self, valid_slugs: Iterable[str]) -> None:
        self._valid = set(valid_slugs)
        self._buf = ""
        self.removed_slugs: list[str] = []

    def _check(self, m: re.Match) -> str:
        topic = TOPIC_URL.match(m.group(2))
        if topic is None:
            return m.group(0)
        slug = unquote(topic.group(1))
        if slug in self._valid:
            return m.group(0)
        self.removed_slugs.append(slug)
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


def _words(text: str) -> set[str]:
    return set(re.findall(r"\w+", unicodedata.normalize("NFC", text).casefold()))


def check_grounding(answer: str, context: str, question: str) -> dict:
    """Names in bold that appear in neither the context nor the question, plus future promises.

    Compared word by word, so a name the model reformats ("Mảng kiến thức 01‑GEN General" for
    "Mảng kiến thức: [01-GEN] General") still counts as grounded.
    """
    known = _words(f"{context}\n{question}")
    names = {n.strip() for n in BOLD.findall(answer)}
    # "**Lưu ý:**"-style labels are formatting, not names
    ungrounded = sorted(
        n for n in names if n and not n.endswith(":") and not _words(n) <= known
    )
    promises = [m.group(0) for m in FUTURE_PROMISE.finditer(answer)]
    return {"ungrounded_terms": ungrounded, "future_promise": promises}
