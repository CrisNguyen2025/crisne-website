"""Measure three retrieval risks on the eval datasets; measured only, nothing is tuned or written.

    .venv/bin/python -m evals.retrieval_probe            # needs GEMINI_API_KEY (query embeddings)
    .venv/bin/python -m evals.retrieval_probe --verbose  # also lists every sample behind each count

Retrieval is replayed as /chat runs a first turn (no history, so no query plan; sources.answer_from_sources):
hybrid search over a pool, cut to 4, then the on-topic gate (filter_on_topic). Samples come from
datasets/public/roadmap and datasets/_answer, deduplicated by input.

1. Gate drops: the hybrid search found documents but the gate kept none. "wrong drop" when an expected
   document was among them; a sample with no expected context (off-topic) dropped to nothing is the gate working.
2. Comparisons (tag "comparison", two or more required contexts): which side is missing after the gate,
   and where it was lost: never retrieved (R2), cut from the pool to the top 4, or dropped by the gate (R5).
3. Rerank gate misses: top-1 is not an expected document, an expected one is in the rerank pool (so rerank
   could fix it), but the top1 - top2 cosine gap is at or above the threshold, so _rerank_needed skips it.
   Replayed with the rerank pool as if RAG_RERANK=true; split as scope_tune does (even ids tune, odd holdout).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from evals.kit.target import TargetUnavailable
from evals.target import RoadmapTarget
from rag_service.config import settings
from rag_service.core.retrieval.rerank import RERANK_POOL
from rag_service.domains.roadmap.retrieval.relevance import corpus_vocabulary, filter_on_topic
from rag_service.domains.roadmap.router.scope import load_thresholds

ROOT = Path(__file__).resolve().parents[1]
DATASETS = (ROOT / "evals/datasets/public/roadmap/samples.jsonl", ROOT / "evals/datasets/_answer/samples.jsonl")
# Documents the answer is built from (sources.answer_from_sources)
ANSWER_LIMIT = 4


def load_samples() -> list[dict]:
    samples, seen = [], set()
    for path in DATASETS:
        for line in path.read_text(encoding="utf-8").splitlines():
            sample = json.loads(line)
            text = sample["input"].strip()
            if sample.get("metadata", {}).get("status", "active") != "active" or text in seen:
                continue
            seen.add(text)
            samples.append(sample)
    return samples


def rerank_gap() -> float:
    """The threshold _rerank_needed uses (agent._rerank_gap), read without importing the agent."""
    if settings.rag_rerank_gap.strip().lower() != "auto":
        return float(settings.rag_rerank_gap)
    return float(((load_thresholds() or {}).get("rerank") or {}).get("rerank_below_gap", 0.0))


def split_of(sample: dict) -> str:
    """scope_tune tuned the rerank gap on the public roadmap samples only; others are "-"."""
    prefix, _, number = sample["id"].rpartition("-")
    if prefix != "roadmap" or not number.isdigit():
        return "-"
    return "tune" if int(number) % 2 == 0 else "holdout"


def main(argv: list[str]) -> int:
    verbose = "--verbose" in argv
    target = RoadmapTarget(mode="hybrid")
    store = target._get_store()
    if store._get_embedder() is None:
        sys.exit("retrieval_probe needs query embeddings (GEMINI_API_KEY / GEMINI_API_KEYS)")
    knowledge, documents = target._load()
    vocab = corpus_vocabulary(knowledge)
    section_of = {d["source_id"]: d["doc_id"] for d in documents}
    pool = RERANK_POOL if settings.rag_rerank else ANSWER_LIMIT
    gap_threshold = rerank_gap()

    gate_wrong, gate_right, gate_off_kept = [], [], []
    compare_ok, compare_missing = [], []
    rerank_rows, unavailable = [], []

    for sample in load_samples():
        text = sample["input"]
        contexts = sample["expected"].get("contexts", [])
        wanted = {c["section_id"] for c in contexts}
        if store._similarities(text) is None:
            unavailable.append(text)  # quota: this sample would measure FTS-only retrieval
            continue

        # 1 + 2: the first turn as /chat runs it
        found = store.hybrid_search(text, limit=pool)
        before = found[:ANSWER_LIMIT]
        after = filter_on_topic(text, before, vocab)
        ids = lambda matches: [section_of[doc.id] for doc, _ in matches]
        if before and not after:
            lost = wanted & set(ids(before))
            row = f"{sample['id']}: {text!r} -> {ids(before)}"
            (gate_wrong if lost else gate_right).append(row if lost else row + ("" if wanted else " (off-topic)"))
        if not wanted and after:
            gate_off_kept.append(f"{sample['id']}: {text!r} -> {ids(after)}")

        required = {c["section_id"] for c in contexts if c.get("required")}
        if "comparison" in sample.get("metadata", {}).get("tags", []) and len(required) >= 2:
            missing = required - set(ids(after))
            if not missing:
                compare_ok.append(sample["id"])
            else:
                wide = set(ids(store.hybrid_search(text, limit=RERANK_POOL)))
                where = {
                    s: "R5 gate" if s in ids(before) else "cut to top 4" if s in ids(found) or s in wide else "not retrieved"
                    for s in sorted(missing)
                }
                compare_missing.append(f"{sample['id']}: {text!r}\n      " + "\n      ".join(
                    f"{s}: {w}" for s, w in where.items()))

        # 3: the rerank decision, as if RAG_RERANK=true
        if wanted:
            matches = store.hybrid_search(text, limit=RERANK_POOL)
            if len(matches) < 2:
                continue
            sims = store._similarities(text) or {}
            top = sorted((sims.get(doc.id, 0.0) for doc, _ in matches), reverse=True)
            gap = top[0] - top[1]
            first_right = section_of[matches[0][0].id] in wanted
            fixable = bool(wanted & set(ids(matches)))
            rerank_rows.append((split_of(sample), sample["id"], text, first_right, fixable, gap))

    print(f"Samples: {len(load_samples())}  embedding unavailable: {len(unavailable)}  "
          f"pool: {pool} (RAG_RERANK={settings.rag_rerank})  rerank gap: {gap_threshold}")

    print(f"\n== 1. Gate dropped everything the search found ==")
    print(f"wrong drop (an expected document was dropped): {len(gate_wrong)}")
    print(f"right drop (nothing expected among them): {len(gate_right)}")
    print(f"off-topic samples the gate let through: {len(gate_off_kept)}")
    for row in gate_wrong:
        print("  WRONG " + row)
    if verbose:
        for row in gate_right:
            print("  RIGHT " + row)
    for row in gate_off_kept:
        print("  KEPT  " + row)

    print(f"\n== 2. Comparisons: every side's document after the gate ==")
    print(f"all sides: {len(compare_ok)}   a side missing: {len(compare_missing)}")
    for row in compare_missing:
        print("  " + row)

    print(f"\n== 3. Rerank gate (pool {RERANK_POOL}, rerank when gap < {gap_threshold}) ==")
    for split in ("tune", "holdout", "-"):
        rows = [r for r in rerank_rows if r[0] == split]
        if not rows:
            continue
        wrong = [r for r in rows if not r[3]]
        fixable = [r for r in wrong if r[4]]
        missed = [r for r in fixable if r[5] >= gap_threshold]
        share = sum(r[5] < gap_threshold for r in rows) / len(rows)
        print(f"{split}: n={len(rows)}  top-1 wrong: {len(wrong)}  fixable by rerank: {len(fixable)}  "
              f"skipped by the gap gate: {len(missed)}  rerank share: {share:.0%}")
        for _, sid, text, _, _, gap in missed:
            print(f"  MISS {sid}: {text!r} gap={gap:.4f}")
        if verbose:
            for _, sid, text, _, fix, gap in wrong:
                if (sid, text) not in {(m[1], m[2]) for m in missed}:
                    print(f"  wrong {sid}: {text!r} gap={gap:.4f} {'reranked' if fix else 'not in pool'}")

    if unavailable:
        print(f"\nNot measured (query embedding failed): {len(unavailable)}")
        for text in unavailable:
            print(f"  {text!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
