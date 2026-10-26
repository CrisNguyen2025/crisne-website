"""One decision for a routed message: intent, write gate, and for a write candidate System 2 + grounding.

The agent and the evals (evals/router/holdout.py, the stress set) both call `decide_route`, so what the evals
measure is what the chat does.

    System 1 (IntentRouter.aroute: heuristics, then the LLM router for what they leave)
      → write gate (gate_route: blocked changes, changes without evidence)
      → write candidate? System 2 (verifier.verify_write) → grounding (target_grounding) → write_policy.plan_write
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Sequence

from rag_service.domains.roadmap.router.intent_router import Decision, IntentRouter
from rag_service.domains.roadmap.router.policy import NAMED_PART, WRITE_ALLOW, WRITE_CONFIRM, WRITE_DENY, WRITE_NONE
from rag_service.domains.roadmap.router.schemas import IntentClassificationResult, IntentType
from rag_service.domains.roadmap.router.target_grounding import Catalog, Grounding, ground_change
from rag_service.domains.roadmap.router.verifier import WriteVerdict, verify_write
from rag_service.domains.roadmap.router.write_gate import BLOCKED_CHANGE, UNCONFIRMED_GUESS, WriteGate, gate_route
from rag_service.domains.roadmap.router.write_policy import BLOCKED, KEEP, REROUTE, WritePlan, gate_mode_for, plan_write


@dataclass
class RouteOutcome:
    intent_res: IntentClassificationResult
    method: str
    decision: Decision
    gate: WriteGate
    plan: Optional[WritePlan] = None
    verdict: Optional[WriteVerdict] = None
    grounding: Optional[Grounding] = None

    @property
    def write(self) -> str:
        """run | preview | none, for logs and evals."""
        return {WRITE_ALLOW: "run", WRITE_CONFIRM: "preview"}.get(self.gate.mode, "none")


def is_write_candidate(gate: WriteGate) -> bool:
    return gate.mode in (WRITE_ALLOW, WRITE_CONFIRM) or (gate.denied and gate.reason == UNCONFIRMED_GUESS)


async def decide_route(
    router: IntentRouter,
    content: str,
    history: Sequence[Any] = (),
    *,
    verifier_llm: Any = None,
    catalog: Optional[Catalog] = None,
    page_context: Optional[dict] = None,
    owner: bool = True,
) -> RouteOutcome:
    intent_res, method = await router.aroute(content, history)
    decision = router.decide(content)
    gate = gate_route(
        intent_res, method, router.has_change_request(content, follow_up=bool(history)), decision.write
    )
    if not is_write_candidate(gate):
        return RouteOutcome(intent_res, method, decision, gate)
    # A visitor can never write: the change handler answers "owner only" before extracting anything,
    # so System 2 is not called (a visitor sending change-like messages cannot spend the model's quota)
    if not owner:
        return RouteOutcome(intent_res, method, decision, gate)

    verdict = await verify_write(verifier_llm, content, history)
    grounding = (
        ground_change(verdict, catalog or Catalog(), page_context)
        if verdict is not None and verdict.is_roadmap_change
        else None
    )
    plan = plan_write(
        gate_mode=gate.mode,
        s1_change=method == "heuristic" and intent_res.intent == IntentType.ROADMAP_CUD,
        verdict=verdict,
        grounding=grounding,
        explicit_name=NAMED_PART.search(content.lower()) is not None,
    )
    mode = gate_mode_for(plan)
    if mode is not None:
        cud = IntentClassificationResult(
            intent=IntentType.ROADMAP_CUD,
            confidence=max(intent_res.confidence, verdict.confidence if verdict else 0.0),
            needs_cud_extraction=True,
            needs_confirmation=mode == WRITE_CONFIRM,
        )
        return RouteOutcome(cud, method, decision, WriteGate(mode, None if mode == WRITE_ALLOW else plan.reason),
                            plan, verdict, grounding)
    if plan.outcome == KEEP:
        return RouteOutcome(intent_res, method, decision, gate, plan, verdict, grounding)
    if plan.outcome == BLOCKED:
        return RouteOutcome(intent_res, method, decision, WriteGate(WRITE_DENY, BLOCKED_CHANGE), plan, verdict, grounding)
    assert plan.outcome == REROUTE
    rerouted = IntentClassificationResult(
        intent=plan.intent or IntentType.KNOWLEDGE_QUERY,
        confidence=verdict.confidence if verdict else 0.5,
        needs_cud_extraction=False,
    )
    return RouteOutcome(rerouted, f"{method}+reroute", decision, WriteGate(WRITE_NONE), plan, verdict, grounding)
