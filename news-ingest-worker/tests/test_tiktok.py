from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from news_worker.config import Settings
from news_worker.extractors import tiktok


def test_extract_tiktok_author_from_url() -> None:
    assert (
        tiktok.extract_tiktok_author_from_url(
            "https://tiktok.com/@tv360.bongda/video/7711882164685573382"
        )
        == "@tv360.bongda"
    )
    assert tiktok.extract_tiktok_author_from_url("https://tiktok.com/@_/video/123") is None
    assert tiktok.extract_tiktok_author_from_url("https://tiktok.com/discover") is None


def test_block_error_classifiers_and_formatter() -> None:
    msg = "ERROR: [TikTok] 7711882164685573382: Your IP address is blocked from accessing this post"
    assert tiktok.is_ip_or_geo_block_error(msg) is True
    assert tiktok.is_permanent_media_block_error(msg) is True
    assert tiktok.format_blocked_error(msg).startswith("[IP_BLOCKED] ")

    private_msg = "ERROR: [TikTok] 123: This post is a private post"
    assert tiktok.is_ip_or_geo_block_error(private_msg) is False
    assert tiktok.is_permanent_media_block_error(private_msg) is True
    assert tiktok.format_blocked_error(private_msg) == private_msg


async def test_fetch_tiktok_oembed_falls_back_to_url_author_when_fields_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"version": "1.0", "type": "video", "html": "<iframe></iframe>"}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_: mock_client)

    meta = await tiktok.fetch_tiktok_oembed(
        "https://tiktok.com/@tv360.bongda/video/7711882164685573382"
    )

    assert meta["author"] == "@tv360.bongda"
    assert meta["title"] is None
    assert meta["thumbnail_url"] is None


async def test_resolve_tiktok_via_fallback_api_validates_public_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(tiktok_fallback_api_url="https://resolver.example.com/api/json")
    checked_urls: list[str] = []

    async def fake_ssrf(url: str) -> None:
        checked_urls.append(url)
        if "127.0.0.1" in url:
            raise ValueError("private")

    monkeypatch.setattr(tiktok, "assert_public_url_async", fake_ssrf)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "status": "tunnel",
        "url": "https://cdn.example.com/video.mp4",
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_: mock_client)

    resolved = await tiktok.resolve_tiktok_via_fallback_api(
        "https://tiktok.com/@tv360.bongda/video/7711882164685573382",
        settings,
    )
    assert resolved == "https://cdn.example.com/video.mp4"
    assert checked_urls == [
        "https://resolver.example.com/api/json",
        "https://cdn.example.com/video.mp4",
    ]

    mock_resp.json.return_value = {"status": "tunnel", "url": "http://127.0.0.1/secret.mp4"}
    blocked = await tiktok.resolve_tiktok_via_fallback_api(
        "https://tiktok.com/@tv360.bongda/video/7711882164685573382",
        settings,
    )
    assert blocked is None
