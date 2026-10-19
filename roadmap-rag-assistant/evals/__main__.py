"""Roadmap entry point: `python -m evals <validate|run|diff>` with this repo's paths filled in."""

import sys
from pathlib import Path

from evals.kit.runner import main

ROOT = Path(__file__).parent

sys.exit(
    main(
        target="evals.target:build_target",
        datasets=str(ROOT / "datasets"),
        corpus=str(ROOT / "corpus"),
        runs=str(ROOT / "runs"),
    )
)
