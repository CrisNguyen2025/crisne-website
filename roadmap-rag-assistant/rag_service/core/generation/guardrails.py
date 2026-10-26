"""Section 4 — Post-Generation Guardrails.

- check: grounding report on the finished answer against the retrieved documents
  (ungrounded names, future promises, invalid links). Whether a finding fails the answer is
  the profile's call (grounding_fail_on / grounding_policy).
- PiiStreamFilter: masks emails and phone numbers in the answer while it streams.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, List

from rag_service.core.generation.grounding import check_grounding
from rag_service.pii import EMAIL_PATTERN, INTL_PHONE_PATTERN, VN_PHONE_PATTERN, mask_pii


@dataclass
class GuardReport:
    grounding: dict = field(default_factory=dict)
    fail_on: tuple[str, ...] = ()

    @property
    def issues(self) -> List[str]:
        return [k for k, v in self.grounding.items() if v]

    @property
    def found(self) -> dict:
        return {k: v for k, v in self.grounding.items() if v}

    @property
    def failed(self) -> bool:
        return any(self.grounding.get(k) for k in self.fail_on)


def check(
    answer: str, context: str, query: str, invalid_links: List[str], fail_on: Iterable[str] = ()
) -> GuardReport:
    grounding = check_grounding(answer, context, query)
    grounding["invalid_links"] = invalid_links
    return GuardReport(grounding, tuple(fail_on))


class PiiStreamFilter:
    """Streaming mask_pii: holds back the tail that could still grow into an email or phone number."""

    # Longer than any phone match; an email longer than this split across chunks may slip through.
    HOLD = 40
    _PATTERNS = (EMAIL_PATTERN, VN_PHONE_PATTERN, INTL_PHONE_PATTERN)

    def __init__(self) -> None:
        self._buf = ""

    def feed(self, text: str) -> str:
        self._buf += text
        cut = len(self._buf) - self.HOLD
        if cut <= 0:
            return ""
        # Never cut through a match: everything before `cut` must be final.
        for pattern in self._PATTERNS:
            for m in pattern.finditer(self._buf):
                if m.start() < cut < m.end():
                    cut = m.start()
        out, self._buf = self._buf[:cut], self._buf[cut:]
        return mask_pii(out)

    def flush(self) -> str:
        out, self._buf = self._buf, ""
        return mask_pii(out)


class ClaimStreamFilter:
    """Streams a sentence as soon as it ends, and drops a sentence that makes a claim the answer must not.

    For grounding_policy "sentence": the reader sees text after the first sentence instead of after the whole
    answer, yet never sees "✅ đã tạo X" (unbacked_action) or "sẽ sớm cập nhật" (future_promise).
    `patterns` maps a grounding key to its regex (grounding.FAIL_PATTERNS); `dropped` lists what was removed.
    """

    # A sentence ends at . ! ? or a newline; a longer run without one is let through so text keeps flowing
    END = re.compile(r"[.!?…]+[\s)\]\"']*|\n")
    MAX_HOLD = 400

    def __init__(self, patterns: dict) -> None:
        self._patterns = patterns
        self._buf = ""
        self.dropped: List[str] = []

    def _check(self, sentence: str) -> str:
        for key, rx in self._patterns.items():
            if rx.search(sentence):
                self.dropped.append(f"{key}: {sentence.strip()[:120]}")
                return ""
        return sentence

    def feed(self, text: str) -> str:
        self._buf += text
        out = []
        while True:
            match = self.END.search(self._buf)
            if match is None:
                break
            sentence, self._buf = self._buf[: match.end()], self._buf[match.end():]
            out.append(self._check(sentence))
        if len(self._buf) > self.MAX_HOLD:
            out.append(self._check(self._buf))
            self._buf = ""
        return "".join(out)

    def flush(self) -> str:
        out, self._buf = self._check(self._buf), ""
        return out


class NoFilter:
    def feed(self, text: str) -> str:
        return text

    def flush(self) -> str:
        return ""
