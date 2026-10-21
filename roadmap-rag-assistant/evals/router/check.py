"""router-check: one command to recheck the intent router against its contract.

    .venv/bin/python -m evals router-check            # compare with the committed baseline; exit 1 on any regression
    .venv/bin/python -m evals router-check --accept   # after reviewing the printed diff: store the new baseline

Contract (all files in evals/router/, committed):
- stress.jsonl     generated noisy requests with known clause intents (generate_stress.py)
- baseline.json    metrics the router must not fall below (a ratchet: improvements are accepted, regressions fail)
- decisions.jsonl  the router's decision for every message; any change is printed for a human to review

Held-out sets (real messages, not generated): evals/datasets/_routing/samples.jsonl and
tests/data/intent_eval_cases.json. The router is run in the agent's order: sensitive guard, plain topic listing,
several requests in one message, then the heuristic router. No LLM, no network, no database.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
REPO = ROOT.parent.parent
STRESS = ROOT / "stress.jsonl"
BASELINE = ROOT / "baseline.json"
DECISIONS = ROOT / "decisions.jsonl"
ROUTING = REPO / "evals" / "datasets" / "_routing" / "samples.jsonl"
INTENT_CASES = REPO / "tests" / "data" / "intent_eval_cases.json"

CUD = "roadmap_cud"
NO_WRITE = "no_write"
# Lower is better for these; held-out "correct" must not drop
LOWER_IS_BETTER = ("stress.wrong_write", "stress.dropped", "stress.misroute")


def decide(router, text: str) -> dict:
    """The decision the agent would take before any LLM call, as plain fields for the snapshot."""
    from rag_service.domains.roadmap.router.grounding import is_sensitive_request
    from rag_service.domains.roadmap.router.understanding import is_plain_listing

    if is_sensitive_request(text):
        return {"route": "refuse"}
    if is_plain_listing(text):
        return {"route": "list_topics"}
    if router.has_mixed_intents(text):
        return {"route": "mixed"}
    return router.decide(text).snapshot()


def stress_outcome(expected: list[str], route: str, write: str) -> str:
    """wrong_write: a change would run although no clause asks for one; dropped: one of several requests is lost."""
    writes = route == CUD and write != "deny"
    if len(expected) > 1:
        if route == "mixed" or (len(set(expected)) == 1 and CUD not in expected and route == expected[0]):
            return "ok"
        return "wrong_write" if writes and CUD not in expected else "dropped"
    want = expected[0]
    if writes and want != CUD:
        return "wrong_write"
    if route in ("undecided", "mixed") or (route == CUD and write == "deny"):
        return "undecided"
    if want == NO_WRITE or route == want:
        return "ok"
    return "misroute"


def heldout_want(sample: dict) -> str:
    exp = sample["expected"]
    if exp.get("behavior") == "refuse":
        return "refuse"
    if exp.get("behavior") == "clarify":
        return "mixed"
    return exp["route"][0] if exp.get("route") else "undecided"


def run() -> tuple[dict, dict, dict]:
    from rag_service.domains.roadmap.router.intent_router import IntentRouter

    router = IntentRouter()
    metrics: dict[str, int] = Counter()
    breakdown: dict[str, Counter] = defaultdict(Counter)
    decisions: dict[str, dict] = {}
    failures: dict[str, list] = defaultdict(list)

    for line in STRESS.read_text(encoding="utf-8").splitlines():
        s = json.loads(line)
        d = decisions.setdefault(s["input"], decide(router, s["input"]))
        outcome = stress_outcome(s["expected"]["clauses"], d["route"], d.get("write", "none"))
        metrics[f"stress.{outcome}"] += 1
        breakdown[s["family"]][outcome] += 1
        breakdown["~" + s["noise"]][outcome] += 1
        if outcome in ("wrong_write", "dropped", "misroute"):
            failures[outcome].append((s["id"], s["input"], d["route"]))

    for line in ROUTING.read_text(encoding="utf-8").splitlines():
        s = json.loads(line)
        if s["metadata"].get("status") != "active":
            continue
        d = decisions.setdefault(s["input"], decide(router, s["input"]))
        hit = d["route"] == heldout_want(s) or (heldout_want(s) == "knowledge_query" and d["route"] == "list_topics")
        metrics["heldout.routing.correct" if hit else "heldout.routing.wrong"] += 1
        if not hit:
            failures["heldout"].append((s["id"], s["input"], f"{d['route']} (want {heldout_want(s)})"))

    for case in json.loads(INTENT_CASES.read_text(encoding="utf-8")):
        text, want = case["message"], case["expected"] or "undecided"
        d = decisions.setdefault(text, decide(router, text))
        got = {"refuse": "sensitive"}.get(d["route"], d["route"])
        hit = got == want or (want == "knowledge_query" and got == "list_topics")
        metrics["heldout.intent_cases.correct" if hit else "heldout.intent_cases.wrong"] += 1
        if not hit:
            failures["heldout"].append(("intent_cases", text, f"{got} (want {want})"))

    for key in ("stress.wrong_write", "stress.dropped", "stress.misroute", "stress.undecided", "stress.ok"):
        metrics.setdefault(key, 0)
    return dict(sorted(metrics.items())), {k: dict(v) for k, v in sorted(breakdown.items())}, {
        "decisions": decisions, "failures": failures,
    }


def _load_decisions() -> dict[str, dict]:
    if not DECISIONS.exists():
        return {}
    rows = [json.loads(line) for line in DECISIONS.read_text(encoding="utf-8").splitlines()]
    return {r["input"]: {k: v for k, v in r.items() if k != "input"} for r in rows}


def main(argv: list[str]) -> int:
    sys.path.insert(0, str(REPO))
    accept = "--accept" in argv
    metrics, breakdown, extra = run()
    decisions, failures = extra["decisions"], extra["failures"]

    print("── metrics ──")
    for k, v in metrics.items():
        print(f"  {k:32} {v}")
    print("── stress by family / noise (~) ──")
    for k, v in breakdown.items():
        bad = {o: n for o, n in v.items() if o in ("wrong_write", "dropped", "misroute")}
        if bad:
            print(f"  {k:24} {bad}")
    for kind in ("wrong_write", "dropped", "misroute", "heldout"):
        if failures.get(kind):
            print(f"── {kind} ({len(failures[kind])}, first 15) ──")
            for row in failures[kind][:15]:
                print("  ", *row)

    baseline = json.loads(BASELINE.read_text(encoding="utf-8")) if BASELINE.exists() else {}
    worse = []
    for k, old in baseline.items():
        new = metrics.get(k, 0)
        if (k in LOWER_IS_BETTER and new > old) or (k.endswith(".correct") and new < old):
            worse.append(f"{k}: {old} -> {new}")

    old_decisions = _load_decisions()
    changed = [(t, old_decisions[t], d) for t, d in decisions.items() if t in old_decisions and old_decisions[t] != d]
    added = [t for t in decisions if t not in old_decisions]
    removed = [t for t in old_decisions if t not in decisions]
    if changed:
        print(f"── decisions changed ({len(changed)}) ──")
        for text, old, new in changed[:40]:
            print(f"  {text!r}\n      {old}\n   -> {new}")
    if added or removed:
        print(f"── decisions added {len(added)}, removed {len(removed)} ──")

    if accept:
        BASELINE.write_text(json.dumps(metrics, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        with DECISIONS.open("w", encoding="utf-8") as f:
            for text in sorted(decisions):
                f.write(json.dumps({"input": text, **decisions[text]}, ensure_ascii=False) + "\n")
        print(f"accepted: baseline and {len(decisions)} decisions written")
        return 0

    if worse:
        print("REGRESSION:", "; ".join(worse))
    if changed or added or removed:
        print("Decisions differ from decisions.jsonl: review the diff above, then rerun with --accept")
    return 1 if worse or changed or added or removed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
