"""What one LLM answer put into the model's context, as numbers only (SSE `event: context`).

The prompt is built by core/augmentation/context.py with each kind of input in its own tag, so the split
is read back from those tags. Everything outside the history, documents and query blocks (persona, rules,
notes, suggestion format) is instructions and counts as `system`. Text is never sent, only counts.
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional

# Context window by model-name fragment (first match wins), the denominator of the bar. A model not listed
# gets DEFAULT_WINDOW, a conservative size, so the bar never understates how full the context is.
MODEL_WINDOWS = (("gemini", 1_000_000), ("gpt-oss", 131_072))
DEFAULT_WINDOW = 128_000


def context_window(model: str) -> int:
    name = (model or "").lower()
    return next((size for fragment, size in MODEL_WINDOWS if fragment in name), DEFAULT_WINDOW)


# Rough rule for Latin and Vietnamese text; good enough to size a bar without a tokenizer dependency.
CHARS_PER_TOKEN = 4

PART_LABELS = (
    ("system", "System prompt"),
    ("history", "Lịch sử hội thoại"),
    ("retrieved", "Tài liệu truy xuất"),
    ("message", "Câu hỏi"),
)

_HISTORY = re.compile(r"(?:[^\n]*\n)?<conversation_history>.*?</conversation_history>", re.DOTALL)
_CONTEXT = re.compile(r"<context>.*?</context>", re.DOTALL)
_QUERY = re.compile(r"(?:[^\n]*\n)?<user_query>.*?</user_query>", re.DOTALL)


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN) if text else 0


def _take(pattern: re.Pattern[str], prompt: str) -> tuple[str, str]:
    """The first match of `pattern` and the prompt without it."""
    match = pattern.search(prompt)
    if not match:
        return "", prompt
    return match.group(0), prompt[: match.start()] + prompt[match.end() :]


def build_context_usage(
    prompt: str,
    *,
    model: str,
    usage: Optional[dict[str, Any]] = None,
    window: Optional[int] = None,
) -> dict[str, Any]:
    """Payload of `event: context`. `usage` is the Langfuse-style dict from usage_from_langchain."""
    history, rest = _take(_HISTORY, prompt)
    retrieved, rest = _take(_CONTEXT, rest)
    message, system = _take(_QUERY, rest)
    texts = {"system": system, "history": history, "retrieved": retrieved, "message": message}
    counts = {"history": history.count("<turn "), "retrieved": retrieved.count("<document ")}

    parts = []
    for key, label in PART_LABELS:
        part: dict[str, Any] = {"key": key, "label": label, "tokens": estimate_tokens(texts[key])}
        if key in counts:
            part["count"] = counts[key]
        parts.append(part)

    measured_input = (usage or {}).get("input")
    return {
        "model": model,
        "window": window or context_window(model),
        "input_tokens": int(measured_input) if measured_input is not None else sum(p["tokens"] for p in parts),
        "output_tokens": int((usage or {}).get("output") or 0),
        "measured": measured_input is not None,
        "parts": parts,
    }
