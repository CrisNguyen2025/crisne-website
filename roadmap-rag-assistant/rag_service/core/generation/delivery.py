"""Section 5 — Post-processing, Streaming & State.

Shapes SSE events (tokens, then one closing metadata event with sources, usage and the
grounding verdict) and writes each finished turn into conversation memory (PII masked)
so the next turn's prompt can see it.
"""

from __future__ import annotations

from typing import List, Optional

from rag_service.core.augmentation.documents import ContextDocument
from rag_service.core.augmentation.history import HistoryStore, history_store
from rag_service.pii import mask_pii


def token_event(delta: str) -> dict:
    return {"type": "token", "delta": delta}


MAX_SOURCES = 3


def metadata_event(
    mode: str,
    answer: str,
    documents: List[ContextDocument],
    usage: Optional[dict],
    grounding: Optional[str],
    show_scores: bool,
    cited_ids: Optional[List[str]] = None,
    citations: Optional[List[dict]] = None,
) -> dict:
    """Closing event of an LLM answer.

    `sources` are the documents the model cited inline (`[[id]]`, see cite_channel) or named in its
    <sources> line (see sources_channel), in the order it named them. Nothing else is a source:
    retrieved but unused documents and names that merely appear in the text are not.
    `citations` map claims in the answer to their sources; every source they use is kept, and only
    the rest is capped at MAX_SOURCES. `cited` marks a source used by a citation or linked inline.
    """
    by_id = {d.id: d for d in documents}
    used = {i for c in citations or [] for i in c["source_ids"]}
    sources = []
    for doc_id in cited_ids or []:
        d = by_id.get(doc_id)
        if d is None or (doc_id not in used and len(sources) >= MAX_SOURCES):
            continue
        sources.append(
            {
                "id": d.id,
                "title": d.title,
                "href": d.href,
                "cited": doc_id in used or (bool(d.href) and f"({d.href})" in answer),
                **({"score": round(d.score, 4)} if show_scores else {}),
            }
        )
    ev: dict = {"type": "metadata", "mode": mode, "sources": sources}
    if citations is not None:
        ev["citations"] = citations
    if usage:
        ev["usage"] = usage
    if grounding:
        ev["grounding"] = grounding
    return ev


def record_turn(thread_id: str, user: str, assistant: str, store: HistoryStore = history_store) -> None:
    """Store one user/assistant exchange; empty sides are skipped."""
    store.append(thread_id, "user", mask_pii(user.strip()))
    store.append(thread_id, "assistant", mask_pii(assistant.strip()))
