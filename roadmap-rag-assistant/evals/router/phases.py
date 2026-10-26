"""Phase sets: hand-labelled messages for one phase each, measured, never tuned on.

    .venv/bin/python -m evals.router.phases                     # polarity.jsonl (the P2 rules were written against it)
    .venv/bin/python -m evals.router.phases --set polarity      # same
    .venv/bin/python -m evals.router.phases --set polarity_holdout
    .venv/bin/python -m evals.router.phases --set target_holdout

Each row has a text, its expected write ("no": never written or previewed; "any": reaches a write) and hand
labels for the phases it tests: "polarity" (P2, older rows) or "phases" {"P1_act" | "P2_polarity" |
"P3_target": "a|b"}. Every message runs as written and without diacritics. A holdout set is written before
the change it measures and is never used to tune it.
"""
import asyncio
import json
import sys
from pathlib import Path

from evals.router.holdout import _router, write_outcome
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.understanding import understand
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese

HERE = Path(__file__).parent
SETS = ("polarity", "polarity_holdout", "target_holdout")


def labels_of(row: dict) -> dict:
    return row.get("phases") or {"P2_polarity": row["polarity"]}


async def run(path: Path) -> dict:
    router = _router(False, None)
    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    total = {"n": 0, "written_when_not_asked": 0, "missed_change": 0, "phase_wrong": 0}
    fails = []
    for row in rows:
        for text in dict.fromkeys((row["text"], fold(row["text"]))):
            got, why = await write_outcome(router, text)
            u = understand(normalize_vietnamese(text.strip()))
            out = {"P1_act": u.act.value, "P2_polarity": u.polarity, "P3_target": u.target.value}
            wrong = [f"{k}={out[k]}" for k, want in labels_of(row).items() if out[k] not in want.split("|")]
            total["n"] += 1
            bad = row["write"] == "no" and got != "none"
            missed = row["write"] == "any" and got == "none"
            total["written_when_not_asked"] += bad
            total["missed_change"] += missed
            total["phase_wrong"] += bool(wrong)
            if bad or missed or wrong:
                kind = "WRITTEN" if bad else "MISSED" if missed else "PHASE"
                fails.append(f"  {kind:8} {' '.join(wrong) or '-':22} write={got:7} | {text!r} | {why}")
    return {"total": total, "fails": fails}


def main(argv: list[str]) -> int:
    name = argv[argv.index("--set") + 1] if "--set" in argv else "polarity"
    assert name in SETS, f"--set one of {SETS}"
    report = asyncio.run(run(HERE / f"{name}.jsonl"))
    print("TOTAL", report["total"])
    print("\n".join(report["fails"]))
    return 1 if report["total"]["written_when_not_asked"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
