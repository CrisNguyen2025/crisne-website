"""CLI for the eval kit. Domain-agnostic: the target, datasets and corpus all come from arguments.

    python -m evals.kit.runner validate --datasets DIR --corpus DIR
    python -m evals.kit.runner run --target module:factory --datasets DIR --corpus DIR --runs DIR [--opt key=value]
    python -m evals.kit.runner diff BASE_RUN HEAD_RUN

A domain usually wraps this with its own paths filled in (see evals/__main__.py).
Exit codes: 0 ok, 1 validation or threshold failure, 2 the target serves a corpus that differs from --corpus.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from evals.kit import metrics, report
from evals.kit.acl import AclGuard
from evals.kit.corpus import (
    Corpus, FileCorpusSource, content_hash, section_acl, validate_corpus, validate_references,
)
from evals.kit.scorers import SCORERS
from evals.kit.source import Dataset, FileSource, validate
from evals.kit.target import Target, TargetUnavailable

KIT_VERSION = "1.0.0"
DEFAULT_K = 5


def load_target(spec: str, options: dict[str, str]) -> Target:
    module_name, _, attr = spec.partition(":")
    return getattr(importlib.import_module(module_name), attr)(**options)


def load_valid(datasets_dir: Path, corpus_dir: Path) -> tuple[FileSource, list[Dataset], list[Corpus]]:
    source = FileSource(datasets_dir)
    datasets = source.load()
    corpora = FileCorpusSource(corpus_dir).load()
    tags_file = datasets_dir / "tags.json"
    extra_tags = json.loads(tags_file.read_text(encoding="utf-8"))["tags"] if tags_file.exists() else []
    errors = validate(datasets, extra_tags) + validate_corpus(corpora) + validate_references(datasets, corpora)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    return source, datasets, corpora


def check_corpus(target: Target, corpora: list[Corpus], allow_stale: bool) -> tuple[dict, bool]:
    """Returns the target's corpus fingerprint and whether what it serves differs from the static corpus."""
    fingerprint = target.corpus_fingerprint()
    expected = content_hash([doc for corpus in corpora for doc in corpus.documents])
    stale = fingerprint.get("sha256") != expected
    if stale and not allow_stale:
        print(
            "The target serves different content than the static corpus. Re-export the corpus with a new "
            "version, review samples whose sections changed (metadata.status=needs_review), or pass --allow-stale.",
            file=sys.stderr,
        )
        sys.exit(2)
    return fingerprint, stale


def run(args: argparse.Namespace) -> int:
    source, datasets, corpora = load_valid(Path(args.datasets), Path(args.corpus))
    if args.only:
        datasets = [ds for ds in datasets if ds.path.startswith(args.only)]
    if args.profile and not any(args.profile in ds.meta.get("profiles", {}) for ds in datasets):
        sys.exit(f"profile {args.profile!r} is not defined in any selected meta.json")
    options = dict(opt.split("=", 1) for opt in args.opt)
    target = load_target(args.target, options)
    fingerprint, stale = check_corpus(target, corpora, args.allow_stale)
    guard = AclGuard(target, section_acl(corpora))

    results: list[dict] = []
    per_dataset: dict[str, dict] = {}
    for ds in datasets:
        k = ds.meta.get("k", DEFAULT_K)
        skipped, rows, unavailable = [], [], []
        leaks_before = len(guard.leaks)
        for name in ds.meta["scorers"]:
            capability, score = SCORERS[name]
            if capability not in target.capabilities:
                skipped.append(name)
                continue
            for sample in ds.samples:
                if sample["metadata"]["status"] != "active":
                    continue
                run_as = sample["metadata"].get("run_as") or ds.meta.get("default_role")
                guard.sample_id = sample["id"]
                try:
                    result = score(sample, guard, k, run_as)
                except TargetUnavailable as exc:
                    unavailable.append({"id": sample["id"], "scorer": name, "reason": exc.reason})
                    continue
                if result is not None:
                    rows.append({"id": sample["id"], "dataset": ds.path, "scorer": name,
                                 "tags": sample["metadata"].get("tags", []), **result})
        summary = metrics.summarize(rows, k)
        summary["skipped_scorers"] = skipped
        # Not failures: the provider was unavailable, so these samples say nothing about the system
        summary["unavailable_samples"] = unavailable
        # A profile (e.g. one per retrieval mode) overrides the default thresholds key by key
        thresholds = {**ds.meta.get("thresholds", {}), **ds.meta.get("profiles", {}).get(args.profile, {})}
        summary["threshold_failures"] = metrics.check_thresholds(summary["metrics"], thresholds)
        # Any leak fails the run, whatever the thresholds say
        summary["acl_leaks"] = guard.leaks[leaks_before:]
        if summary["acl_leaks"]:
            summary["threshold_failures"].append(f"acl: {len(summary['acl_leaks'])} leaked section(s)")
        per_dataset[ds.path] = summary
        results += rows

    now = datetime.now(timezone.utc)
    option_label = "-".join(options.values())
    run_id = f"{now:%Y%m%d-%H%M%S}-{target.name}" + (f"-{option_label}" if option_label else "")
    summary = {
        "run_id": run_id,
        "created_at": now.isoformat(timespec="seconds"),
        "kit_version": KIT_VERSION,
        "target": target.name,
        "target_options": options,
        "profile": args.profile,
        "dataset_version": source.version(),
        "corpus": fingerprint,
        "corpus_versions": {corpus.path: corpus.meta["version"] for corpus in corpora},
        "corpus_stale": stale,
        "datasets": per_dataset,
    }
    run_dir = Path(args.runs) / run_id
    report.write_run(run_dir, summary, results)
    report.print_summary(summary, results)
    print(f"\nWrote {run_dir}")
    return 1 if any(ds["threshold_failures"] for ds in per_dataset.values()) else 0


def main(argv: list[str] | None = None, **defaults: str) -> int:
    parser = argparse.ArgumentParser(prog="evals")
    commands = parser.add_subparsers(dest="command", required=True)

    validate_cmd = commands.add_parser("validate", help="check datasets against the schema")
    validate_cmd.add_argument("--datasets")
    validate_cmd.add_argument("--corpus")

    run_cmd = commands.add_parser("run", help="score a target on the datasets")
    run_cmd.add_argument("--target", help="module:factory returning a Target")
    run_cmd.add_argument("--datasets")
    run_cmd.add_argument("--corpus")
    run_cmd.add_argument("--runs")
    run_cmd.add_argument("--only", help="run datasets whose path starts with this, e.g. public/roadmap")
    run_cmd.add_argument("--profile", help="threshold profile from meta.json \"profiles\", e.g. hybrid")
    run_cmd.add_argument("--opt", action="append", default=[], help="key=value passed to the target factory")
    run_cmd.add_argument("--allow-stale", action="store_true")

    diff_cmd = commands.add_parser("diff", help="compare two runs sample by sample")
    diff_cmd.add_argument("base")
    diff_cmd.add_argument("head")

    args = parser.parse_args(argv)
    for key, value in defaults.items():
        if getattr(args, key, None) is None:
            setattr(args, key, value)

    if args.command == "validate":
        if args.datasets is None or args.corpus is None:
            parser.error("missing --datasets or --corpus")
        _, datasets, corpora = load_valid(Path(args.datasets), Path(args.corpus))
        documents = sum(len(corpus.documents) for corpus in corpora)
        print(f"OK: {sum(len(ds.samples) for ds in datasets)} samples in {len(datasets)} datasets, "
              f"{documents} documents in {len(corpora)} corpora")
        return 0
    if args.command == "diff":
        changes = report.diff(Path(args.base), Path(args.head))
        for kind, labels in changes.items():
            print(f"{kind}: {len(labels)}")
            for label in labels:
                print(f"  {label}")
        return 1 if changes["regressed"] else 0
    missing = [key for key in ("target", "datasets", "corpus", "runs") if getattr(args, key) is None]
    if missing:
        parser.error(f"missing --{', --'.join(missing)}")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
