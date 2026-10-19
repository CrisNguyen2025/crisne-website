"""Section 5 — Post-processing, Streaming & State.

Shapes SSE token events and writes each finished turn into conversation memory
(PII masked) so the next turn's prompt can see it.
"""

from __future__ import annotations

from rag_service.generation.history import HistoryStore, history_store
from rag_service.pii import mask_pii


def token_event(delta: str) -> dict:
    return {"type": "token", "delta": delta}


def record_turn(thread_id: str, user: str, assistant: str, store: HistoryStore = history_store) -> None:
    """Store one user/assistant exchange; empty sides are skipped."""
    store.append(thread_id, "user", mask_pii(user.strip()))
    store.append(thread_id, "assistant", mask_pii(assistant.strip()))
