"""Context of a conversation, the way Claude Code's Context panel shows it (POST /chat/context).

What is in context now is what the next answer will carry for sure: the system prompt and the history
window. Each answer prompt is rebuilt from those plus the documents retrieved for that question, the
question itself, and room for the reply; those three are reserved slots, not carried from turn to turn.
When the history window is full the oldest messages drop out, which is Abot's equivalent of auto-compact.

The denominator is Abot's own budget (the sum of its caps), not the model's window: the caps keep a prompt
far below any model window, so a share of the window would always read ~1%.

The prompt is built by core/augmentation/context.py with each kind of input in its own tag, so the split
is read back from those tags. Only counts, labels and the titles of retrieved lessons (public roadmap data)
leave the service, never prompt text.
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional, Sequence

from rag_service.core.augmentation.context import GenerationRequest, build_prompt
from rag_service.core.augmentation.history import HistoryStore, history_store
from rag_service.core.bounded import BoundedStore
from rag_service.core.generation.profile import DomainProfile

# Context window by model-name fragment (first match wins), shown as a reference line. A model not listed
# gets DEFAULT_WINDOW. LLM_CONTEXT_WINDOW in the environment overrides both (config.Settings).
MODEL_WINDOWS = (("gemini", 1_000_000), ("gpt-oss", 131_072))
DEFAULT_WINDOW = 128_000

# Rough rule for Latin and Vietnamese text; good enough to size a bar without a tokenizer dependency.
CHARS_PER_TOKEN = 4

# Budget slots. Chunked lessons carry up to 2 passages (900 chars each) plus title, section,
# description and provenance lines, so 2400 characters matches one retrieved document.
DOCUMENT_BUDGET_CHARS = 2400
QUERY_MAX_CHARS = 2000  # api/schemas.py ChatRequest.message
OUTPUT_RESERVE_TOKENS = 2048  # room kept for the reply; no max_tokens is set on the model
# Tags and attributes around each history message ('<turn role="assistant">…</turn>')
TURN_OVERHEAD_CHARS = 32

_FLAGS = re.DOTALL | re.MULTILINE
# Blocks are matched only where a tag stands on its own line: the rules mention "<context>" inside a
# sentence, and that mention belongs to the system prompt. The optional line before a block is its note.
# Data inside a block cannot fake a closing tag ("</" is escaped by context.py).
_OWNER_MEMORY = re.compile(r"(?:^[^\n]*\n)?^<owner_memory>$.*?^</owner_memory>$", _FLAGS)
_HISTORY = re.compile(r"(?:^[^\n]*\n)?^<conversation_history>$.*?^</conversation_history>$", _FLAGS)
_CONTEXT = re.compile(r"^<context>$.*?^</context>$", _FLAGS)
_QUERY = re.compile(r"(?:^[^\n]*\n)?^<user_query>$.*?^</user_query>$", _FLAGS)

# What the last answer of each thread actually sent, for the "last answer" section
_last_turns: BoundedStore[dict] = BoundedStore()
_last_diagnostics: BoundedStore[dict] = BoundedStore()


def context_window(model: str) -> int:
    name = (model or "").lower()
    return next((size for fragment, size in MODEL_WINDOWS if fragment in name), DEFAULT_WINDOW)


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN) if text else 0


def _take(pattern: re.Pattern[str], prompt: str) -> tuple[str, str]:
    """The first match of `pattern` and the prompt without it."""
    match = pattern.search(prompt)
    if not match:
        return "", prompt
    return match.group(0), prompt[: match.start()] + prompt[match.end() :]


def split_prompt(prompt: str) -> dict[str, str]:
    """The prompt's text by part: system (everything else), owner_memory, history, retrieved, message."""
    owner_memory, rest = _take(_OWNER_MEMORY, prompt)
    history, rest = _take(_HISTORY, rest)
    retrieved, rest = _take(_CONTEXT, rest)
    message, system = _take(_QUERY, rest)
    return {
        "system": system,
        "owner_memory": owner_memory,
        "history": history,
        "retrieved": retrieved,
        "message": message,
    }


def record_last_turn(
    thread_id: str,
    prompt: str,
    *,
    usage: Optional[dict[str, Any]] = None,
    documents: Sequence[tuple[str, str]] = (),
    dropped_documents: int = 0,
) -> dict[str, Any]:
    """Keep what one answer sent. `usage` is the Langfuse-style dict from usage_from_langchain;
    `documents` is (title, formatted block) of each document in the prompt."""
    texts = split_prompt(prompt)
    estimated = sum(estimate_tokens(t) for t in texts.values())
    measured = (usage or {}).get("input")
    turn = {
        "input_tokens": int(measured) if measured is not None else estimated,
        "output_tokens": int((usage or {}).get("output") or 0),
        "measured": measured is not None,
        "retrieved_tokens": estimate_tokens(texts["retrieved"]),
        "documents": [{"label": title, "tokens": estimate_tokens(block)} for title, block in documents],
        "dropped_documents": dropped_documents,
    }
    _last_turns.set(thread_id, turn)
    return turn


def record_turn_diagnostics(
    thread_id: str,
    *,
    document_ids: Sequence[str] = (),
    invalid_citations: int = 0,
) -> dict[str, Any]:
    data = {"document_ids": list(document_ids), "invalid_citations": int(invalid_citations)}
    _last_diagnostics.set(thread_id, data)
    return data


def last_turn_diagnostics(thread_id: str) -> Optional[dict[str, Any]]:
    return _last_diagnostics.get(thread_id)


def conversation_context(
    thread_id: str,
    profile: DomainProfile,
    *,
    model: str,
    window: Optional[int] = None,
    history: HistoryStore = history_store,
    owner_memories: Sequence[Any] = (),
    memory_scope: Optional[str] = None,
) -> dict[str, Any]:
    """What the next answer of `thread_id` carries, against Abot's budget."""
    # The answer prompt with no documents and no question: exactly what is in context between turns
    texts = split_prompt(
        build_prompt(
            GenerationRequest(
                mode="rag",
                query="",
                thread_id=thread_id,
                owner_memories=owner_memories,
                memory_scope=memory_scope,
            ),
            profile,
            history,
        )
    )
    system = estimate_tokens(texts["system"])
    memory_tokens = estimate_tokens(texts["owner_memory"])
    memory_count = len([line for line in texts["owner_memory"].splitlines() if line.startswith("- [")])
    explicit_count = 0
    observation_count = 0
    explicit_tokens = 0
    observation_tokens = 0
    if owner_memories and memory_tokens:
        from rag_service.core.memory import format_owner_memory_detailed

        _, selected_items = format_owner_memory_detailed(
            owner_memories,
            note=profile.memory_note,
            scope=memory_scope,
            max_items=profile.memory_max_items,
            max_chars=profile.memory_total_chars,
        )
        explicit_items = [m for m in selected_items if getattr(m, "source", "explicit") == "explicit"]
        observation_items = [m for m in selected_items if getattr(m, "source", "explicit") != "explicit"]
        explicit_count = len(explicit_items)
        observation_count = len(observation_items)
        if explicit_count + observation_count > 0:
            explicit_tokens = estimate_tokens("\n".join(m.content for m in explicit_items)) if explicit_items else 0
            observation_tokens = max(memory_tokens - explicit_tokens, 0) if observation_items else 0
            if explicit_items and not observation_items:
                explicit_tokens = memory_tokens
    messages = estimate_tokens(texts["history"])
    history_limit = profile.history_turns * 2
    in_window = texts["history"].count("<turn ")
    # The store keeps at most 50 messages per thread, so this reads the whole thread
    outside = max(len(history.get_recent(thread_id, 1000)) - in_window, 0)

    history_chars_cap = min(history_limit * profile.history_max_chars, profile.history_total_chars)
    history_overhead_chars = history_limit * TURN_OVERHEAD_CHARS + len(profile.history_note) + 48
    history_cap = max(
        messages,
        math.ceil((history_chars_cap + history_overhead_chars) / CHARS_PER_TOKEN),
    )
    memory_cap = (
        max(
            memory_tokens,
            math.ceil((profile.memory_total_chars + len(profile.memory_note) + 32) / CHARS_PER_TOKEN),
        )
        if memory_tokens
        else 0
    )
    reserved: list[dict[str, Any]] = [
        {"key": "retrieved", "label": "Tài liệu truy xuất",
         "tokens": math.ceil(profile.max_documents * DOCUMENT_BUDGET_CHARS / CHARS_PER_TOKEN), "count": profile.max_documents},
        {"key": "message", "label": "Câu hỏi kế tiếp", "tokens": math.ceil(QUERY_MAX_CHARS / CHARS_PER_TOKEN)},
        {"key": "output", "label": "Câu trả lời", "tokens": OUTPUT_RESERVE_TOKENS},
    ]
    budget = system + memory_cap + history_cap + sum(r["tokens"] for r in reserved)

    omitted = []
    if outside:
        omitted.append({"key": "history_outside", "label": "Tin nhắn ngoài cửa sổ", "count": outside})
    last_turn = _last_turns.get(thread_id)
    if last_turn and last_turn["dropped_documents"]:
        omitted.append({"key": "retrieved_dropped", "label": "Tài liệu bị loại (lượt gần nhất)",
                        "count": last_turn["dropped_documents"]})

    parts: list[dict[str, Any]] = [
        {"key": "system", "label": "System prompt", "tokens": system},
    ]
    if memory_tokens:
        parts.append(
            {
                "key": "owner_memory",
                "label": "Bộ nhớ Owner",
                "tokens": memory_tokens,
                "count": memory_count,
                "limit": profile.memory_max_items,
                "breakdown": {
                    "explicit": {"count": explicit_count, "tokens": explicit_tokens},
                    "observation": {"count": observation_count, "tokens": observation_tokens},
                },
            }
        )
    parts.append({"key": "messages", "label": "Tin nhắn", "tokens": messages, "count": in_window, "limit": history_limit})

    return {
        "model": model,
        "window": window or context_window(model),
        "budget": budget,
        "used": system + memory_tokens + messages,
        "parts": parts,
        "reserved": reserved,
        "omitted": omitted,
        "last_turn": last_turn,
    }
