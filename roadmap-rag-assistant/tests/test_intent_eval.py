"""Offline intent eval: guard + heuristic router on a fixed message set (no LLM, no network).

expected:
- "sensitive": blocked by the sensitive guard before routing
- "mixed": a search and a roadmap change in one message, answered with an ask-back
- an IntentType value: what the heuristic router must return
- null: heuristics must stay undecided so the LLM router classifies it

Add a case here whenever a message is misrouted in production.
"""

from __future__ import annotations

import json
from pathlib import Path

from rag_service.domains.roadmap.router.grounding import is_sensitive_request
from rag_service.domains.roadmap.router.intent_router import IntentRouter

CASES_PATH = Path(__file__).parent / "data" / "intent_eval_cases.json"


def test_intent_eval_cases():
    router = IntentRouter()
    failures: list[str] = []
    for case in json.loads(CASES_PATH.read_text(encoding="utf-8")):
        message, expected = case["message"], case["expected"]
        if is_sensitive_request(message):
            got = "sensitive"
        elif router.has_mixed_intents(message):
            got = "mixed"
        else:
            res = router.classify_heuristics(message)
            got = res.intent.value if res else None
        if got != expected:
            failures.append(f"{message!r}: expected {expected}, got {got}")
    assert not failures, "\n".join(failures)
