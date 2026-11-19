"""Section 1 — Context Engineering & Prompt Synthesis.

Builds one prompt from persona, rules, conversation history, retrieved documents and the
user query, each in its own XML tag so the model can tell data from instructions.
Every retrieved document gets its own <document id=…> so sources can be told apart and
cited, and documents far below the best match are left out.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Literal, Optional, Sequence, Tuple

from rag_service.core.augmentation.documents import ContextDocument
from rag_service.core.generation.profile import DomainProfile
from rag_service.core.augmentation.history import HistoryStore, Turn, history_store

Mode = Literal["rag", "chitchat"]


@dataclass
class GenerationRequest:
    mode: Mode
    query: str
    thread_id: str = "default"
    # Retrieved (source, score) pairs as the retriever returned them; mode "rag" only.
    # DomainProfile.to_document turns each source into a ContextDocument.
    sources: Sequence[Tuple[Any, float]] = field(default_factory=list)


def _escape(text: str) -> str:
    # Data inside a tag must not be able to close it.
    return text.replace("</", "<\\/")


def _attr(text: str) -> str:
    # "&" stays literal: the model copies href verbatim, and "&amp;" would break the query string
    return text.replace('"', "&quot;").replace("<", "&lt;")


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "…"


def select_documents(req: GenerationRequest, profile: DomainProfile) -> List[ContextDocument]:
    """Convert sources to documents and keep those scoring at least `min_relative_score` of the best.

    Relative, because retrievers score on different scales (RRF ≈ 0.016–0.033, cosine 0–1, BM25).
    """
    docs = [profile.to_document(src, score) for src, score in req.sources]
    if not docs:
        return []
    best = max(d.score for d in docs)
    if best > 0:
        docs = [d for d in docs if d.score >= best * profile.min_relative_score]
    return docs[: profile.max_documents]


def reorder_documents(docs: Sequence[ContextDocument]) -> List[ContextDocument]:
    if len(docs) <= 2:
        return list(docs)
    reordered: List[ContextDocument] = []
    for i, doc in enumerate(reversed(docs)):
        if i % 2 == 1:
            reordered.append(doc)
        else:
            reordered.insert(0, doc)
    return reordered


def format_documents(docs: List[ContextDocument]) -> str:
    if not docs:
        return "<context>\n</context>"
    blocks = []
    for d in docs:
        attrs = f'id="{_attr(d.id)}" title="{_attr(d.title)}"' + (f' href="{_attr(d.href)}"' if d.href else "")
        blocks.append(f"<document {attrs}>\n{_escape(d.body)}\n</document>")
    return "<context>\n" + "\n".join(blocks) + "\n</context>"


def format_history(turns: List[Turn], profile: DomainProfile) -> str:
    """Newest turns kept within history_total_chars; the oldest are dropped first."""
    lines: List[str] = []
    total = 0
    for t in reversed(turns):
        content = _clip(t.content, profile.history_max_chars)
        if lines and total + len(content) > profile.history_total_chars:
            break
        total += len(content)
        lines.append(f'<turn role="{t.role}">{_escape(content)}</turn>')
    if not lines:
        return ""
    lines.reverse()
    return f"{profile.history_note}\n<conversation_history>\n" + "\n".join(lines) + "\n</conversation_history>"


def build_prompt(
    req: GenerationRequest,
    profile: DomainProfile,
    history: HistoryStore = history_store,
    documents: Optional[List[ContextDocument]] = None,
) -> str:
    persona, rules = (
        (profile.persona_rag, profile.rules_rag)
        if req.mode == "rag"
        else (profile.persona_chitchat, profile.rules_chitchat)
    )
    # Fixed text first, per-request data after: the prefix stays the same from one request to the next
    system = "\n".join(s.strip("\n") for s in (persona, rules, profile.suggestion_format) if s)
    parts = [f"<system>\n{system}\n</system>"]
    if hist := format_history(history.get_recent(req.thread_id, profile.history_turns * 2), profile):
        parts.append(hist)
    if req.mode == "rag":
        docs = reorder_documents(select_documents(req, profile)) if documents is None else documents
        parts.append(format_documents(docs))
    parts.append(f"{profile.query_note}\n<user_query>\n{_escape(req.query)}\n</user_query>")
    return "\n\n".join(parts)
