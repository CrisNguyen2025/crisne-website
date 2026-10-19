"""Generation profile: the contract between the generic pipeline and one domain.

A domain fills a DomainProfile (persona, rules, how a source becomes a document, which links are
allowed, policies). The core pipeline only reads these fields and never names a domain. The
domain instance lives in rag_service/domains/.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Literal

from rag_service.core.augmentation.documents import ContextDocument


def _generic_document(source: Any, score: float) -> ContextDocument:
    """Fallback for sources with id/title/text attributes or plain strings."""
    return ContextDocument(
        id=str(getattr(source, "id", "")),
        title=str(getattr(source, "title", "")),
        body=str(getattr(source, "text", source)),
        score=score,
    )


@dataclass(frozen=True)
class DomainProfile:
    # ── S1: persona & rules per generation mode ──
    persona_rag: str
    rules_rag: str
    persona_chitchat: str
    rules_chitchat: str
    # Appended after the prompt, e.g. a format for follow-up suggestion chips.
    suggestion_format: str = ""
    # Shown above the history block so the model reads it as context, not instructions.
    history_note: str = ""
    query_note: str = ""
    # Turns one retrieved source into the <document> the model reads.
    to_document: Callable[[Any, float], ContextDocument] = _generic_document
    # Keep documents scoring at least this share of the best one, at most max_documents.
    min_relative_score: float = 0.5
    max_documents: int = 4

    # ── S3: links the model may emit; None disables link filtering ──
    # Returns the set of allowed link targets (a callable taking an href and returning bool, see links.py)
    known_links: Callable[[], Callable[[str], bool]] | None = None

    # ── S2: LLM params (the model itself is built by the agent from settings) ──
    temperature: float = 0.1

    # ── S4: what to do when the grounding check finds issues (mode "rag") ──
    # "fallback": hold the answer until checked, replace it with the caller's fallback on failure (TTFT
    #             grows to the full generation time). "note": stream at once, append grounding_note.
    grounding_policy: Literal["fallback", "note"] = "fallback"
    # Only findings precise enough to withhold an answer. ungrounded_terms is word-overlap based and flags
    # paraphrases ("Cơ sở dữ liệu vector" for "Vector Database"), so it is a trace/guard warning only.
    # unbacked_action: the model claims a save/create/update, but this pipeline never writes anything.
    grounding_fail_on: tuple[str, ...] = ("future_promise", "unbacked_action")
    grounding_note: str = ""
    # Mask emails/phones in the answer before it reaches the client.
    mask_output_pii: bool = True

    # ── S5: conversation memory ──
    history_turns: int = 10  # user+assistant pairs fed back into S1
    history_max_chars: int = 1000  # per message, so one long paste cannot flood the prompt

    # ── Observability: Langfuse step name per mode ──
    trace_names: dict[str, str] = field(
        default_factory=lambda: {"rag": "synthesize-answer", "chitchat": "chitchat-answer"}
    )

