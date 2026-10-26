"""Pick the scope thresholds on the tune split; never on the holdout split.

    .venv/bin/python -m evals.scope_tune            # writes rag_service/.../scope_thresholds.json
    .venv/bin/python -m evals.scope_tune --dry-run  # prints them only

For each tune sample with a topic, the message is embedded and compared with the roadmap's documents
(scope_centroid.DomainCentroids). The signal that separates the three targets is `nearest` (best single
document). Thresholds are midpoints of the gaps between classes:

    roadmap_min  between the highest domain_gap and the lowest roadmap
    gap_min      between the highest external and the lowest domain_gap

and an uncertainty band of half the narrower gap around gap_min, where the router defers to the LLM.
If the classes overlap on the tune split the thresholds are placed so no external sample is admitted
(the costly error), and the overlap is reported.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "evals/datasets/_scope/samples.jsonl"
THRESHOLDS = ROOT / "rag_service/domains/roadmap/retrieval/scope_thresholds.json"


def tune_features() -> list[tuple[str, float]]:
    from evals.target import RoadmapTarget
    from rag_service.domains.roadmap.retrieval.scope_centroid import DomainCentroids
    from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese

    store = RoadmapTarget(mode="hybrid")._get_store()
    centroids = DomainCentroids.from_store(store)
    embedder = store._get_embedder()
    if centroids is None or embedder is None:
        sys.exit("scope_tune needs document embeddings (GEMINI_API_KEY / GEMINI_API_KEYS)")
    features = []
    for line in SAMPLES.read_text(encoding="utf-8").splitlines():
        sample = json.loads(line)
        target = sample["expected"]["target"]
        if "split-tune" not in sample["metadata"]["tags"] or target == "none":
            continue
        vec = embedder.embed_query(normalize_vietnamese(sample["input"]))
        features.append((target, centroids.signals(vec).nearest))
    return features


def pick(features: list[tuple[str, float]]) -> dict:
    by = {t: sorted(s for c, s in features if c == t) for t in ("roadmap", "domain_gap", "external")}
    top_external, low_gap = by["external"][-1], by["domain_gap"][0]
    top_gap, low_roadmap = by["domain_gap"][-1], by["roadmap"][0]
    # gap_min never admits a tune external sample, even when the classes overlap
    gap_min = (top_external + low_gap) / 2 if low_gap > top_external else top_external + 0.001
    roadmap_min = (top_gap + low_roadmap) / 2 if low_roadmap > top_gap else top_gap + 0.001
    margin = max(0.0, min(low_gap - top_external, low_roadmap - top_gap)) / 2
    return {
        "signal": "nearest",
        "roadmap_min": round(roadmap_min, 4),
        "gap_min": round(gap_min, 4),
        # Within gap_min ± band the target is not decided by embeddings: the LLM router reads the message
        "uncertain_band": round(margin, 4),
        "overlap": {
            "external_vs_gap": round(max(0.0, top_external - low_gap), 4),
            "gap_vs_roadmap": round(max(0.0, top_gap - low_roadmap), 4),
        },
        "tuned_on": {"split": "split-tune", "n": len(features), "date": date.today().isoformat(),
                     "embedding_model": "models/gemini-embedding-001"},
    }


def rerank_gaps(split: str) -> list[tuple[bool, float]]:
    """(right document ranked first, top1 - top2 cosine) for the public retrieval samples of a split.

    Split by sample number: even ids tune, odd ids holdout, fixed so the halves never move.
    """
    from evals.target import RoadmapTarget
    from rag_service.domains.roadmap.retrieval.relevance import corpus_vocabulary, filter_on_topic

    target = RoadmapTarget(mode="hybrid")
    store = target._get_store()
    knowledge, documents = target._load()
    vocab = corpus_vocabulary(knowledge)
    doc_ids = {d["source_id"]: d["doc_id"] for d in documents}
    rows = []
    path = ROOT / "evals/datasets/public/roadmap/samples.jsonl"
    for line in path.read_text(encoding="utf-8").splitlines():
        sample = json.loads(line)
        wanted = {c["section_id"] for c in sample["expected"].get("contexts", [])}
        number = int(sample["id"].rsplit("-", 1)[1])
        if not wanted or (number % 2 == 0) != (split == "tune"):
            continue
        matches = filter_on_topic(sample["input"], store.hybrid_search(sample["input"], 5), vocab)
        sims = store._similarities(sample["input"]) or {}
        top = sorted((sims.get(doc.id, 0.0) for doc, _ in matches), reverse=True)
        gap = top[0] - top[1] if len(top) > 1 else 1.0
        first = bool(matches) and doc_ids[matches[0][0].id] in wanted
        rows.append((first, round(gap, 4)))
    return rows


# A reranker call costs seconds: it should run for at most this share of questions
MAX_RERANK_SHARE = 0.4


def pick_rerank_gap(rows: list[tuple[bool, float]]) -> dict:
    """The gap below which a question is reranked: most misranked caught with rerank share <= MAX_RERANK_SHARE."""
    best = {"rerank_below_gap": 0.0, "misranked_caught": 0, "rerank_share": 0.0}
    for threshold in sorted({g for _, g in rows}):
        cut = threshold + 1e-4
        share = sum(g < cut for _, g in rows) / len(rows)
        caught = sum((not first) and g < cut for first, g in rows)
        if share <= MAX_RERANK_SHARE and caught > best["misranked_caught"]:
            best = {"rerank_below_gap": round(cut, 4), "misranked_caught": caught, "rerank_share": round(share, 3)}
    best["misranked"] = sum(not first for first, _ in rows)
    return best


def main(argv: list[str]) -> int:
    result = pick(tune_features())
    result["rerank"] = pick_rerank_gap(rerank_gaps("tune"))
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if "--dry-run" not in argv:
        THRESHOLDS.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"written: {THRESHOLDS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
