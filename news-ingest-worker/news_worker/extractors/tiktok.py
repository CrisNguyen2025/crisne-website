from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from news_worker.config import Settings
from news_worker.ssrf import assert_public_url_async


OEMBED_ENDPOINT = "https://www.tiktok.com/oembed"
IP_BLOCK_MARKERS = (
    "your ip address is blocked",
    "person_geo_fencing",
)
PERMANENT_MEDIA_BLOCK_MARKERS = (
    *IP_BLOCK_MARKERS,
    "private post",
    "private account",
    "log into an account",
    "requiring login",
    "video not available",
    "video is unavailable",
    "http error 403",
)


def extract_tiktok_author_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    if parts and parts[0].startswith("@") and len(parts[0]) > 1 and parts[0] != "@_":
        return parts[0]
    return None


def is_ip_or_geo_block_error(exc_or_msg: BaseException | str) -> bool:
    lowered = str(exc_or_msg).lower()
    return any(marker in lowered for marker in IP_BLOCK_MARKERS)


def is_permanent_media_block_error(exc_or_msg: BaseException | str) -> bool:
    lowered = str(exc_or_msg).lower()
    return any(marker in lowered for marker in PERMANENT_MEDIA_BLOCK_MARKERS)


def format_blocked_error(exc_or_msg: BaseException | str) -> str:
    message = str(exc_or_msg).strip()
    if is_ip_or_geo_block_error(message):
        return f"[IP_BLOCKED] {message}"
    return message


async def fetch_tiktok_oembed(url: str) -> dict[str, str | None]:
    fallback_author = extract_tiktok_author_from_url(url)
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(OEMBED_ENDPOINT, params={"url": url})
            if resp.status_code != 200:
                return {"author": fallback_author}
            data = resp.json()
            title = str(data.get("title") or "").strip() or None
            author = str(data.get("author_name") or "").strip() or fallback_author
            thumbnail_url = str(data.get("thumbnail_url") or "").strip() or None
            return {
                "title": title,
                "author": author,
                "thumbnail_url": thumbnail_url,
            }
    except Exception:
        return {"author": fallback_author}


async def resolve_tiktok_via_fallback_api(url: str, settings: Settings) -> str | None:
    endpoint = settings.tiktok_fallback_api_url.strip()
    if not endpoint:
        return None

    try:
        await assert_public_url_async(endpoint)
        headers: dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        api_key = settings.tiktok_fallback_api_key.strip()
        if api_key:
            headers["Authorization"] = f"Api-Key {api_key}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(endpoint, json={"url": url}, headers=headers)
            if resp.status_code != 200:
                return None
            payload: Any = resp.json()

        if not isinstance(payload, dict):
            return None
        status = str(payload.get("status") or "").lower()
        if status == "error":
            return None
        if status and status not in {"tunnel", "redirect", "stream"}:
            return None

        media_url = str(payload.get("url") or "").strip()
        if not media_url:
            return None
        await assert_public_url_async(media_url)
        return media_url
    except Exception:
        return None
