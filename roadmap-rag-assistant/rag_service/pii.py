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
ADDITIONAL_SECRET_PATTERN = re.compile(
    r"\b(?:glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{20,}|ASIA[0-9A-Z]{16})\b"
)
PEM_PRIVATE_KEY_PATTERN = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----")
CREDENTIALED_URL_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9+.-]*://[^\s/@:]+:[^\s/@]+@[^\s/]+")
BEARER_EXTRACT_PATTERN = re.compile(r"\bBearer\s+([^\s\"'`,;)\]<>]+)")
ENV_ASSIGN_EXTRACT_PATTERN = re.compile(r"\b([A-Z][A-Z0-9_]{2,})\s*[:=]\s*[\"']?([^\s\"'`,;)]{12,})")
_SECRET_ENV_KEYWORDS = (
    "SECRET",
    "PASSWORD",
    "PASSWD",
    "API_KEY",
    "ADMIN_KEY",
    "ACCESS_TOKEN",
    "PRIVATE_KEY",
)
_PII_PLACEHOLDER_PATTERN = re.compile(r"\[(?:secret|email|phone|cccd|card)\]")
_TOKEN_CHAR_PATTERN = re.compile(r"^[A-Za-z0-9._~+/=-]+$")

# Payment cards: 13–19 digits, optional space/dash groups; masked only when the Luhn checksum holds.
CARD_PATTERN = re.compile(r"(?<![\w.-])\d(?:[ -]?\d){12,18}(?![\w-])")

# Vietnamese citizen ID (CCCD): exactly 12 digits standing alone.
CCCD_PATTERN = re.compile(r"(?<![\w.-])\d{12}(?![\w.-])")

EMAIL_PATTERN = re.compile(r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")


def _mask_email(m: re.Match) -> str:
    value = m.group(0)
    tld = value.rsplit(".", 1)[-1]
    return "[email]" if len(tld) >= 2 and tld.isalpha() else value

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
    text = EMAIL_PATTERN.sub(_mask_email, text)
    text = CARD_PATTERN.sub(_mask_card, text)
    text = CCCD_PATTERN.sub("[cccd]", text)
    text = VN_PHONE_PATTERN.sub("[phone]", text)
    return INTL_PHONE_PATTERN.sub("[phone]", text)


def _is_high_entropy_bearer_token(token: str) -> bool:
    if not _TOKEN_CHAR_PATTERN.fullmatch(token):
        return False
    if len(token) >= 28:
        return True
    return len(token) >= 16 and any(c.isdigit() for c in token) and any(c.isalpha() for c in token)


def contains_secret(text: str) -> bool:
    """Detect API keys, private keys, credentialed URLs, and high-entropy bearer/env secrets."""
    if not text:
        return False
    if (
        SECRET_PATTERN.search(text)
        or ADDITIONAL_SECRET_PATTERN.search(text)
        or PEM_PRIVATE_KEY_PATTERN.search(text)
        or CREDENTIALED_URL_PATTERN.search(text)
    ):
        return True
    for match in BEARER_EXTRACT_PATTERN.finditer(text):
        if _is_high_entropy_bearer_token(match.group(1)):
            return True
    for match in ENV_ASSIGN_EXTRACT_PATTERN.finditer(text):
        key_name = match.group(1)
        if any(kw in key_name for kw in _SECRET_ENV_KEYWORDS):
            return True
    return False


def has_meaningful_text(text: str) -> bool:
    """Return True if masked text retains enough non-placeholder letters/digits to store."""
    has_placeholder = bool(_PII_PLACEHOLDER_PATTERN.search(text))
    without_placeholders = _PII_PLACEHOLDER_PATTERN.sub("", text)
    meaningful_chars = "".join(ch for ch in without_placeholders if ch.isalnum())
    return len(meaningful_chars) >= (6 if has_placeholder else 3)


def is_placeholder_only(text: str) -> bool:
    """Return True when masked text collapses into placeholders or insufficient content."""
    return not has_meaningful_text(text)


def mask_trace_data(*, data: Any, **_: Any) -> Any:
    """Langfuse `mask` hook: applied to every observation's input, output and metadata."""
    if isinstance(data, str):
        return mask_pii(data)
    if isinstance(data, dict):
        return {k: mask_trace_data(data=v) for k, v in data.items()}
    if isinstance(data, (list, tuple)):
        return [mask_trace_data(data=v) for v in data]
    return data
