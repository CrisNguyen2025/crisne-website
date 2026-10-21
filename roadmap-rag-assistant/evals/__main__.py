"""Roadmap entry point: `python -m evals <validate|run|diff|sync-dataset>` with this repo's paths filled in."""

import sys
from pathlib import Path

from evals.kit.runner import main

ROOT = Path(__file__).parent

if sys.argv[1:2] == ["sync-dataset"]:
    # Roadmap-only (Langfuse golden set -> _answer), so it lives outside the domain-free kit runner
    from evals.sync_dataset import main as sync_dataset

    sys.exit(sync_dataset(sys.argv[2:]))

sys.exit(
    main(
        target="evals.target:build_target",
        datasets=str(ROOT / "datasets"),
        corpus=str(ROOT / "corpus"),
        runs=str(ROOT / "runs"),
    )
)
