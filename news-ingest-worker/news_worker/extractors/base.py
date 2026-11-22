from __future__ import annotations

import re
from dataclasses import dataclass

from news_worker.schemas import ExtractionMethod


URL_PATTERN = re.compile(r"https?://\S+")
HASHTAG_PATTERN = re.compile(r"(?:^|\s)[#@][\w.\-]+")
WHITESPACE_PATTERN = re.compile(r"\s+")


@dataclass
class ExtractionResult:
    text: str
    method: ExtractionMethod
    title: str | None = None
    author: str | None = None
    thumbnail_url: str | None = None
    published_at: str | None = None
    error: str | None = None


def clean_meaningful_text(raw: str | None) -> str:
    """Removes bare URLs, hashtags/mentions, and extra whitespace to measure real signal."""
    if not raw:
        return ""
    without_urls = URL_PATTERN.sub(" ", raw)
    without_tags = HASHTAG_PATTERN.sub(" ", without_urls)
    return WHITESPACE_PATTERN.sub(" ", without_tags).strip()


def has_meaningful_text(raw: str | None, min_chars: int = 300) -> bool:
    return len(clean_meaningful_text(raw)) >= min_chars


def count_meaningful_words(raw: str | None) -> int:
    cleaned = clean_meaningful_text(raw)
    if not cleaned:
        return 0
    return len([w for w in cleaned.split(" ") if len(w) >= 2])
