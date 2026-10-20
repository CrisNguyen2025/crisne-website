"""Tool-use golden set for the deterministic CUD extractor (the fallback when no LLM is available).

Cases marked "schema_gap" are renames: StructuredRoadmapAction has no field for the new name yet,
so they are reported separately and do not gate the suite.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from rag_service.domains.roadmap.router.entity_extractor import StructuredEntityExtractor

CASES = json.loads((Path(__file__).parent / "data" / "tool_use_cases.json").read_text(encoding="utf-8"))
RUNNABLE = [c for c in CASES if not c.get("schema_gap")]


def _actual(message: str) -> dict:
    res = asyncio.run(StructuredEntityExtractor(llm_model=None).aextract(message))
    return {
        "action": res.action.value,
        "entity_level": res.entity_level.value,
        "target": res.target_parent_identifier,
        "titles": [e.title for e in res.entities],
    }


def _same(actual: dict, expected: dict) -> bool:
    return (
        actual["action"] == expected["action"]
        and actual["entity_level"] == expected["entity_level"]
        and actual["target"] == expected["target"]
        and [t.casefold() for t in actual["titles"]] == [t.casefold() for t in expected["titles"]]
    )


@pytest.mark.parametrize("case", RUNNABLE, ids=[c["message"] for c in RUNNABLE])
def test_deterministic_extraction_matches_golden(case):
    assert _same(_actual(case["message"]), case["expected"])
