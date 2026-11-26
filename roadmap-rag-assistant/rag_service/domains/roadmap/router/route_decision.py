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
import re
from typing import Any, Awaitable, Callable, Optional, Sequence

from rag_service.domains.roadmap.retrieval.relevance import asks_about_current_page
from rag_service.domains.roadmap.router.grounding import build_grounding
from rag_service.domains.roadmap.router.intent_router import Decision, IntentRouter
from rag_service.domains.roadmap.router.policy import NAMED_PART, WRITE_ALLOW, WRITE_CONFIRM, WRITE_DENY, WRITE_NONE
from rag_service.domains.roadmap.router.schemas import IntentClassificationResult, IntentType, KnowledgeSubIntent
from rag_service.domains.roadmap.router.scope import ScopeResult, out_of_scope_act, search_act
from rag_service.domains.roadmap.router.policy import Target
from rag_service.domains.roadmap.router.target_grounding import Catalog, Grounding, ground_change
from rag_service.domains.roadmap.router.verifier import WriteVerdict, verify_write
from rag_service.domains.roadmap.router.write_gate import (
    BLOCKED_CHANGE,
    CONTENT_UNCLEAR,
    DESCRIPTION_UNSUPPORTED,
    UNCONFIRMED_GUESS,
    WriteGate,
    gate_route,
)
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
        if self.method in ("scope", "page_context"):
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


def _unsupported_change(u) -> Optional[str]:
    if u.act.value not in ("command", "request"):
        return None
    if u.description_update:
        return DESCRIPTION_UNSUPPORTED
    if u.vague_content:
        return CONTENT_UNCLEAR
    return None


_OPEN_PAGE_READ_VERB_RE = re.compile(
    r"\b(?:tom\s+tat|giai\s+thich|phan\s+tich|noi\s+dung|y\s+chinh|diem\s+chinh|tong\s+quan|xem\s+lai|doc\s+lai)\b"
)


def _is_open_page_query(decision: Decision, page_context: Optional[dict]) -> bool:
    """Undecided read/question explicitly pointing at the open Topic/Lesson ('tóm tắt bài này', 'trang này nói gì?')."""
    if not page_context or not (
        str(page_context.get("itemId") or "").strip() or str(page_context.get("roadmapSlug") or "").strip()
    ):
        return False
    u = decision.understanding
    if (
        decision.intent is not None
        or u.has_change_verb
        or u.write_blocker is not None
        or u.asks_usage
        or u.target in (Target.OFF_TOPIC, Target.ASSISTANT)
    ):
        return False
    if not asks_about_current_page(u.flat):
        return False
    return u.act.value == "question" or bool(_OPEN_PAGE_READ_VERB_RE.search(u.flat))


def is_write_candidate(gate: WriteGate) -> bool:
    return gate.mode in (WRITE_ALLOW, WRITE_CONFIRM) or (gate.denied and gate.reason == UNCONFIRMED_GUESS)


async def _check_scope_route(
    decision,
    content: str,
    scope_fn: Optional[Callable[[str], Awaitable[ScopeResult]]],
) -> tuple[Optional[ScopeResult], Optional[RouteOutcome]]:
    # Keywords named no target: read it from the roadmap's data (scope.py). An outside topic is answered
    # "out of scope" here, before the LLM router, retrieval or System 2 is called.
    if (
        scope_fn is None
        or decision.understanding.target != Target.NONE
        or decision.sub_intent in (KnowledgeSubIntent.LESSON_STATUS, KnowledgeSubIntent.CATALOG)
    ):
        return None, None
    scope = await scope_fn(content)
    if out_of_scope_act(decision.understanding.act.value, scope.scope):
        out = IntentClassificationResult(intent=IntentType.OUT_OF_SCOPE, confidence=0.9, needs_cud_extraction=False)
        return scope, RouteOutcome(out, "scope", decision, WriteGate(WRITE_NONE), scope=scope)
    if decision.intent is None and search_act(decision.understanding.act.value, scope.scope):
        found = IntentClassificationResult(intent=IntentType.KNOWLEDGE_QUERY, confidence=0.85, needs_cud_extraction=False)
        return scope, RouteOutcome(found, "scope", decision, WriteGate(WRITE_NONE), scope=scope)
    return scope, None


async def _finalize_write_route(
    intent_res: IntentClassificationResult,
    method: str,
    decision,
    gate: WriteGate,
    scope: Optional[ScopeResult],
    verifier_llm: Any,
    content: str,
    history: Sequence[Any],
    catalog: Optional[Catalog],
    page_context: Optional[dict],
) -> RouteOutcome:
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
        return RouteOutcome(
            cud, method, decision, WriteGate(mode, None if mode == WRITE_ALLOW else plan.reason),
            plan, verdict, grounding, scope=scope,
        )
    if plan.outcome == KEEP:
        return RouteOutcome(intent_res, method, decision, gate, plan, verdict, grounding, scope=scope)
    if plan.outcome == BLOCKED:
        return RouteOutcome(intent_res, method, decision, WriteGate(WRITE_DENY, BLOCKED_CHANGE), plan, verdict, grounding, scope=scope)
    if plan.outcome != REROUTE:
        raise RuntimeError(f"Unexpected route plan outcome: {plan.outcome!r}")
    rerouted = IntentClassificationResult(
        intent=plan.intent or IntentType.KNOWLEDGE_QUERY,
        confidence=verdict.confidence if verdict else 0.5,
        needs_cud_extraction=False,
    )
    return RouteOutcome(rerouted, f"{method}+reroute", decision, WriteGate(WRITE_NONE), plan, verdict, grounding, scope=scope)


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
    if catalog is not None:
        router.known_place = catalog.has_place
    decision = router.decide(content)
    if decision.write == WRITE_DENY and decision.understanding.write_blocker == "negation":
        declined = IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.9, needs_cud_extraction=False)
        return RouteOutcome(declined, "heuristic", decision, WriteGate(WRITE_DENY, BLOCKED_CHANGE))
    if (unsupported := _unsupported_change(decision.understanding)) is not None:
        ask = IntentClassificationResult(intent=IntentType.ROADMAP_CUD, confidence=0.9, needs_cud_extraction=False)
        return RouteOutcome(ask, "heuristic", decision, WriteGate(WRITE_DENY, unsupported))

    if _is_open_page_query(decision, page_context):
        found = IntentClassificationResult(
            intent=IntentType.KNOWLEDGE_QUERY,
            confidence=0.9,
            sub_intent=KnowledgeSubIntent.SEARCH,
            needs_cud_extraction=False,
        )
        return RouteOutcome(found, "page_context", decision, WriteGate(WRITE_NONE))

    scope, scope_outcome = await _check_scope_route(decision, content, scope_fn)
    if scope_outcome is not None:
        return scope_outcome

    intent_res, method = await router.aroute(content, history)
    gate = gate_route(
        intent_res, method, router.has_change_request(content, follow_up=bool(history)), decision.write
    )
    if not is_write_candidate(gate) or not owner:
        return RouteOutcome(intent_res, method, decision, gate, scope=scope)

    return await _finalize_write_route(
        intent_res, method, decision, gate, scope, verifier_llm, content, history, catalog, page_context
    )
