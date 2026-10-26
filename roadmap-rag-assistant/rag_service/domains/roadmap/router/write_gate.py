"""Write gate — the one place that decides whether a roadmap change may reach the database.

Two checks, both reading policy.py section 4:
- gate_route: right after routing, before anything is extracted (is this message allowed to change data at all?)
- gate_action: after the change is extracted (is this particular change safe to run now, or does it need a preview?)

Each returns a WriteGate whose mode is allow | confirm | deny, and for deny a reason the caller turns into a reply.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from rag_service.domains.roadmap.router.grounding import BULK_DELETE
from rag_service.domains.roadmap.router.policy import (
    CUD_MIN_CONFIDENCE,
    IMMEDIATE_DELETE_WORDS,
    WRITE_ALLOW,
    WRITE_CONFIRM,
    WRITE_DENY,
    WRITE_NONE,
)
from rag_service.domains.roadmap.router.schemas import (
    ActionType,
    IntentClassificationResult,
    IntentType,
    StructuredRoadmapAction,
)
from rag_service.domains.roadmap.router.understanding import echoes_question

# Reasons a change is denied; the agent maps each to the reply the user sees
UNCONFIRMED_GUESS = "unconfirmed_guess"  # only the LLM chose a change, without a change verb + object or confidence
BLOCKED_CHANGE = "blocked_change"        # the message names a change it does not ask for (policy: write blockers)
QUESTION_AS_TITLE = "question_as_title"  # the extractor took the user's question as the new entry's name
BULK_DELETE_REQUEST = "bulk_delete"      # "xóa hết": never done in one message


@dataclass(frozen=True)
class WriteGate:
    mode: str                    # none | allow | confirm | deny (policy.py section 4)
    reason: Optional[str] = None  # set when mode is deny, or names why a preview is required

    @property
    def denied(self) -> bool:
        return self.mode == WRITE_DENY


def gate_route(
    result: IntentClassificationResult,
    method: str,
    has_change_request: bool,
    heuristic_write: str = WRITE_NONE,
) -> WriteGate:
    """May this routed message change data?

    `has_change_request`: a change verb and an object (or a follow-up). `heuristic_write`: the policy table's write
    decision for the message; a heuristic deny wins over the LLM router (two signals must agree before a write).
    """
    if result.intent != IntentType.ROADMAP_CUD and not result.needs_cud_extraction:
        return WriteGate(WRITE_NONE)
    if heuristic_write == WRITE_DENY:
        return WriteGate(WRITE_DENY, BLOCKED_CHANGE)
    # A change only the LLM router chose needs the same evidence a heuristic row needs, and high confidence
    if method != "heuristic" and (result.confidence < CUD_MIN_CONFIDENCE or not has_change_request):
        return WriteGate(WRITE_DENY, UNCONFIRMED_GUESS)
    # Whether a candidate runs at once is decided after System 2 and grounding (write_policy.py)
    return WriteGate(WRITE_CONFIRM if result.needs_confirmation else WRITE_ALLOW)


def gate_action(route_gate: WriteGate, action: StructuredRoadmapAction, message: str, lower: str) -> WriteGate:
    """May this extracted change run now? Deletes and route-level confirmations get a preview card first."""
    if action.action == ActionType.CREATE and any(echoes_question(e.title, message) for e in action.entities):
        return WriteGate(WRITE_DENY, QUESTION_AS_TITLE)
    if action.action == ActionType.DELETE and BULK_DELETE.search(lower):
        return WriteGate(WRITE_DENY, BULK_DELETE_REQUEST)
    if action.action == ActionType.DELETE and (action.is_batch or not any(w in lower for w in IMMEDIATE_DELETE_WORDS)):
        return WriteGate(WRITE_CONFIRM, "delete")
    return route_gate
