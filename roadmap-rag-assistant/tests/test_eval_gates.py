"""Quality gates: the routing and retrieval evals must not fall below their thresholds.

Both run offline (heuristics only, FTS on the committed prisma/dev.db). Raise a threshold when an
eval improves; lower one only with a reason in the commit. Details per case:
    .venv/bin/python -m tests.eval_routing
    .venv/bin/python -m tests.eval_retrieval --fts-only
"""

from __future__ import annotations

import json

import pytest

from tests.eval_retrieval import CASES_PATH as RETRIEVAL_CASES
from tests.eval_retrieval import DEV_DB, K, build_store
from tests.eval_retrieval import evaluate as evaluate_retrieval
from tests.eval_routing import CASES_PATH as ROUTING_CASES
from tests.eval_routing import classify_heuristics
from tests.eval_routing import evaluate as evaluate_routing
from rag_service.router.intent_router import IntentRouter

ROUTING_MIN_ACCURACY = 0.95
RETRIEVAL_MIN_HIT = 0.95
RETRIEVAL_MIN_MRR = 0.88


def _load(path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_routing_accuracy_gate():
    res = evaluate_routing(classify_heuristics(IntentRouter(), _load(ROUTING_CASES)))
    assert res["accuracy"] >= ROUTING_MIN_ACCURACY, "\n".join(res["failures"])


def test_no_question_is_routed_to_cud():
    # A question routed to CUD can write data; this has no tolerance.
    rows = classify_heuristics(IntentRouter(), _load(ROUTING_CASES))
    misrouted = [c["query"] for c, got, _ in rows if got == "roadmap_cud" and c["expected"] != "roadmap_cud"]
    assert misrouted == []


@pytest.mark.skipif(not DEV_DB.exists(), reason="prisma/dev.db not available")
async def test_retrieval_fts_gate():
    store = await build_store(fts_only=True)
    res = evaluate_retrieval(store, _load(RETRIEVAL_CASES), lambda s, q: s.search_fts(q, limit=K))
    misses = "\n".join(f for f in res["failures"] if f.startswith("MISS"))
    assert res[f"hit@{K}"] >= RETRIEVAL_MIN_HIT, misses
    assert res[f"mrr@{K}"] >= RETRIEVAL_MIN_MRR, misses
