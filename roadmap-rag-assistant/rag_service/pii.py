"""Mask emails and phone numbers before traces leave the service.

Same patterns as lib/ai/pii-mask.ts in the Next.js app; keep the two in sync.
"""

from __future__ import annotations

import re
from typing import Any

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Vietnamese numbers: 0xxx / 84xxx / +84xxx, 9–11 digits, optional space/dot/dash separators.
# Must start with 0 or 84 directly followed by 1–9, so decimals like retrieval scores (0.8067…) never match.
VN_PHONE_PATTERN = re.compile(r"(?<![\w.+])(?:\+?84|0)[1-9](?:[\s.-]?\d){7,9}(?!\d)")

# Other international numbers written with a leading "+"
INTL_PHONE_PATTERN = re.compile(r"(?<![\w.])\+\d{1,3}(?:[\s.-]?\d){7,12}(?!\d)")


def mask_pii(text: str) -> str:
    text = EMAIL_PATTERN.sub("[email]", text)
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
