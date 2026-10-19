"""Section 1 — Context Engineering & Prompt Synthesis.

Builds one prompt from persona, rules, conversation history, retrieved context and the
user query, each in its own XML tag so the model can tell data from instructions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional

from rag_service.generation.domain_profile import PROFILE, DomainProfile
from rag_service.generation.history import HistoryStore, Turn, history_store

Mode = Literal["rag", "chitchat"]


@dataclass
class GenerationRequest:
    mode: Mode
    query: str
    thread_id: str = "default"
    # Formatted retrieved chunks; required for mode "rag".
    rag_context: Optional[str] = None


def _escape(text: str) -> str:
    # Data inside a tag must not be able to close it.
    return text.replace("</", "<\\/")


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "…"


def format_history(turns: List[Turn], profile: DomainProfile) -> str:
    if not turns:
        return ""
    lines = [
        f'<turn role="{t.role}">{_escape(_clip(t.content, profile.history_max_chars))}</turn>' for t in turns
    ]
    return f"{profile.history_note}\n<conversation_history>\n" + "\n".join(lines) + "\n</conversation_history>"


def build_prompt(
    req: GenerationRequest,
    profile: DomainProfile = PROFILE,
    history: HistoryStore = history_store,
) -> str:
    persona, rules = (
        (profile.persona_rag, profile.rules_rag)
        if req.mode == "rag"
        else (profile.persona_chitchat, profile.rules_chitchat)
    )
    parts = [f"<system>\n{persona}\n{rules}\n</system>"]
    if hist := format_history(history.get_recent(req.thread_id, profile.history_turns * 2), profile):
        parts.append(hist)
    if req.mode == "rag":
        parts.append(f"<context>\n{req.rag_context or ''}\n</context>")
    parts.append(f"{profile.query_note}\n<user_query>\n{_escape(req.query)}\n</user_query>")
    if profile.suggestion_format:
        parts.append(profile.suggestion_format)
    return "\n\n".join(parts)
