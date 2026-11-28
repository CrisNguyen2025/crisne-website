from __future__ import annotations

import json
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


def _rehydration_html(images: object) -> str:
    payload = {
        "__DEFAULT_SCOPE__": {
            "webapp.video-detail": {"itemInfo": {"itemStruct": {"imagePost": {"images": images}}}}
        }
    }
    return (
        '<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
        f"{json.dumps(payload)}</script></html>"
    )


def _image(url: str) -> dict[str, object]:
    return {"imageURL": {"urlList": [url, url + "?backup"]}, "imageWidth": 1080}


def test_photo_url_to_video_url() -> None:
    expected = "https://www.tiktok.com/@dev.vn/video/7712881150922247445"
    for host in ("tiktok.com", "www.tiktok.com", "m.tiktok.com"):
        assert (
            tiktok.photo_url_to_video_url(
                f"https://{host}/@dev.vn/photo/7712881150922247445?is_from_webapp=1"
            )
            == expected
        )
    assert tiktok.photo_url_to_video_url("https://tiktok.com/@dev/video/123") is None
    assert tiktok.photo_url_to_video_url("https://tiktok.com/discover") is None
    assert tiktok.photo_url_to_video_url("https://evil.com/@dev/photo/123") is None


def test_parse_photo_image_urls_keeps_order_and_limit() -> None:
    html = _rehydration_html(
        [_image("https://p16.tiktokcdn.com/a.jpeg"), _image("https://p16.tiktokcdn.com/b.jpeg"),
         _image("https://p16.tiktokcdn.com/c.jpeg")]
    )
    assert tiktok.parse_photo_image_urls(html, 10) == [
        "https://p16.tiktokcdn.com/a.jpeg",
        "https://p16.tiktokcdn.com/b.jpeg",
        "https://p16.tiktokcdn.com/c.jpeg",
    ]
    assert len(tiktok.parse_photo_image_urls(html, 2)) == 2


def test_parse_photo_image_urls_handles_bad_shapes() -> None:
    assert tiktok.parse_photo_image_urls("<html></html>", 10) == []
    broken = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{not json</script>'
    assert tiktok.parse_photo_image_urls(broken, 10) == []
    no_detail = (
        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">'
        '{"__DEFAULT_SCOPE__": {"webapp.app-context": {}}}</script>'
    )
    assert tiktok.parse_photo_image_urls(no_detail, 10) == []
    assert tiktok.parse_photo_image_urls(_rehydration_html("oops"), 10) == []
    assert tiktok.parse_photo_image_urls(_rehydration_html([{"imageURL": 1}, 5]), 10) == []


async def test_fetch_tiktok_photo_image_urls_returns_empty_on_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(tiktok, "_fetch_page_html", AsyncMock(side_effect=RuntimeError("403")))
    assert await tiktok.fetch_tiktok_photo_image_urls(
        "https://www.tiktok.com/@dev/video/1", Settings()
    ) == []


async def test_fetch_tiktok_photo_image_urls_drops_non_public_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    html = _rehydration_html(
        [_image("https://p16.tiktokcdn.com/a.jpeg"), _image("http://127.0.0.1/b.jpeg")]
    )
    monkeypatch.setattr(tiktok, "_fetch_page_html", AsyncMock(return_value=html))

    async def fake_ssrf(url: str) -> None:
        if "127.0.0.1" in url:
            raise ValueError("private")

    monkeypatch.setattr(tiktok, "assert_public_url_async", fake_ssrf)
    assert await tiktok.fetch_tiktok_photo_image_urls(
        "https://www.tiktok.com/@dev/video/1", Settings()
    ) == ["https://p16.tiktokcdn.com/a.jpeg"]


async def test_resolve_tiktok_photos_via_fallback_api_reads_picker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(tiktok_fallback_api_url="https://resolver.example.com/api/json")
    monkeypatch.setattr(tiktok, "assert_public_url_async", AsyncMock(return_value=None))
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "status": "picker",
        "picker": [
            {"type": "photo", "url": "https://cdn.example.com/1.jpg"},
            {"type": "video", "url": "https://cdn.example.com/x.mp4"},
            {"type": "photo", "url": "https://cdn.example.com/2.jpg"},
        ],
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_: mock_client)

    photos = await tiktok.resolve_tiktok_photos_via_fallback_api(
        "https://tiktok.com/@dev/photo/1", settings
    )
    assert photos == ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"]
    # The video resolver must keep rejecting picker payloads.
    assert await tiktok.resolve_tiktok_via_fallback_api(
        "https://tiktok.com/@dev/photo/1", settings
    ) is None


async def test_resolve_tiktok_photos_via_fallback_api_without_endpoint() -> None:
    assert await tiktok.resolve_tiktok_photos_via_fallback_api(
        "https://tiktok.com/@dev/photo/1", Settings(tiktok_fallback_api_url="")
    ) == []
