"""Section 4 — Post-Generation Guardrails.

- check: grounding report on the finished answer against the retrieved documents
  (ungrounded names, future promises, invalid links). Whether a finding fails the answer is
  the profile's call (grounding_fail_on / grounding_policy).
- PiiStreamFilter: masks emails and phone numbers in the answer while it streams.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, List

from rag_service.output_guard import check_grounding
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


class NoFilter:
    def feed(self, text: str) -> str:
        return text

    def flush(self) -> str:
        return ""
