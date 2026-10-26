"""Stress set: confusing messages x noise variants through the agent's decision order (nothing runs).

    .venv/bin/python -m evals.router.confuse            # heuristics only, no network
    .venv/bin/python -m evals.router.confuse --llm      # + System 2 and the LLM router (calls LLM_PROVIDER)

stress_confuse.jsonl holds base messages by confusion type (entity word in another sense, CUD verb in a
technical question, negation, reported speech, sarcasm, code, injection in a name…); each is run as written
and with noise: no diacritics, a greeting, an emoji, a typo, all caps. Measured, never tuned on.
"""
import asyncio
import collections
import json
import random
import re
import sys

from pathlib import Path

from evals.router.holdout import _router, write_outcome
from rag_service.domains.roadmap.retrieval.relevance import fold

random.seed(7)


def typo(text: str) -> str:
    words = text.split()
    i = max(range(len(words)), key=lambda k: len(words[k]))
    w = words[i]
    if len(w) > 4 and not w.startswith(("`", '"')):
        j = len(w) // 2
        words[i] = w[:j - 1] + w[j] + w[j - 1] + w[j + 1:]
    return " ".join(words)


VARIANTS = {
    "orig": lambda t: t,
    "no-diacritics": lambda t: fold(t),
    "greeting": lambda t: "ê bạn ơi, " + t,
    "emoji": lambda t: t + " nha 😅",
    "typo": typo,
    "upper": lambda t: t.upper(),
}


def branch(write: str, why: str) -> str:
    if why == "sensitive":
        return "S"
    if why == "mixed":
        return "MIX"
    if why in ("/plan", "/goal"):
        return "P"
    if why == "bulk import":
        return "C"
    m = re.search(r"intent=(\w+).*gate=(\w+)", why)
    intent, gate = m.group(1), m.group(2)
    if gate == "deny":
        return "D"
    if gate in ("allow", "confirm"):
        return "C"
    return {"knowledge_query": "K", "roadmap_cud": "C", "plan_goal": "P", "chitchat": "T",
            "out_of_scope": "O", "unclear": "U"}.get(intent, intent)


STRESS = Path(__file__).parent / "stress_confuse.jsonl"


async def run(use_llm: bool, path: Path = STRESS) -> dict:
    router = _router(use_llm)
    base = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    stats = collections.defaultdict(lambda: collections.Counter())
    fails = []
    for row in base:
        for vname, fn in VARIANTS.items():
            text = fn(row["text"])
            got_write, why = await write_outcome(router, text)
            b = branch(got_write, why)
            s = stats[row["cat"]]
            s["n"] += 1
            bad_write = row["write"] == "no" and got_write == "now"
            missed = row["write"] in ("now", "any") and got_write == "none" and b not in ("D",) and "C" in row["want"]
            wrong_branch = b not in row["want"].split("|")
            s["write_now_violation"] += bad_write
            s["preview_violation"] += row["write"] == "no" and got_write == "preview"
            s["missed_write"] += missed
            s["wrong_branch"] += wrong_branch
            stats["_variant_" + vname]["n"] += 1
            stats["_variant_" + vname]["wrong_branch"] += wrong_branch
            stats["_variant_" + vname]["write_now_violation"] += bad_write
            if bad_write or missed or wrong_branch:
                kind = "WRITE_NOW" if bad_write else "MISSED" if missed else "branch"
                fails.append((kind, row["cat"], vname, row["want"], b, got_write, text, why))
    total = collections.Counter()
    for k, v in stats.items():
        if not k.startswith("_"):
            total.update(v)
    return {"total": dict(total), "stats": stats, "fails": fails}


def main(argv) -> int:
    report = asyncio.run(run("--llm" in argv))
    total, stats, fails = report["total"], report["stats"], report["fails"]
    print("TOTAL", total)
    print("\nby category:")
    for k in sorted(k for k in stats if not k.startswith("_")):
        v = stats[k]
        print(f"  {k:28} n={v['n']:3} wrong_branch={v['wrong_branch']:3} write_now={v['write_now_violation']:2} preview={v['preview_violation']:2} missed={v['missed_write']:2}")
    print("\nby noise variant:")
    for k in sorted(k for k in stats if k.startswith("_variant_")):
        v = stats[k]
        print(f"  {k[9:]:14} n={v['n']:3} wrong_branch={v['wrong_branch']:3} write_now={v['write_now_violation']:2}")
    print("\nfailures:")
    for f in sorted(fails, key=lambda x: (x[0] != "WRITE_NOW", x[0] != "MISSED", x[1])):
        print(f"  {f[0]:9} [{f[1]}/{f[2]}] want={f[3]} got={f[4]}/{f[5]} | {f[6][:80]!r} | {f[7]}")


    return 1 if total.get("write_now_violation") or total.get("missed_write") else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
