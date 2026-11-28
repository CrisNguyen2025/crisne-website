from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from news_worker.config import Settings
from news_worker.ssrf import assert_public_url_async


OEMBED_ENDPOINT = "https://www.tiktok.com/oembed"
TIKTOK_HOSTS = frozenset({"tiktok.com", "www.tiktok.com", "m.tiktok.com"})
PHOTO_PATH_RE = re.compile(r"^/(@[\w.-]+)/photo/(\d+)/?$")
REHYDRATION_SCRIPT_RE = re.compile(
    r'<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
    re.DOTALL,
)
PAGE_TIMEOUT_SECONDS = 15.0
MAX_PAGE_BYTES = 5 * 1024 * 1024
MAX_PAGE_REDIRECTS = 3
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
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


async def _post_fallback_api(url: str, settings: Settings) -> dict[str, Any] | None:
    endpoint = settings.tiktok_fallback_api_url.strip()
    if not endpoint:
        return None

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
    return payload if isinstance(payload, dict) else None


async def resolve_tiktok_via_fallback_api(url: str, settings: Settings) -> str | None:
    try:
        payload = await _post_fallback_api(url, settings)
        if payload is None:
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


async def _filter_public_urls(urls: list[str]) -> list[str]:
    public: list[str] = []
    for candidate in urls:
        try:
            await assert_public_url_async(candidate)
        except Exception:  # noqa: S112 -- skip non-public image URLs, keep the rest
            continue
        public.append(candidate)
    return public


async def resolve_tiktok_photos_via_fallback_api(url: str, settings: Settings) -> list[str]:
    try:
        payload = await _post_fallback_api(url, settings)
        if payload is None or str(payload.get("status") or "").lower() != "picker":
            return []
        items = payload.get("picker")
        if not isinstance(items, list):
            return []
        photo_urls = [
            str(item.get("url") or "").strip()
            for item in items
            if isinstance(item, dict) and item.get("type") == "photo"
        ]
        photo_urls = [u for u in photo_urls if u][: settings.max_photo_images]
        return await _filter_public_urls(photo_urls)
    except Exception:
        return []


def photo_url_to_video_url(url: str) -> str | None:
    parsed = urlparse(url)
    if (parsed.hostname or "").lower() not in TIKTOK_HOSTS:
        return None
    match = PHOTO_PATH_RE.match(parsed.path)
    if not match:
        return None
    user, item_id = match.groups()
    return f"https://www.tiktok.com/{user}/video/{item_id}"


def _first_url(image: Any) -> str | None:
    if not isinstance(image, dict):
        return None
    image_url = image.get("imageURL")
    url_list = image_url.get("urlList") if isinstance(image_url, dict) else None
    if not isinstance(url_list, list) or not url_list:
        return None
    first = url_list[0]
    if not isinstance(first, str):
        return None
    return first.strip() or None


def parse_photo_image_urls(html: str, limit: int) -> list[str]:
    match = REHYDRATION_SCRIPT_RE.search(html)
    if not match:
        return []
    try:
        data: Any = json.loads(match.group(1))
        item = data["__DEFAULT_SCOPE__"]["webapp.video-detail"]["itemInfo"]["itemStruct"]
        images = item["imagePost"]["images"]
    except (ValueError, KeyError, TypeError):
        return []
    if not isinstance(images, list):
        return []
    urls = [u for u in (_first_url(image) for image in images) if u]
    return urls[: max(limit, 0)]


async def _fetch_page_html(url: str, settings: Settings) -> str:
    proxy_url = settings.media_proxy_url.strip()
    current = url
    async with httpx.AsyncClient(
        timeout=PAGE_TIMEOUT_SECONDS,
        follow_redirects=False,
        headers=BROWSER_HEADERS,
        proxy=proxy_url or None,
    ) as client:
        for _ in range(MAX_PAGE_REDIRECTS + 1):
            await assert_public_url_async(current)
            async with client.stream("GET", current) as response:
                if 300 <= response.status_code < 400:
                    location = response.headers.get("location")
                    if not location:
                        break
                    current = urljoin(current, location)
                    continue
                response.raise_for_status()
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_PAGE_BYTES:
                        raise RuntimeError("Trang TikTok vượt giới hạn kích thước tải (5MB).")
                return body.decode("utf-8", errors="replace")
    raise RuntimeError("Quá nhiều redirect khi tải trang TikTok.")


async def fetch_tiktok_photo_image_urls(video_url: str, settings: Settings) -> list[str]:
    try:
        html = await _fetch_page_html(video_url, settings)
    except Exception:
        return []
    return await _filter_public_urls(parse_photo_image_urls(html, settings.max_photo_images))
