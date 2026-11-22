from __future__ import annotations

import asyncio
from urllib.parse import parse_qs, urlparse

import httpx
from youtube_transcript_api import YouTubeTranscriptApi


def extract_youtube_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if host == "youtu.be":
        parts = [p for p in parsed.path.split("/") if p]
        return parts[0] if parts else None

    if host == "youtube.com" or host.endswith(".youtube.com"):
        qs = parse_qs(parsed.query)
        if qs.get("v"):
            return qs["v"][0]
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in {"shorts", "live", "embed"}:
            return parts[1]
    return None


async def fetch_youtube_oembed(url: str) -> dict[str, str | None]:
    oembed_url = "https://www.youtube.com/oembed"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(oembed_url, params={"url": url, "format": "json"})
            if resp.status_code != 200:
                return {}
            data = resp.json()
            return {
                "title": data.get("title"),
                "author": data.get("author_name"),
                "thumbnail_url": data.get("thumbnail_url"),
            }
    except Exception:
        return {}


def _fetch_captions_sync(video_id: str) -> str | None:
    ytt_api = YouTubeTranscriptApi()
    try:
        fetched = ytt_api.fetch(video_id, languages=["vi", "en", "en-US", "en-GB"])
        lines = [snippet.text.strip() for snippet in fetched if getattr(snippet, "text", "").strip()]
        return " ".join(lines) if lines else None
    except Exception:
        return None


async def fetch_youtube_captions(video_id: str) -> str | None:
    return await asyncio.to_thread(_fetch_captions_sync, video_id)
