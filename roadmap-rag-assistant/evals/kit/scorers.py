"""Per-sample scorers.

Each scorer returns a result dict with at least "passed", or None when the sample has nothing
for it to check. A domain can add its own by decorating a function with @scorer and listing
its name in meta.json "scorers".
"""

from __future__ import annotations

from typing import Callable

from evals.kit import judge
from evals.kit.target import Answer, Target

ScorerFn = Callable[[dict, Target, int, "str | None"], "dict | None"]

# name -> (capability the target must have, scorer)
SCORERS: dict[str, tuple[str, ScorerFn]] = {}


def scorer(name: str, capability: str):
    def register(fn: ScorerFn) -> ScorerFn:
        SCORERS[name] = (capability, fn)
        return fn

    return register


@scorer("retrieval", "retrieve")
def score_retrieval(sample: dict, target: Target, k: int, run_as: str | None) -> dict | None:
    contexts = sample["expected"].get("contexts")
    if contexts is None:
        return None
    got = [hit.section_id for hit in target.retrieve(sample["input"], k, run_as)[:k]]
    if not contexts:
        # Nothing in the corpus answers it, so retrieval must come back empty
        return {"passed": not got, "kind": "off_topic", "got": got[:3]}
    required = {c["section_id"] for c in contexts if c.get("required")}
    if required:
        # Multi-section question: every required section must be retrieved; rank is the last one found
        found = required <= set(got)
        rank = max(i for i, section in enumerate(got, 1) if section in required) if found else None
    else:
        # Any listed context counts as a hit: the dataset lists every acceptable section
        wanted = {c["section_id"] for c in contexts}
        rank = next((i for i, section in enumerate(got, 1) if section in wanted), None)
    return {"passed": rank is not None, "kind": "on_topic", "rank": rank, "got": got[:3]}


@scorer("route", "route")
def score_route(sample: dict, target: Target, k: int, run_as: str | None) -> dict | None:
    expected = sample["expected"]
    if "behavior" not in expected and "route" not in expected:
        return None
    got = target.route(sample["input"], run_as)
    passed = expected.get("behavior", got.behavior) == got.behavior and (
        "route" not in expected or sorted(expected["route"]) == sorted(got.route)
    )
    return {"passed": passed, "got": {"behavior": got.behavior, "route": got.route}}


@scorer("answer", "answer")
def score_answer(sample: dict, target: Target, k: int, run_as: str | None) -> dict | None:
    expected = sample["expected"]
    got = target.answer(sample["input"], sample.get("history", []), run_as)
    text = got.text.casefold()
    checks: dict[str, bool] = {}
    if "behavior" in expected:
        checks["behavior"] = got.behavior == expected["behavior"]
    if expected.get("facts"):
        # Substring match is a cheap baseline; swap in a judge scorer when wording varies a lot
        checks["facts"] = all(fact.casefold() in text for fact in expected["facts"])
    if expected.get("forbidden"):
        # Things the answer must never say: another thread's memory, masked PII, a wrong earlier claim
        checks["forbidden"] = not any(term.casefold() in text for term in expected["forbidden"])
    required = {c["section_id"] for c in expected.get("contexts", []) if c.get("required", True)}
    if required:
        checks["citations"] = required <= set(got.citations)
    if expected.get("contexts") == []:
        checks["no_citations"] = not got.citations
    if not checks:
        return None
    return {"passed": all(checks.values()), "checks": checks, "got": got.text[:200]}


@scorer("judge", "judge")
def score_judge(sample: dict, target: Target, k: int, run_as: str | None) -> dict | None:
    """LLM judge on the live answer, plus judge-vs-human agreement when the sample carries a hand label."""
    facts = sample["expected"].get("facts")
    got = target.answer(sample["input"], sample.get("history", []), run_as)
    row = {**judge.evaluate(sample, got, target), "got": got.text[:200]}
    if facts:
        # Same substring check as score_answer, reported next to the judge's semantic match as a cheap baseline
        row["baseline"] = {"facts": all(fact.casefold() in got.text.casefold() for fact in facts)}
    label = sample["metadata"].get("judge_label")
    if label:
        # The label grades a frozen answer, so agreement does not move when the live answer changes
        verdict = judge.evaluate(sample, Answer(**label["answer"]), target)["passed"]
        row["calibration"] = {"human": label["passed"], "judge": verdict, "agree": verdict == label["passed"]}
    return row
