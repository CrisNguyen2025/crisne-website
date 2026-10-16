"""Routing eval for the IntentRouter on a fixed set of labeled messages.

Run from roadmap-rag-assistant/:
    .venv/bin/python -m tests.eval_routing          # heuristics only (System 1), no API key needed
    .venv/bin/python -m tests.eval_routing --llm    # full aclassify: heuristics, then LLM fallback

Heuristics-only metrics: coverage (share the heuristics decide), precision on what they decide,
and accuracy over all cases (undecided counts as a miss). With --llm, each case also records
which layer decided it: heuristic, llm, or fallback (KNOWLEDGE_QUERY when the LLM is missing or fails).
"""

from __future__ import annotations

import argparse
import asyncio
import json
from collections import Counter, defaultdict
from pathlib import Path

from rag_service.router.intent_router import IntentRouter

CASES_PATH = Path(__file__).parent / "data" / "routing_eval_cases.json"
UNDECIDED = "-"


def classify_heuristics(router: IntentRouter, cases: list[dict]) -> list[tuple[dict, str, str]]:
    rows = []
    for case in cases:
        res = router.classify_heuristics(case["query"])
        rows.append((case, res.intent.value if res else UNDECIDED, "heuristic" if res else UNDECIDED))
    return rows


async def classify_full(router: IntentRouter, cases: list[dict]) -> list[tuple[dict, str, str]]:
    rows = []
    for case in cases:
        res = await router.aclassify(case["query"])
        rows.append((case, res.intent.value, res.source))
    return rows


def evaluate(rows: list[tuple[dict, str, str]]) -> dict:
    decided = [(c, got) for c, got, m in rows if m == "heuristic"]
    correct_decided = sum(got == c["expected"] for c, got in decided)
    correct_all = sum(got == c["expected"] for c, got, _ in rows)

    by_tag: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    confusion: Counter[tuple[str, str]] = Counter()
    failures: list[str] = []
    for case, got, method in rows:
        stats = by_tag[case["tag"]]
        stats[1] += 1
        if got == case["expected"]:
            stats[0] += 1
            continue
        confusion[(case["expected"], got)] += 1
        failures.append(f"{case['tag']:<28} {case['query']!r} → {got} (expected {case['expected']}, {method})")

    return {
        "total": len(rows),
        "coverage": len(decided) / len(rows),
        "precision": correct_decided / len(decided) if decided else 0.0,
        "accuracy": correct_all / len(rows),
        "methods": Counter(m for _, _, m in rows),
        "by_tag": dict(by_tag),
        "confusion": confusion,
        "failures": failures,
    }


def report(name: str, res: dict) -> None:
    print(f"\n== {name} ({res['total']} cases) ==")
    print(
        f"heuristic coverage: {res['coverage']:.1%}   heuristic precision: {res['precision']:.1%}   "
        f"accuracy: {res['accuracy']:.1%}"
    )
    print("decided by: " + ", ".join(f"{m}={n}" for m, n in sorted(res["methods"].items())))

    print("\nby tag (correct/total):")
    for tag, (ok, n) in sorted(res["by_tag"].items()):
        print(f"  {tag:<28} {ok}/{n}")

    if res["confusion"]:
        print("\nconfusion (expected → got):")
        for (exp, got), n in res["confusion"].most_common():
            print(f"  {exp:<16} → {got:<16} {n}")

    if res["failures"]:
        print("\nfailures:")
        for f in res["failures"]:
            print("  " + f)


def build_llm():
    from rag_service.agent import _PROVIDERS
    from rag_service.config import settings

    return _PROVIDERS[settings.llm_provider]()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--llm", action="store_true", help="run the LLM fallback for undecided cases")
    args = parser.parse_args()

    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    if args.llm:
        llm = build_llm()
        if llm is None:
            raise SystemExit("No LLM configured (check LLM_PROVIDER and its API key in .env).")
        report("IntentRouter heuristics + LLM", evaluate(asyncio.run(classify_full(IntentRouter(llm), cases))))
    else:
        report("IntentRouter heuristics", evaluate(classify_heuristics(IntentRouter(), cases)))


if __name__ == "__main__":
    main()
