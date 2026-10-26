"""Write policy — System 1, System 2 and the roadmap data must agree before a change runs at once.

Inputs, for a message the write gate (write_gate.gate_route) left as a write candidate:
- System 1: the heuristic router decided a change (`s1_change`), and the gate's mode (allow | confirm)
- System 2: the model's reading (verifier.WriteVerdict), or None when it is unavailable
- grounding: whether the change names something that exists (target_grounding.ground_change)

| situation                                                        | outcome                         |
|------------------------------------------------------------------|---------------------------------|
| System 2 unavailable                                             | never at once: a denied gate keeps its ask-back, anything else is previewed |
| System 2: a command / request aimed at the roadmap, but another intent or no action | preview: System 2 overrules System 1 only with a reason (external target, negation, hypothetical, report, sarcasm, question) |
| System 2: not a roadmap change (question, negation, external…)   | route to System 2's intent; a negation or sarcasm gets the "nothing changed" reply |
| a change, but the target / container is not in the roadmap       | preview: the change handler asks back with the closest names |
| a new topic                                                      | at once only with an explicit name ("tên là X", quoted) and System 1 + gate allow; else preview |
| grounded, System 1 decided it and the gate allows                | at once (deletes are still previewed at extraction) |
| anything else                                                    | preview                         |

Nothing here writes; it returns what the agent does next.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from rag_service.domains.roadmap.router.policy import WRITE_ALLOW, WRITE_CONFIRM, WRITE_DENY
from rag_service.domains.roadmap.router.schemas import ActionType, EntityLevel, IntentType
from rag_service.domains.roadmap.router.target_grounding import Grounding
from rag_service.domains.roadmap.router.verifier import Act, WriteVerdict

RUN = "run"            # the change runs at once
PREVIEW = "preview"    # a preview card the user confirms
REROUTE = "reroute"    # not a change: answer with `intent` instead
BLOCKED = "blocked"    # a declined change: "nothing was changed"
KEEP = "keep"          # no new evidence: the write gate's own decision stands


@dataclass(frozen=True)
class WritePlan:
    outcome: str
    reason: str
    intent: Optional[IntentType] = None  # for REROUTE: the intent to answer with


def _not_a_change(verdict: WriteVerdict) -> WritePlan:
    if verdict.act in (Act.NEGATION, Act.SARCASM):
        return WritePlan(BLOCKED, f"system 2: {verdict.act.value}")
    intent = verdict.intent
    if intent in (IntentType.ROADMAP_CUD, IntentType.UNCLEAR):
        intent = IntentType.KNOWLEDGE_QUERY
    return WritePlan(REROUTE, f"system 2: {verdict.act.value} about {verdict.target_system.value}", intent)


def plan_write(
    *,
    gate_mode: str,
    s1_change: bool,
    verdict: Optional[WriteVerdict],
    grounding: Optional[Grounding],
    explicit_name: bool,
) -> WritePlan:
    if verdict is not None and verdict.says_roadmap_command and not verdict.is_roadmap_change:
        # System 2 reads a command aimed at this roadmap yet filled in another intent or no action: an incomplete
        # reading, not a reason to overrule System 1. Rerouted, a clear command ("tạo topic AI Engineering") got a
        # knowledge answer suggesting that same command, again and again. Previewed, it waits for the user's "ok".
        return WritePlan(PREVIEW, "system 2 read a roadmap command but its reading is incomplete")
    if verdict is None:
        # Without System 2 nothing runs at once. A gate that already said no keeps its ask-back
        # ("xóa nó đi" at low confidence); any other candidate is only previewed.
        if gate_mode == WRITE_DENY:
            return WritePlan(KEEP, "system 2 unavailable, the write gate denied it")
        return WritePlan(PREVIEW, "system 2 unavailable")
    if not verdict.is_roadmap_change:
        return _not_a_change(verdict)
    if grounding is not None and grounding.ungrounded:
        # A roadmap change whose target is missing ("xóa topic Test" when there is none): the change handler
        # resolves it and asks back with the closest names; it never writes without the user's "ok"
        return WritePlan(PREVIEW, f"ungrounded: {grounding.reason}")
    agreed = s1_change and gate_mode == WRITE_ALLOW
    if verdict.action == ActionType.CREATE and verdict.entity_level == EntityLevel.TOPIC:
        if agreed and explicit_name:
            return WritePlan(RUN, "new topic, explicitly named, both systems agree")
        return WritePlan(PREVIEW, "new topic without an explicit name or agreement")
    if agreed and grounding is not None and grounding.grounded:
        return WritePlan(RUN, f"grounded ({grounding.reason}), both systems agree")
    return WritePlan(PREVIEW, f"{grounding.status if grounding else 'no grounding'}; s1={s1_change} gate={gate_mode}")


def gate_mode_for(plan: WritePlan) -> Optional[str]:
    """The write gate mode a plan maps to, or None when the message is not handled as a change."""
    return {RUN: WRITE_ALLOW, PREVIEW: WRITE_CONFIRM}.get(plan.outcome)
