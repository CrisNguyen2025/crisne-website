"""Section 4 — Post-Generation Guardrails.

Checks the finished answer against the retrieved context (ungrounded names, future promises)
and the citation filter (invalid links). Findings are reported, not blocking: the answer has
already streamed, so they go to the trace and, for owners, to a `guard` step.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from rag_service.output_guard import check_grounding


@dataclass
class GuardReport:
    grounding: dict = field(default_factory=dict)

    @property
    def issues(self) -> List[str]:
        return [k for k, v in self.grounding.items() if v]

    @property
    def found(self) -> dict:
        return {k: v for k, v in self.grounding.items() if v}


def check(answer: str, context: str, query: str, invalid_links: List[str]) -> GuardReport:
    grounding = check_grounding(answer, context, query)
    grounding["invalid_links"] = invalid_links
    return GuardReport(grounding)
