#!/usr/bin/env python3
"""Phase 4 Router Invariant & Confuse Evaluation Harness.

Runs evals.router.check (791 samples) and evals.router.confuse (498 samples)
in roadmap-rag-assistant, strictly asserts write_now_violation == 0 across
all 498 confusing samples, validates zero ratchet regressions against baselines,
and produces a consolidated machine-readable JSON artifact.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Phase 4 Router Invariant & Evaluation Runner")
    parser.add_argument("--output", default="tests/load/results/phase4-router-eval.json", help="Path to output JSON")
    parser.add_argument("--rag-dir", default="roadmap-rag-assistant", help="Path to roadmap-rag-assistant directory")
    return parser.parse_args()


def main():
    args = parse_args()
    rag_dir = Path(args.rag_dir).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not rag_dir.exists():
        sys.stderr.write(f"ERROR: RAG directory not found at {rag_dir}\n")
        sys.exit(1)

    # Insert rag_dir into python module search path and chdir to resolve datasets
    sys.path.insert(0, str(rag_dir))
    os.chdir(str(rag_dir))

    from evals.router.check import run as run_check, BASELINE as CHECK_BASELINE, LOWER_IS_BETTER
    from evals.router.confuse import run as run_confuse

    start_time = time.perf_counter()

    print("================================================================================")
    print("Phase 4: Router Invariant & Confuse Evaluation Harness")
    print("================================================================================")

    # 1. Execute evals.router.check (791 samples: 504 stress + 223 routing + 64 intent)
    print("\n[1/2] Executing evals.router.check (791 samples)...")
    check_metrics, check_breakdown, check_extra = run_check()
    check_baseline_file = CHECK_BASELINE
    check_baseline = json.loads(check_baseline_file.read_text(encoding="utf-8")) if check_baseline_file.exists() else {}

    check_regressions = []
    for k, old in check_baseline.items():
        new = check_metrics.get(k, 0)
        if (k in LOWER_IS_BETTER and new > old) or (k.endswith(".correct") and new < old):
            check_regressions.append(f"{k}: baseline={old} -> actual={new}")

    check_passed = len(check_regressions) == 0
    print(f"      check.py status       : {'PASS' if check_passed else 'FAIL'}")
    print(f"      stress.wrong_write    : {check_metrics.get('stress.wrong_write', 0)} (Target: 0)")
    print(f"      heldout.routing.correct: {check_metrics.get('heldout.routing.correct', 0)} / 223")
    print(f"      heldout.intent.correct : {check_metrics.get('heldout.intent_cases.correct', 0)} / 64")
    if check_regressions:
        print(f"      Regressions detected  : {', '.join(check_regressions)}")

    # 2. Execute evals.router.confuse (498 samples: 83 base × 6 noise variants)
    print("\n[2/2] Executing evals.router.confuse (498 samples)...")
    confuse_res = asyncio.run(run_confuse(use_llm=False))
    confuse_total = confuse_res.get("total", {})
    confuse_by_cat = confuse_res.get("by_category", {})
    confuse_by_noise = confuse_res.get("by_noise", {})

    confuse_baseline_file = rag_dir / "evals" / "router" / "confuse_baseline.json"
    confuse_baseline = json.loads(confuse_baseline_file.read_text(encoding="utf-8")) if confuse_baseline_file.exists() else {}

    total_samples = confuse_total.get("n", 0)
    write_now_violation = confuse_total.get("write_now_violation", 0)
    preview_violation = confuse_total.get("preview_violation", 0)
    missed_write = confuse_total.get("missed_write", 0)
    wrong_branch = confuse_total.get("wrong_branch", 0)

    confuse_regressions = []
    if write_now_violation > 0:
        confuse_regressions.append(f"write_now_violation: {write_now_violation} > 0")

    for k in ("missed_write", "wrong_branch", "preview_violation"):
        baseline_val = confuse_baseline.get(k, 999)
        actual_val = confuse_total.get(k, 0)
        if actual_val > baseline_val:
            confuse_regressions.append(f"{k}: baseline={baseline_val} -> actual={actual_val}")

    write_now_passed = (write_now_violation == 0) and (total_samples == 498)
    confuse_passed = write_now_passed and (len(confuse_regressions) == 0)

    print(f"      confuse.py status     : {'PASS' if confuse_passed else 'FAIL'}")
    print(f"      write_now_violation   : {write_now_violation} (Target: 0 across {total_samples} samples) -> {'PASS' if write_now_passed else 'FAIL'}")
    print(f"      wrong_branch          : {wrong_branch} (Baseline: {confuse_baseline.get('wrong_branch', 103)})")
    print(f"      preview_violation     : {preview_violation} (Baseline: {confuse_baseline.get('preview_violation', 35)})")
    print(f"      missed_write          : {missed_write} (Baseline: {confuse_baseline.get('missed_write', 3)})")
    if confuse_regressions:
        print(f"      Regressions detected  : {', '.join(confuse_regressions)}")

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
    overall_passed = check_passed and confuse_passed

    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "execution_time_ms": elapsed_ms,
        "overall_passed": overall_passed,
        "verdict": "PASS" if overall_passed else "FAIL",
        "slos": {
            "write_now_invariant": {
                "target": "write_now_violation = 0 across 498 confuse samples",
                "actual_violations": write_now_violation,
                "total_confuse_samples": total_samples,
                "passed": write_now_passed,
                "status": "PASS" if write_now_passed else "FAIL",
            },
            "router_eval_ratchet": {
                "target": "Zero metric regressions on 791 check samples and 498 confuse samples",
                "check_passed": check_passed,
                "confuse_passed": confuse_passed,
                "check_regressions": check_regressions,
                "confuse_regressions": confuse_regressions,
                "passed": overall_passed,
                "status": "PASS" if overall_passed else "FAIL",
            },
        },
        "check_eval": {
            "total_samples": 791,
            "metrics": check_metrics,
            "baseline": check_baseline,
            "regressions": check_regressions,
            "passed": check_passed,
        },
        "confuse_eval": {
            "total_samples": total_samples,
            "metrics": confuse_total,
            "baseline": confuse_baseline,
            "regressions": confuse_regressions,
            "passed": confuse_passed,
            "by_category": confuse_by_cat,
            "by_noise": confuse_by_noise,
        },
    }

    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nRouter Eval Artifact written to: {output_path}")
    print(f"Phase 4 Router Invariant & Eval Verdict: [{report['verdict']}]")
    print("================================================================================\n")

    sys.exit(0 if overall_passed else 1)


if __name__ == "__main__":
    main()
