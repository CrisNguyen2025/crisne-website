"""Freezes the Langfuse golden set into the committed answer suite.

    python -m evals sync-dataset              # pull cris-ai-golden-set into datasets/_answer/samples.jsonl
    python -m evals sync-dataset --dry-run    # show what would change, write nothing

Items are reviewed and labeled in Langfuse (Annotation Queue -> "Add to Dataset"); CI gates on this frozen copy.
Merge rules:
- samples written by hand (no metadata.langfuse_item_id) are never touched;
- an item keeps the sample id it got on its first sync, so runs stay comparable with `evals diff`;
- an item whose expected_output is not a labeled `expected` object lands as needs_review (the runner skips it);
- an archived item, or one gone from the dataset, becomes deprecated: ids are never reused;
- a new item asking what a hand-written sample already asks (same question and history) is not added.
The file is only written when the merged datasets pass `validate`; meta.json then records when and from which
dataset (`langfuse_sync`), which the back-office golden set card shows. A sync that changes nothing writes nothing.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from evals.kit.corpus import FileCorpusSource, validate_references
from evals.kit.source import FileSource, load_schema, validate

ROOT = Path(__file__).parent
DATASETS = ROOT / "datasets"
CORPUS = ROOT / "corpus"
ANSWER_SUITE = "_answer"
DATASET_NAME = "cris-ai-golden-set"
ID_PREFIX = "answer"
EXPECTED_KEYS = set(load_schema("sample.schema.json")["properties"]["expected"]["properties"])


def _input(value) -> tuple[str, list[dict]]:
    """Question and earlier turns from an item input: a string, a roadmap trace input ({"message", ...})
    or a retrieval item ({"query", "history"})."""
    if isinstance(value, str):
        return value.strip(), []
    if not isinstance(value, dict):
        return "", []
    text = next((value[key] for key in ("message", "query", "input") if isinstance(value.get(key), str)), "")
    history = [
        {"role": turn["role"], "content": turn["content"]}
        for turn in value.get("history") or []
        if isinstance(turn, dict) and turn.get("role") in ("user", "assistant") and isinstance(turn.get("content"), str)
    ]
    return text.strip(), history


def item_fields(item) -> dict | None:
    """The sample an item becomes, without its id; None when the item has no question."""
    text, history = _input(item.input)
    if not text:
        return None
    expected = item.expected_output
    # The trace output copied by "Add to Dataset" is the bot's answer, not a label: keep it out of CI until labeled
    labeled = isinstance(expected, dict) and bool(expected) and set(expected) <= EXPECTED_KEYS
    meta = item.metadata if isinstance(item.metadata, dict) else {}
    if str(item.status).upper().endswith("ARCHIVED"):
        status = "deprecated"
    elif labeled:
        status = meta.get("status") or "active"
    else:
        status = "needs_review"
    metadata = {key: value for key, value in meta.items() if key != "status"}
    metadata.update(status=status, langfuse_item_id=item.id)
    if item.source_trace_id:
        metadata["source_trace_id"] = item.source_trace_id
    sample = {"input": text}
    if history:
        sample["history"] = history
    return {**sample, "expected": expected if labeled else {}, "metadata": metadata}


def _question_key(sample: dict) -> tuple[str, str]:
    return sample["input"].strip().casefold(), json.dumps(sample.get("history", []), ensure_ascii=False)


def merge(samples: list[dict], items: list) -> tuple[list[dict], dict[str, list[str]]]:
    """Applies the merge rules above. Returns the new sample list (file order kept) and the ids per change kind."""
    merged = list(samples)
    position = {sample["id"]: i for i, sample in enumerate(merged)}
    synced = {s["metadata"]["langfuse_item_id"]: s for s in samples if s["metadata"].get("langfuse_item_id")}
    numbers = [int(s["id"].rsplit("-", 1)[1]) for s in samples if re.fullmatch(rf"{ID_PREFIX}-\d+", s["id"])]
    next_number = max(numbers, default=0) + 1
    changes: dict[str, list[str]] = {"added": [], "updated": [], "deprecated": [], "skipped": [], "duplicate": []}
    # Questions already covered by hand: the same case twice would count twice in every metric
    hand_written = {_question_key(s) for s in samples if not s["metadata"].get("langfuse_item_id")}

    for item in items:
        fields = item_fields(item)
        if fields is None:
            changes["skipped"].append(item.id)
            continue
        old = synced.get(item.id)
        if old is None and _question_key(fields) in hand_written:
            changes["duplicate"].append(item.id)
            continue
        if old is None:
            sample = {"id": f"{ID_PREFIX}-{next_number:03d}", **fields}
            next_number += 1
            merged.append(sample)
            changes["added"].append(sample["id"])
        elif (sample := {"id": old["id"], **fields}) != old:
            merged[position[old["id"]]] = sample
            changes["updated"].append(sample["id"])

    fetched = {item.id for item in items}
    for item_id, old in synced.items():
        if item_id not in fetched and old["metadata"]["status"] != "deprecated":
            merged[position[old["id"]]] = {**old, "metadata": {**old["metadata"], "status": "deprecated"}}
            changes["deprecated"].append(old["id"])
    return merged, changes


def sync(
    items: list,
    *,
    dataset: str = DATASET_NAME,
    datasets_dir: Path = DATASETS,
    corpus_dir: Path = CORPUS,
    dry_run: bool = False,
) -> int:
    datasets = FileSource(datasets_dir).load()
    suite = next(ds for ds in datasets if ds.path == ANSWER_SUITE)
    merged, changes = merge(suite.samples, items)
    suite.samples = merged

    tags_file = datasets_dir / "tags.json"
    extra_tags = json.loads(tags_file.read_text(encoding="utf-8"))["tags"] if tags_file.exists() else []
    errors = validate(datasets, extra_tags) + validate_references(datasets, FileCorpusSource(corpus_dir).load())
    if errors:
        print("Not written: the synced samples do not validate. Fix the items in Langfuse, then sync again.")
        print("\n".join(errors))
        # Errors name the line (samples.jsonl:N); the fix happens on the Langfuse item each line comes from
        for line, sample in enumerate(merged, 1):
            where = f"{ANSWER_SUITE}/samples.jsonl:{line}:"
            if sample["id"] in changes["added"] + changes["updated"] and any(where in error for error in errors):
                print(f"  {where} {sample['id']} <- Langfuse item {sample['metadata']['langfuse_item_id']}")
        return 1

    for kind, ids in changes.items():
        print(f"{kind}: {len(ids)}" + (f"  {', '.join(ids)}" if ids else ""))
    review = sum(s["metadata"]["status"] == "needs_review" for s in merged)
    print(f"{len(merged)} samples in {ANSWER_SUITE} ({review} needs_review, not run until labeled)")
    if dry_run or not any(changes[kind] for kind in ("added", "updated", "deprecated")):
        return 0
    path = datasets_dir / ANSWER_SUITE / "samples.jsonl"
    path.write_text("".join(json.dumps(s, ensure_ascii=False) + "\n" for s in merged), encoding="utf-8")
    meta_path = datasets_dir / ANSWER_SUITE / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["langfuse_sync"] = {
        "dataset": dataset,
        "synced_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "samples": sum(bool(s["metadata"].get("langfuse_item_id")) and s["metadata"]["status"] == "active" for s in merged),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {path} and its meta.json: review the diff and commit it")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="evals sync-dataset", description=__doc__.split("\n")[0])
    parser.add_argument("--dataset", default=DATASET_NAME, help="Langfuse dataset name")
    parser.add_argument("--dry-run", action="store_true", help="print the changes without writing the file")
    args = parser.parse_args(argv)

    from dotenv import load_dotenv

    load_dotenv(ROOT.parent / ".env")
    if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
        print("sync-dataset needs LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY (and LANGFUSE_BASE_URL) in roadmap-rag-assistant/.env")
        return 1
    from langfuse import Langfuse

    try:
        items = Langfuse().get_dataset(args.dataset).items
    except Exception as exc:
        print(f"Could not fetch Langfuse dataset {args.dataset!r}: {type(exc).__name__}: {exc}")
        return 1
    return sync(items, dataset=args.dataset, dry_run=args.dry_run)
