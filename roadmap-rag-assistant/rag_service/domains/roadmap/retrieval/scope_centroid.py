"""Domain signals from the roadmap's own embeddings: is a topic covered, in the domain, or outside it?

Two numbers for a query vector, both cosine similarities against the indexed documents:
- nearest: the most similar single document. High means the roadmap covers the topic.
- domain: the most similar layer centroid (mean of the layer's documents) or the corpus centroid. A topic
  the roadmap does not cover but that belongs to its field (LoRA for an AI roadmap) sits closer to the
  centroids than a topic from elsewhere (Telegram).

Nothing here is a word list: adding lessons moves the centroids, and the thresholds are picked on the
tune split by evals/scope_tune.py.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


def _mean(vectors: List[List[float]]) -> List[float]:
    dims = len(vectors[0])
    return [sum(v[i] for v in vectors) / len(vectors) for i in range(dims)]


def _cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


@dataclass(frozen=True)
class DomainSignals:
    nearest: float  # best single document
    domain: float   # best layer or corpus centroid


@dataclass
class DomainCentroids:
    centroids: Dict[str, List[float]]  # "corpus" and one per layer tag, from topics and lessons
    vectors: Dict[str, List[float]]    # every embedded document, lesson chunks included (the `nearest` signal)

    @classmethod
    def from_store(cls, store: Any) -> Optional["DomainCentroids"]:
        """From an indexed HybridVectorStore; None when it holds no vectors (embeddings unavailable).

        `nearest` counts lesson chunks: a lesson's own vector covers only its first 1,000 characters, so a question
        about a later section (often a statement added from News) would otherwise read as outside the field. Being
        near a chunk is being near its lesson, which is what `roadmap_min` means. The centroids keep topics and
        lessons only, so the `domain` signal stays the one the thresholds were tuned with (ADR-0004).
        """
        docs, vectors = store._docs_map, store._vectors
        usable = {doc_id: vec for doc_id, vec in vectors.items() if doc_id in docs}
        if not usable:
            return None
        meta = {
            doc_id: vec for doc_id, vec in usable.items() if getattr(docs[doc_id], "doc_type", None) != "chunk"
        } or usable
        by_layer: Dict[str, List[List[float]]] = defaultdict(list)
        for doc_id, vec in meta.items():
            tag = getattr(docs[doc_id], "layer_tag", None)
            if tag:
                by_layer[tag].append(vec)
        centroids = {tag: _mean(vecs) for tag, vecs in by_layer.items()}
        centroids["corpus"] = _mean(list(meta.values()))
        return cls(centroids=centroids, vectors=usable)

    def signals(self, query_vec: List[float]) -> DomainSignals:
        nearest = max(_cosine(query_vec, v) for v in self.vectors.values())
        domain = max(_cosine(query_vec, c) for c in self.centroids.values())
        return DomainSignals(nearest=round(nearest, 4), domain=round(domain, 4))
