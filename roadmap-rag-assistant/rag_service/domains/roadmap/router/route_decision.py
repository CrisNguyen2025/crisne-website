"""One decision for a routed message: intent, write gate, and for a write candidate System 2 + grounding.

The agent and the evals (evals/router/holdout.py, the stress set) both call `decide_route`, so what the evals
measure is what the chat does.

    System 1 (IntentRouter.aroute: heuristics, then the LLM router for what they leave)
      → write gate (gate_route: blocked changes, changes without evidence)
      → write candidate? System 2 (verifier.verify_write) → grounding (target_grounding) → write_policy.plan_write

Every message passes the same phases (docs/routing-phases.md). `RouteOutcome.trace` records each phase's
output and `decided_by` the phase that settled the route, so a wrong answer names the phase to fix:

    P0 clean  P1 act  P2 polarity  P3 target  P4 scope  P5 table / LLM router  P6 System 2  P7 grounding  P8 gate
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional, Sequence

from rag_service.domains.roadmap.router.grounding import build_grounding
from rag_service.domains.roadmap.router.intent_router import Decision, IntentRouter
from rag_service.domains.roadmap.router.policy import NAMED_PART, WRITE_ALLOW, WRITE_CONFIRM, WRITE_DENY, WRITE_NONE
from rag_service.domains.roadmap.router.schemas import IntentClassificationResult, IntentType
from rag_service.domains.roadmap.router.scope import ScopeResult, out_of_scope_act, search_act
from rag_service.domains.roadmap.router.policy import Target
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
    scope: Optional[ScopeResult] = None

    @property
    def write(self) -> str:
        """run | preview | none, for logs and evals."""
        return {WRITE_ALLOW: "run", WRITE_CONFIRM: "preview"}.get(self.gate.mode, "none")

    @property
    def decided_by(self) -> str:
        """The phase that settled this route: where to look first when it is wrong."""
        u = self.decision.understanding
        if self.method == "scope":
            return "P4_scope"
        if self.plan is not None:
            if self.plan.reason.startswith("system 2"):
                return "P6_verify"
            if self.grounding is not None and self.grounding.ungrounded:
                return "P7_ground"
            return "P8_gate"
        if self.gate.denied:
            return "P2_polarity" if self.gate.reason == BLOCKED_CHANGE and u.write_blocker else "P8_gate"
        return "P5_table" if self.method == "heuristic" else "P5_llm"

    def trace(self) -> dict:
        """Each phase's output, in order (P0 cleaning is inside understand(): its result is `focus`)."""
        u = self.decision.understanding
        return {
            "P0_focus": self.scope.focus if self.scope else None,
            "P1_act": u.act.value,
            "P2_polarity": u.polarity,
            "P3_target": u.target.value,
            "P4_scope": self.scope.scope.value if self.scope else None,
            "P5_route": f"{self.method}:{self.decision.row or self.intent_res.intent.value}",
            "P6_verify": f"{self.verdict.act.value}/{self.verdict.action.value if self.verdict.action else '-'}"
            if self.verdict else None,
            "P7_ground": self.grounding.status if self.grounding else None,
            "P8_gate": f"{self.gate.mode}:{self.gate.reason}" if self.gate.reason else self.gate.mode,
            "decided_by": self.decided_by,
        }


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
    scope_fn: Optional[Callable[[str], Awaitable[ScopeResult]]] = None,
) -> RouteOutcome:
    # P3 reads a place named without its noun ("layer trong fe") against the roadmap's own topics and layers
    if catalog is not None:
        router.known_place = catalog.has_place
    decision = router.decide(content)
    # A declined change ("thôi khỏi tạo topic X", "đừng xóa bài Y") is settled by the heuristics: nothing is
    # changed and the reply says so, with no LLM router call. Hypothetical or reported changes are often real
    # questions ("nếu xóa layer 1 thì sao?"), so they keep routing.
    if decision.write == WRITE_DENY and decision.understanding.write_blocker == "negation":
        declined = IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.9, needs_cud_extraction=False)
        return RouteOutcome(declined, "heuristic", decision, WriteGate(WRITE_DENY, BLOCKED_CHANGE))
    scope: Optional[ScopeResult] = None
    # Keywords named no target: read it from the roadmap's data (scope.py). An outside topic is answered
    # "out of scope" here, before the LLM router, retrieval or System 2 is called.
    if scope_fn is not None and decision.understanding.target == Target.NONE:
        scope = await scope_fn(content)
        if out_of_scope_act(decision.understanding.act.value, scope.scope):
            out = IntentClassificationResult(intent=IntentType.OUT_OF_SCOPE, confidence=0.9, needs_cud_extraction=False)
            return RouteOutcome(out, "scope", decision, WriteGate(WRITE_NONE), scope=scope)
        # A question about the roadmap's field that the heuristics left open: a search, no LLM router needed
        if decision.intent is None and search_act(decision.understanding.act.value, scope.scope):
            found = IntentClassificationResult(intent=IntentType.KNOWLEDGE_QUERY, confidence=0.85, needs_cud_extraction=False)
            return RouteOutcome(found, "scope", decision, WriteGate(WRITE_NONE), scope=scope)
    intent_res, method = await router.aroute(content, history)
    gate = gate_route(
        intent_res, method, router.has_change_request(content, follow_up=bool(history)), decision.write
    )
    if not is_write_candidate(gate):
        return RouteOutcome(intent_res, method, decision, gate, scope=scope)
    # A visitor can never write: the change handler answers "owner only" before extracting anything,
    # so System 2 is not called (a visitor sending change-like messages cannot spend the model's quota)
    if not owner:
        return RouteOutcome(intent_res, method, decision, gate, scope=scope)

    verdict = await verify_write(verifier_llm, content, history, build_grounding(page_context))
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
                            plan, verdict, grounding, scope=scope)
    if plan.outcome == KEEP:
        return RouteOutcome(intent_res, method, decision, gate, plan, verdict, grounding, scope=scope)
    if plan.outcome == BLOCKED:
        return RouteOutcome(intent_res, method, decision, WriteGate(WRITE_DENY, BLOCKED_CHANGE), plan, verdict, grounding, scope=scope)
    assert plan.outcome == REROUTE
    rerouted = IntentClassificationResult(
        intent=plan.intent or IntentType.KNOWLEDGE_QUERY,
        confidence=verdict.confidence if verdict else 0.5,
        needs_cud_extraction=False,
    )
    return RouteOutcome(rerouted, f"{method}+reroute", decision, WriteGate(WRITE_NONE), plan, verdict, grounding, scope=scope)
