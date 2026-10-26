"""Write-safety held-out set: does a message that must not change data ever get written?

    .venv/bin/python -m evals.router.holdout            # heuristics only, no network
    .venv/bin/python -m evals.router.holdout --llm      # + the LLM router for undecided messages (calls LLM_PROVIDER)

holdout.jsonl is measured, never tuned on: its messages were written apart from the probes the rules were
fixed against. Each line: text, write ("no" | "now" | "any"), optional history and page context.

The message goes through the agent's decision order up to the write decision, and nothing runs:
  slash command -> bulk import -> several requests -> router -> write gate.
Write outcome per message: "now" (runs at once), "preview" (a card the user confirms), "none".

  write_now_violations      write="no" but it would run at once    (must be 0)
  write_preview_violations  write="no" but a preview card is shown (the user can still cancel)
  missed_writes             write="now" but nothing would be written
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).parent
HOLDOUT = ROOT / "holdout.jsonl"


def _router(use_llm: bool):
    """The router and System 2 model the chat uses (LLM_MODEL_ROUTER when set), or neither offline."""
    from rag_service.domains.roadmap.router.intent_router import IntentRouter

    llm = None
    if use_llm:
        from rag_service.domains.roadmap.agent import build_agent

        llm = build_agent().router_llm
    router = IntentRouter(llm_model=llm)
    router.verifier_llm = llm
    return router


_CATALOG = None


def _catalog():
    """The roadmap catalog of the eval corpus (prisma/dev.db), as the chat builds it from its index."""
    global _CATALOG
    if _CATALOG is None:
        from evals.target import RoadmapTarget
        from rag_service.domains.roadmap.router.target_grounding import Catalog

        from concurrent.futures import ThreadPoolExecutor

        # _load runs its own event loop: keep it off the caller's
        with ThreadPoolExecutor(1) as pool:
            docs = pool.submit(lambda: RoadmapTarget(mode="fts")._load()[0]).result()
        _CATALOG = Catalog.from_documents(docs)
    return _CATALOG


async def write_outcome(router, text: str, history=(), context=None) -> tuple[str, str]:
    """The agent's decision order up to the write decision; nothing runs. Returns (now | preview | none, why)."""
    from rag_service.core.guards import is_sensitive_request
    from rag_service.domains.roadmap.commands import RoadmapCommands
    from rag_service.domains.roadmap.router.policy import slash_command
    from rag_service.domains.roadmap.router.route_decision import decide_route
    from rag_service.domains.roadmap.router.understanding import instruction_part
    from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese

    content = normalize_vietnamese(text.strip())
    lower = content.lower()
    if is_sensitive_request(content, instruction=instruction_part(content)):
        return "none", "sensitive"
    if slash_command(lower) == "goal":
        return "now", "/goal"
    if slash_command(lower) == "plan":
        return "none", "/plan"
    if RoadmapCommands.bulk_import_applies(None, text.strip(), lower, context):
        return "now", "bulk import"
    if router.mixed_intent_steps(content):
        return "none", "mixed"
    outcome = await decide_route(
        router, content, list(history),
        verifier_llm=getattr(router, "verifier_llm", None), catalog=_catalog(), page_context=context,
    )
    why = (
        f"{outcome.method} row={outcome.decision.row} intent={outcome.intent_res.intent.value} "
        f"gate={outcome.gate.mode}" + (f" plan={outcome.plan.outcome}:{outcome.plan.reason}" if outcome.plan else "")
    )
    return {"run": "now", "preview": "preview"}.get(outcome.write, "none"), why


async def run(use_llm: bool) -> dict:
    router = _router(use_llm)
    rows = [json.loads(line) for line in HOLDOUT.read_text(encoding="utf-8").splitlines() if line.strip()]
    metrics = {"n": len(rows), "write_now_violations": 0, "write_preview_violations": 0, "missed_writes": 0}
    lines = []
    for row in rows:
        history = [SimpleNamespace(**h) for h in row.get("history", [])]
        got, why = await write_outcome(router, row["text"], history, row.get("context"))
        want = row["write"]
        flag = ""
        if want == "no" and got == "now":
            metrics["write_now_violations"] += 1
            flag = "WRITE_NOW"
        elif want == "no" and got == "preview":
            metrics["write_preview_violations"] += 1
            flag = "preview"
        elif want == "now" and got == "none":
            metrics["missed_writes"] += 1
            flag = "MISSED"
        lines.append(f"{flag:9} want={want:4} got={got:7} | {row['text'][:70]!r} | {why}")
    return {"metrics": metrics, "lines": lines}


def main(argv: list[str]) -> int:
    report = asyncio.run(run("--llm" in argv))
    for line in report["lines"]:
        if "-v" in argv or line[:9].strip():
            print(line)
    print(json.dumps(report["metrics"], indent=2))
    return 1 if report["metrics"]["write_now_violations"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
