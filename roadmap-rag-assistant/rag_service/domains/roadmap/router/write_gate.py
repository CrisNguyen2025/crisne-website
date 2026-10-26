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
    ACTION_VERBS,
    CUD_MIN_CONFIDENCE,
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
import re

from rag_service.domains.roadmap.router.polarity import split_affirmed
from rag_service.domains.roadmap.router.understanding import echoes_question, understand

# Reasons a change is denied; the agent maps each to the reply the user sees
UNCONFIRMED_GUESS = "unconfirmed_guess"  # only the LLM chose a change, without a change verb + object or confidence
BLOCKED_CHANGE = "blocked_change"        # the message names a change it does not ask for (policy: write blockers)
ACTION_NOT_ASKED = "action_not_asked"    # the extracted change is not the one the message's verb asks for
CONTENT_UNCLEAR = "content_unclear"        # "tạo thông tin cho topic": which kind of entity to add is not named
DESCRIPTION_UNSUPPORTED = "description_unsupported"  # a topic's description is set at create only
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
    # Checked on the message itself, whatever routed it here (heuristics, LLM router, System 2):
    # a declined, hypothetical or reported change is never previewed.
    if understand(message).write_blocker:
        return WriteGate(WRITE_DENY, BLOCKED_CHANGE)
    if action.action == ActionType.CREATE and any(echoes_question(e.title, message) for e in action.entities):
        return WriteGate(WRITE_DENY, QUESTION_AS_TITLE)
    # The change must be the one asked for, by a verb in the affirmed part of the message (polarity.py):
    # "khỏi tạo topic X" read as a delete, or "đừng sửa, xóa bài Y" read as an update, is not previewed.
    affirmed, _ = split_affirmed(message)
    if not any(re.search(rf"\b{re.escape(v)}\b", affirmed) for v in ACTION_VERBS[action.action.value]):
        return WriteGate(WRITE_DENY, ACTION_NOT_ASKED)
    if action.action == ActionType.DELETE and BULK_DELETE.search(lower):
        return WriteGate(WRITE_DENY, BULK_DELETE_REQUEST)
    # A delete always shows a preview first, "xóa luôn" included: it cannot be undone
    if action.action == ActionType.DELETE:
        return WriteGate(WRITE_CONFIRM, "delete")
    return route_gate
