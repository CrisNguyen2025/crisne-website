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


def metadata_event(
    mode: str,
    answer: str,
    documents: List[ContextDocument],
    usage: Optional[dict],
    grounding: Optional[str],
    show_scores: bool,
) -> dict:
    """Closing event of an LLM answer. `cited` marks documents whose href appears in the answer."""
    sources = [
        {
            "id": d.id,
            "title": d.title,
            "href": d.href,
            "cited": bool(d.href) and f"({d.href})" in answer,
            **({"score": round(d.score, 4)} if show_scores else {}),
        }
        for d in documents
    ]
    ev: dict = {"type": "metadata", "mode": mode, "sources": sources}
    if usage:
        ev["usage"] = usage
    if grounding:
        ev["grounding"] = grounding
    return ev


def record_turn(thread_id: str, user: str, assistant: str, store: HistoryStore = history_store) -> None:
    """Store one user/assistant exchange; empty sides are skipped."""
    store.append(thread_id, "user", mask_pii(user.strip()))
    store.append(thread_id, "assistant", mask_pii(assistant.strip()))
