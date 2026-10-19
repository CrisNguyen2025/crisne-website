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
ITEM_PARAM = re.compile(r"[?&]item=([^&#]+)")
# Held back at most this long; anything longer is not a link the model is writing
MAX_PENDING = 300

BOLD = re.compile(r"\*\*([^*\n]+?)\*\*")
FUTURE_PROMISE = re.compile(
    r"(sẽ (?:sớm |được )?(?:cập nhật|bổ sung|thêm|ra mắt|có)|sắp (?:có|ra mắt|cập nhật)|chúng tôi sẽ|will be (?:added|updated))",
    re.IGNORECASE,
)


ACTION_CLAIM = re.compile(
    r"✅\s*(?:đã\s+)?(?:tạo|lưu|thêm|xóa|xoá|cập\s+nhật|sửa)\b"
    r"|\b(?:đã|vừa)\s+(?:được\s+)?(?:tạo|lưu|thêm|xóa|xoá|cập\s+nhật|sửa)\b"
    r"|\bđược\s+(?:tạo|lưu)\s+(?:và|thành\s+công|xong)\b",
    re.IGNORECASE,
)


class LinkGuard:
    """Feed streamed deltas in, get the same text out with invalid topic links unlinked.

    With `valid_items`, a link's `&item=` must also be a known item id, so the model cannot point a
    citation at a lesson that does not exist.
    """

    def __init__(self, valid_slugs: Iterable[str], valid_items: Iterable[str] | None = None) -> None:
        self._valid = set(valid_slugs)
        self._items = set(valid_items) if valid_items is not None else None
        self._buf = ""
        self.removed_slugs: list[str] = []
        self.removed_items: list[str] = []

    def _check(self, m: re.Match) -> str:
        topic = TOPIC_URL.match(m.group(2))
        if topic is None:
            return m.group(0)
        slug = unquote(topic.group(1))
        if slug not in self._valid:
            self.removed_slugs.append(slug)
            return m.group(1)
        item = ITEM_PARAM.search(m.group(2))
        if item and self._items is not None and unquote(item.group(1)) not in self._items:
            self.removed_items.append(unquote(item.group(1)))
            return m.group(1)
        return m.group(0)

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
    # Answers never run a write: a claim of having created/saved/changed something is invented
    actions = [m.group(0) for m in ACTION_CLAIM.finditer(answer)]
    return {"ungrounded_terms": ungrounded, "future_promise": promises, "unbacked_action": actions}
