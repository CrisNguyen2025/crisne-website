"""Retrieval eval for the Roadmap Assistant on a fixed corpus (prisma/dev.db, read only).

Run from roadmap-rag-assistant/:
    .venv/bin/python -m tests.eval_retrieval            # FTS + hybrid (needs GEMINI_API_KEY)
    .venv/bin/python -m tests.eval_retrieval --fts-only

Metrics over on-topic cases: hit@K (any expected doc in top K) and MRR@K.
Off-topic cases (expected = []) pass only when nothing is returned.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from rag_service.adapters.sqlite_adapter import SqliteAdapter
from rag_service.domains.roadmap.retrieval.ingestion import DatabaseIngestionWorker
from rag_service.core.retrieval.hybrid import HybridVectorStore
from rag_service.domains.roadmap.retrieval.engine import roadmap_store

CASES_PATH = Path(__file__).parent / "data" / "retrieval_eval_cases.json"
DEV_DB = Path(__file__).resolve().parents[2] / "prisma" / "dev.db"
K = 5


def evaluate(store: HybridVectorStore, cases: list[dict], search) -> dict:
    hits = rr_sum = on_topic = off_topic = off_rejected = 0
    failures: list[str] = []
    for case in cases:
        results = search(store, case["query"])[:K]
        titles = [doc.title for doc, _ in results]
        expected = set(case["expected"])
        if not expected:
            off_topic += 1
            if not results:
                off_rejected += 1
            else:
                failures.append(f"OFF  {case['query']!r} → {titles[:3]}")
            continue
        on_topic += 1
        rank = next((i for i, t in enumerate(titles, 1) if t in expected), None)
        if rank:
            hits += 1
            rr_sum += 1 / rank
        else:
            failures.append(f"MISS {case['query']!r} → {titles[:3]}")
    return {
        f"hit@{K}": hits / on_topic,
        f"mrr@{K}": rr_sum / on_topic,
        "off_topic_rejected": f"{off_rejected}/{off_topic}",
        "failures": failures,
    }


def report(name: str, res: dict) -> None:
    print(f"\n== {name} ==")
    print(f"hit@{K}: {res[f'hit@{K}']:.1%}   mrr@{K}: {res[f'mrr@{K}']:.3f}   off-topic rejected: {res['off_topic_rejected']}")
    for f in res["failures"]:
        print("  " + f)


async def build_store(fts_only: bool) -> HybridVectorStore:
    docs = await DatabaseIngestionWorker(adapter=SqliteAdapter(str(DEV_DB))).ingest_all()
    store = roadmap_store()
    if fts_only:
        store._get_embedder = lambda: None  # type: ignore[method-assign]
    store.index_documents(docs)
    print(f"Indexed {len(docs)} docs from {DEV_DB.name} ({len(store._vectors)} with vectors)")
    return store


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fts-only", action="store_true")
    args = parser.parse_args()

    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    store = asyncio.run(build_store(args.fts_only))

    report("FTS (BM25)", evaluate(store, cases, lambda s, q: s.search_fts(q, limit=K)))
    if not args.fts_only:
        report("Vector", evaluate(store, cases, lambda s, q: s.search_vector(q, limit=K)))
        report("Hybrid (RRF)", evaluate(store, cases, lambda s, q: s.hybrid_search(q, limit=K)))


if __name__ == "__main__":
    main()
