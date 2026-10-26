"""Polarity set: does the user want the change to happen? Measured only, never tuned on.

    .venv/bin/python -m evals.router.polarity                  # the set the rules were written against
    .venv/bin/python -m evals.router.polarity --set holdout    # written after, measured once, never tuned on

polarity.jsonl was written before the polarity phase (P2) existed: declines, hypotheticals and reports must
never be written or previewed; an affirmed change must reach a write (at once or as a preview). Each message
runs as written and without diacritics. P2 is also checked on its own, so a miss names its phase.
"""
import asyncio
import json
import sys
from pathlib import Path

from evals.router.holdout import _router, write_outcome
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.understanding import understand

POLARITY = Path(__file__).parent / "polarity.jsonl"
HOLDOUT = Path(__file__).parent / "polarity_holdout.jsonl"


async def run(path: Path = POLARITY) -> dict:
    router = _router(False, None)
    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    total = {"n": 0, "written_when_not_asked": 0, "missed_change": 0, "p2_wrong": 0}
    fails = []
    for row in rows:
        for text in dict.fromkeys((row["text"], fold(row["text"]))):
            got, why = await write_outcome(router, text)
            p2 = getattr(understand(text), "polarity", None)
            total["n"] += 1
            bad = row["write"] == "no" and got != "none"
            missed = row["write"] == "any" and got == "none"
            p2_wrong = p2 is not None and p2 != row["polarity"]
            total["written_when_not_asked"] += bad
            total["missed_change"] += missed
            total["p2_wrong"] += p2_wrong
            if bad or missed or p2_wrong:
                kind = "WRITTEN" if bad else "MISSED" if missed else "P2"
                fails.append(f"  {kind:8} want={row['polarity']:12} p2={p2} write={got:7} | {text!r} | {why}")
    return {"total": total, "fails": fails}


def main(argv: list[str]) -> int:
    report = asyncio.run(run(HOLDOUT if "holdout" in argv else POLARITY))
    print("TOTAL", report["total"])
    print("\n".join(report["fails"]))
    return 1 if report["total"]["written_when_not_asked"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
