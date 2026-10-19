"""Run output: runs/<run_id>/{summary.json,samples.jsonl}, a console summary, and a per-sample diff."""

from __future__ import annotations

import json
from pathlib import Path


def write_run(run_dir: Path, summary: dict, results: list[dict]) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    with (run_dir / "samples.jsonl").open("w", encoding="utf-8") as out:
        for row in sorted(results, key=lambda r: (r["id"], r["scorer"])):
            out.write(json.dumps(row, ensure_ascii=False) + "\n")


def print_summary(summary: dict, results: list[dict]) -> None:
    corpus = ", ".join(f"{path}@{version}" for path, version in summary["corpus_versions"].items())
    print(f"\nRun {summary['run_id']}  target={summary['target']}  datasets={summary['dataset_version']}  corpus={corpus}")
    if summary["corpus_stale"]:
        print("  WARNING: target serves different content than the static corpus, results may be wrong")
    for path, ds in summary["datasets"].items():
        print(f"\n== {path} ==")
        for name, values in ds["metrics"].items():
            shown = "  ".join(f"{key}={value}" for key, value in values.items())
            print(f"  {name}: {shown}")
        for skipped in ds["skipped_scorers"]:
            print(f"  {skipped}: skipped (target lacks capability)")
        if ds.get("unavailable_samples"):
            reasons = sorted({u["reason"] for u in ds["unavailable_samples"]})
            ids = ", ".join(u["id"] for u in ds["unavailable_samples"][:5])
            print(f"  unavailable: {len(ds['unavailable_samples'])} sample(s) not scored ({', '.join(reasons)}): {ids}")
        for failure in ds["threshold_failures"]:
            print(f"  FAIL {failure}")
        for leak in ds["acl_leaks"]:
            print(f"    leak {leak['id']} [{leak['via']}] {leak['section_id']} run_as={leak['run_as']}")
        for row in results:
            if row["dataset"] == path and not row["passed"]:
                print(f"    x {row['id']} [{row['scorer']}] got={row.get('got')}")


def _load_rows(run_dir: Path) -> dict[tuple[str, str], bool]:
    lines = (run_dir / "samples.jsonl").read_text(encoding="utf-8").splitlines()
    rows = (json.loads(line) for line in lines if line.strip())
    return {(row["id"], row["scorer"]): row["passed"] for row in rows}


def diff(base_dir: Path, head_dir: Path) -> dict[str, list[str]]:
    """Samples whose result changed between two runs, keyed by id + scorer."""
    base, head = _load_rows(base_dir), _load_rows(head_dir)
    changes: dict[str, list[str]] = {"regressed": [], "fixed": [], "added": [], "removed": []}
    for key in sorted(base.keys() | head.keys()):
        label = f"{key[0]} [{key[1]}]"
        if key not in base:
            changes["added"].append(label)
        elif key not in head:
            changes["removed"].append(label)
        elif base[key] and not head[key]:
            changes["regressed"].append(label)
        elif not base[key] and head[key]:
            changes["fixed"].append(label)
    return changes
