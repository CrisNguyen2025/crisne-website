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
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


@dataclass(frozen=True)
class DomainSignals:
    nearest: float  # best single document
    domain: float   # best layer or corpus centroid


@dataclass
class DomainCentroids:
    centroids: Dict[str, List[float]]  # "corpus" and one per layer tag
    vectors: Dict[str, List[float]]    # every embedded document

    @classmethod
    def from_store(cls, store: Any) -> Optional["DomainCentroids"]:
        """From an indexed HybridVectorStore; None when it holds no vectors (embeddings unavailable)."""
        docs, vectors = store._docs_map, store._vectors
        usable = {doc_id: vec for doc_id, vec in vectors.items() if doc_id in docs}
        if not usable:
            return None
        by_layer: Dict[str, List[List[float]]] = defaultdict(list)
        for doc_id, vec in usable.items():
            tag = getattr(docs[doc_id], "layer_tag", None)
            if tag:
                by_layer[tag].append(vec)
        centroids = {tag: _mean(vecs) for tag, vecs in by_layer.items()}
        centroids["corpus"] = _mean(list(usable.values()))
        return cls(centroids=centroids, vectors=usable)

    def signals(self, query_vec: List[float]) -> DomainSignals:
        nearest = max(_cosine(query_vec, v) for v in self.vectors.values())
        domain = max(_cosine(query_vec, c) for c in self.centroids.values())
        return DomainSignals(nearest=round(nearest, 4), domain=round(domain, 4))
