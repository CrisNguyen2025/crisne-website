from __future__ import annotations

import asyncio
from urllib.parse import urljoin

import httpx
import trafilatura

from news_worker.extractors.base import ExtractionResult
from news_worker.ssrf import assert_public_url


MAX_HTML_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 5


async def _safe_fetch_html(url: str) -> tuple[str, str]:
    current = url
    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=False,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; CrisneNewsBot/1.0; +https://crisne.blog)"
        },
    ) as client:
        for _ in range(MAX_REDIRECTS + 1):
            assert_public_url(current)
            response = await client.get(current)
            if 300 <= response.status_code < 400:
                location = response.headers.get("location")
                if not location:
                    break
                current = urljoin(current, location)
                continue
            response.raise_for_status()
            content = response.content[:MAX_HTML_BYTES]
            encoding = response.encoding or "utf-8"
            return content.decode(encoding, errors="replace"), current
    raise RuntimeError("Too many redirects while fetching article")


def _extract_sync(html: str, final_url: str) -> ExtractionResult:
    extracted = trafilatura.extract(
        html,
        url=final_url,
        include_comments=False,
        include_tables=True,
        favor_precision=True,
    )
    meta = trafilatura.extract_metadata(html, default_url=final_url)

    title = meta.title if meta and meta.title else None
    author = meta.author if meta and meta.author else None
    thumbnail_url = meta.image if meta and meta.image else None
    published_at = meta.date if meta and meta.date else None

    if extracted and extracted.strip():
        return ExtractionResult(
            text=extracted.strip(),
            method="article",
            title=title,
            author=author,
            thumbnail_url=thumbnail_url,
            published_at=published_at,
        )

    return ExtractionResult(
        text="",
        method="metadata_only",
        title=title,
        author=author,
        thumbnail_url=thumbnail_url,
        published_at=published_at,
        error="Không trích xuất được nội dung chính từ bài viết.",
    )


async def extract_article(url: str) -> ExtractionResult:
    try:
        html, final_url = await _safe_fetch_html(url)
        return await asyncio.to_thread(_extract_sync, html, final_url)
    except Exception as exc:
        return ExtractionResult(
            text="",
            method="metadata_only",
            error=f"Lỗi tải bài viết: {exc}",
        )
