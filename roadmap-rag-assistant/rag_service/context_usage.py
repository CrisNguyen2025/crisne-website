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

# Budget slots. A roadmap document is a title, its description and a 300-character content summary
# (domains/roadmap/profile.py), so 1200 characters covers one with room to spare.
DOCUMENT_BUDGET_CHARS = 1200
QUERY_MAX_CHARS = 2000  # api/schemas.py ChatRequest.message
OUTPUT_RESERVE_TOKENS = 2048  # room kept for the reply; no max_tokens is set on the model
# Tags and attributes around each history message ('<turn role="assistant">…</turn>')
TURN_OVERHEAD_CHARS = 32

_FLAGS = re.DOTALL | re.MULTILINE
# Blocks are matched only where a tag stands on its own line: the rules mention "<context>" inside a
# sentence, and that mention belongs to the system prompt. The optional line before a block is its note.
# Data inside a block cannot fake a closing tag ("</" is escaped by context.py).
_HISTORY = re.compile(r"(?:^[^\n]*\n)?^<conversation_history>$.*?^</conversation_history>$", _FLAGS)
_CONTEXT = re.compile(r"^<context>$.*?^</context>$", _FLAGS)
_QUERY = re.compile(r"(?:^[^\n]*\n)?^<user_query>$.*?^</user_query>$", _FLAGS)

# What the last answer of each thread actually sent, for the "last answer" section
_last_turns: BoundedStore[dict] = BoundedStore()


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
    """The prompt's text by part: system (everything else), history, retrieved, message."""
    history, rest = _take(_HISTORY, prompt)
    retrieved, rest = _take(_CONTEXT, rest)
    message, system = _take(_QUERY, rest)
    return {"system": system, "history": history, "retrieved": retrieved, "message": message}


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


def conversation_context(
    thread_id: str,
    profile: DomainProfile,
    *,
    model: str,
    window: Optional[int] = None,
    history: HistoryStore = history_store,
) -> dict[str, Any]:
    """What the next answer of `thread_id` carries, against Abot's budget."""
    # The answer prompt with no documents and no question: exactly what is in context between turns
    texts = split_prompt(build_prompt(GenerationRequest(mode="rag", query="", thread_id=thread_id), profile, history))
    system = estimate_tokens(texts["system"])
    messages = estimate_tokens(texts["history"])
    history_limit = profile.history_turns * 2
    in_window = texts["history"].count("<turn ")
    # The store keeps at most 50 messages per thread, so this reads the whole thread
    outside = max(len(history.get_recent(thread_id, 1000)) - in_window, 0)

    history_cap = math.ceil(history_limit * (profile.history_max_chars + TURN_OVERHEAD_CHARS) / CHARS_PER_TOKEN)
    reserved = [
        {"key": "retrieved", "label": "Tài liệu truy xuất",
         "tokens": math.ceil(profile.max_documents * DOCUMENT_BUDGET_CHARS / CHARS_PER_TOKEN), "count": profile.max_documents},
        {"key": "message", "label": "Câu hỏi kế tiếp", "tokens": math.ceil(QUERY_MAX_CHARS / CHARS_PER_TOKEN)},
        {"key": "output", "label": "Câu trả lời", "tokens": OUTPUT_RESERVE_TOKENS},
    ]
    budget = system + history_cap + sum(r["tokens"] for r in reserved)

    omitted = []
    if outside:
        omitted.append({"key": "history_outside", "label": "Tin nhắn ngoài cửa sổ", "count": outside})
    last_turn = _last_turns.get(thread_id)
    if last_turn and last_turn["dropped_documents"]:
        omitted.append({"key": "retrieved_dropped", "label": "Tài liệu bị loại (lượt gần nhất)",
                        "count": last_turn["dropped_documents"]})

    return {
        "model": model,
        "window": window or context_window(model),
        "budget": budget,
        "used": system + messages,
        "parts": [
            {"key": "system", "label": "System prompt", "tokens": system},
            {"key": "messages", "label": "Tin nhắn", "tokens": messages, "count": in_window, "limit": history_limit},
        ],
        "reserved": reserved,
        "omitted": omitted,
        "last_turn": last_turn,
    }
