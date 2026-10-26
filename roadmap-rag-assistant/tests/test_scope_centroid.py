"""Domain signals: nearest document and centroid similarity, from the indexed vectors."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from evals.scope_tune import pick
from rag_service.domains.roadmap.retrieval.scope_centroid import DomainCentroids


def _store(vectors: dict, tags: dict):
    docs = {doc_id: SimpleNamespace(layer_tag=tags.get(doc_id)) for doc_id in vectors}
    return SimpleNamespace(_docs_map=docs, _vectors=vectors)


def test_nearest_and_domain_signals():
    c = DomainCentroids.from_store(_store({"a": [1.0, 0.0], "b": [0.0, 1.0]}, {"a": "01-DB", "b": "02-LLM"}))
    s = c.signals([1.0, 0.0])
    assert s.nearest == 1.0 and s.domain == 1.0
    assert set(c.centroids) == {"01-DB", "02-LLM", "corpus"}


def test_no_vectors_gives_no_signals():
    assert DomainCentroids.from_store(_store({}, {})) is None


def test_thresholds_sit_between_the_classes_and_never_admit_an_external_tune_sample():
    features = [("roadmap", 0.75), ("roadmap", 0.80), ("domain_gap", 0.66), ("domain_gap", 0.70),
                ("external", 0.58), ("external", 0.62)]
    t = pick(features)
    assert t["gap_min"] == 0.64 and t["roadmap_min"] == 0.725 and t["uncertain_band"] == 0.02  # half of 0.66 - 0.62
    overlapping = features + [("external", 0.67)]
    assert pick(overlapping)["gap_min"] > 0.67  # overlap: no external admitted, reported
    assert pick(overlapping)["overlap"]["external_vs_gap"] > 0


def test_committed_thresholds_were_tuned_on_the_tune_split():
    path = Path(__file__).resolve().parents[1] / "rag_service/domains/roadmap/retrieval/scope_thresholds.json"
    t = json.loads(path.read_text())
    assert t["tuned_on"]["split"] == "split-tune" and t["gap_min"] < t["roadmap_min"]
