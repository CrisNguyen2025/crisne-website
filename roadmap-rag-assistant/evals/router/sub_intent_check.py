"""Sub-intent accuracy: does a KNOWLEDGE_QUERY go to the downstream that can answer it?

    .venv/bin/python -m evals.router.sub_intent_check        # heuristics only, no network

Reads the `metadata.sub_intent` labels in evals/datasets/_routing/samples.jsonl (search | catalog | lesson_status) and
compares them with the decision table's sub_intent. The table decides without a model call; a labelled message
it leaves to the LLM router has no sub_intent and counts as `undecided` (it falls back to search at run time).
Kept apart from check.py so that its snapshot and ratchet are not tied to the labels. Exit 1 below the threshold.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).parent.parent.parent
SAMPLES = REPO / "evals" / "datasets" / "_routing" / "samples.jsonl"
THRESHOLD = 0.95


def run() -> tuple[Counter, list[tuple[str, str, str, str]]]:
    from rag_service.domains.roadmap.router.intent_router import IntentRouter

    router = IntentRouter()
    counts: Counter = Counter()
    wrong: list[tuple[str, str, str, str]] = []
    for line in SAMPLES.read_text(encoding="utf-8").splitlines():
        sample = json.loads(line)
        want = sample["metadata"].get("sub_intent")
        if want is None or sample["metadata"].get("status") != "active":
            continue
        decision = router.decide(sample["input"])
        got = decision.sub_intent.value if decision.sub_intent else None
        if got is None:
            counts["undecided"] += 1
            wrong.append((sample["id"], sample["input"][:80], want, "undecided"))
        elif got == want:
            counts["correct"] += 1
        else:
            counts["wrong"] += 1
            wrong.append((sample["id"], sample["input"][:80], want, got))
        counts[f"want.{want}"] += 1
    return counts, wrong


def main(argv: list[str]) -> int:
    sys.path.insert(0, str(REPO))
    counts, wrong = run()
    total = counts["correct"] + counts["wrong"] + counts["undecided"]
    accuracy = counts["correct"] / total if total else 0.0
    for sample_id, text, want, got in wrong:
        print(f"  {sample_id} want={want} got={got} | {text}")
    print(f"sub_intent: {counts['correct']}/{total} correct ({accuracy:.1%}), threshold {THRESHOLD:.0%}")
    print({k: v for k, v in sorted(counts.items()) if k.startswith("want.")})
    return 0 if total and accuracy >= THRESHOLD else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
