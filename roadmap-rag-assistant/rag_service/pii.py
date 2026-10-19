"""Mask secrets, emails, card numbers, ID numbers and phone numbers before text leaves the service.

Same patterns as lib/ai/pii-mask.ts in the Next.js app; keep the two in sync.
"""

from __future__ import annotations

import re
from typing import Any

# API keys and tokens by their well-known prefixes (OpenAI/Anthropic sk-, Langfuse sk-lf-/pk-lf-, Groq gsk_,
# GitHub, Slack, Google AIza, AWS AKIA) plus JWTs. Checked first: they contain digits the number patterns would eat.
SECRET_PATTERN = re.compile(
    r"\b(?:sk-(?:proj-|ant-|lf-)?|pk-lf-|gsk_|ghp_|gho_|ghs_|github_pat_|xox[abposr]-)[A-Za-z0-9_-]{16,}"
    r"|\bAIza[0-9A-Za-z_-]{35}"
    r"|\bAKIA[0-9A-Z]{16}\b"
    r"|\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"
)

# Payment cards: 13–19 digits, optional space/dash groups; masked only when the Luhn checksum holds.
CARD_PATTERN = re.compile(r"(?<![\w.-])\d(?:[ -]?\d){12,18}(?![\w-])")

# Vietnamese citizen ID (CCCD): exactly 12 digits standing alone.
CCCD_PATTERN = re.compile(r"(?<![\w.-])\d{12}(?![\w.-])")

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Vietnamese numbers: 0xxx / 84xxx / +84xxx, 9–11 digits, optional space/dot/dash separators.
# Must start with 0 or 84 directly followed by 1–9, so decimals like retrieval scores (0.8067…) never match.
VN_PHONE_PATTERN = re.compile(r"(?<![\w.+])(?:\+?84|0)[1-9](?:[\s.-]?\d){7,9}(?!\d)")

# Other international numbers written with a leading "+"
INTL_PHONE_PATTERN = re.compile(r"(?<![\w.])\+\d{1,3}(?:[\s.-]?\d){7,12}(?!\d)")


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def _mask_card(m: re.Match) -> str:
    return "[card]" if _luhn_ok(re.sub(r"\D", "", m.group(0))) else m.group(0)


def mask_pii(text: str) -> str:
    text = SECRET_PATTERN.sub("[secret]", text)
    text = EMAIL_PATTERN.sub("[email]", text)
    text = CARD_PATTERN.sub(_mask_card, text)
    text = CCCD_PATTERN.sub("[cccd]", text)
    text = VN_PHONE_PATTERN.sub("[phone]", text)
    return INTL_PHONE_PATTERN.sub("[phone]", text)


def mask_trace_data(*, data: Any, **_: Any) -> Any:
    """Langfuse `mask` hook: applied to every observation's input, output and metadata."""
    if isinstance(data, str):
        return mask_pii(data)
    if isinstance(data, dict):
        return {k: mask_trace_data(data=v) for k, v in data.items()}
    if isinstance(data, (list, tuple)):
        return [mask_trace_data(data=v) for v in data]
    return data
