"""Scope — what a message is about: the roadmap, its field but not covered yet, or somewhere else.

Two axes decide a message: what it does (act: question / command / statement, understanding.py) and what
it is about (target). Keywords give the target when the message names a roadmap object ("bài", "layer") or
an off-topic subject; otherwise the target was "none" and "bạn có biết thông tin về telegram k" was searched
in the roadmap. Here the target comes from the roadmap's own data:

    1. no topic left once the question frame is removed (focus.py)       -> NONE
    2. the topic names a lesson, layer or topic in the catalog           -> ROADMAP
    3. embeddings (scope_centroid.py, thresholds from evals/scope_tune.py):
         nearest >= roadmap_min                                          -> ROADMAP
         nearest >= gap_min + band                                       -> DOMAIN_GAP (the field, no lesson yet)
         nearest <= gap_min - band                                       -> EXTERNAL
         in between                                                      -> NONE (the LLM router decides)
    4. no embeddings: a catalog name decides, anything else is NONE      (never EXTERNAL without evidence)

act x target -> what the agent does (SCOPE_ROUTE):

    | act \\ target | ROADMAP  | DOMAIN_GAP           | EXTERNAL     | NONE        |
    |--------------|----------|----------------------|--------------|-------------|
    | question     | search   | search, "no lesson"  | out of scope | as before   |
    | statement    | search   | search, "no lesson"  | out of scope | as before   |
    | command      | as before (System 2 + grounding decide a change) | out of scope | as before |
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

from rag_service.domains.roadmap.router.focus import focus_of

THRESHOLDS_FILE = Path(__file__).resolve().parents[1] / "retrieval" / "scope_thresholds.json"


class Scope(str, Enum):
    ROADMAP = "roadmap"
    DOMAIN_GAP = "domain_gap"
    EXTERNAL = "external"
    NONE = "none"


@dataclass(frozen=True)
class ScopeResult:
    scope: Scope
    focus: Optional[str]
    reason: str
    nearest: Optional[float] = None


def load_thresholds() -> Optional[dict]:
    try:
        return json.loads(THRESHOLDS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _names_catalog_entry(focus: str, catalog: Any) -> bool:
    if catalog is None:
        return False
    from rag_service.domains.roadmap.router.schemas import EntityLevel

    parts = [p.strip() for p in focus.split("|")]
    return any(catalog.has(level, part) for part in parts for level in (EntityLevel.ITEM, EntityLevel.LAYER, EntityLevel.TOPIC))


def classify_scope(
    text: str,
    *,
    catalog: Any = None,
    centroids: Any = None,
    query_vec: Optional[list] = None,
    thresholds: Optional[dict] = None,
) -> ScopeResult:
    focus = focus_of(text)
    if focus is None:
        return ScopeResult(Scope.NONE, None, "no topic")
    if _names_catalog_entry(focus, catalog):
        return ScopeResult(Scope.ROADMAP, focus, "names a catalog entry")
    if centroids is None or query_vec is None or not thresholds:
        return ScopeResult(Scope.NONE, focus, "no embeddings: not decided without evidence")
    nearest = centroids.signals(query_vec).nearest
    band = thresholds.get("uncertain_band", 0.0)
    if nearest >= thresholds["roadmap_min"]:
        return ScopeResult(Scope.ROADMAP, focus, "near a lesson", nearest)
    if nearest >= thresholds["gap_min"] + band:
        return ScopeResult(Scope.DOMAIN_GAP, focus, "in the field, no lesson", nearest)
    if nearest <= thresholds["gap_min"] - band:
        return ScopeResult(Scope.EXTERNAL, focus, "outside the field", nearest)
    return ScopeResult(Scope.NONE, focus, "uncertain band", nearest)


def out_of_scope_act(act: str, scope: Scope) -> bool:
    """SCOPE_ROUTE, the EXTERNAL column: every act about an outside topic is answered "out of scope"."""
    return scope == Scope.EXTERNAL and act in ("question", "statement", "command", "request")


async def classify_for_routing(text: str, engine: Any, embed: Optional[Callable[[str], Any]] = None) -> ScopeResult:
    """classify_scope with the live engine: catalog, centroids and a cached query vector (the search reuses it)."""
    catalog = await engine.catalog()
    centroids = engine.centroids()
    vec = await embed(text) if embed is not None and centroids is not None else None
    return classify_scope(text, catalog=catalog, centroids=centroids, query_vec=vec, thresholds=load_thresholds())
