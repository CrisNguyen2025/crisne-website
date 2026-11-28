from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from news_worker.config import Settings
from news_worker.extractors import media

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 16
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"0" * 8


def _fake_ydl(info: dict[str, Any]) -> MagicMock:
    ydl = MagicMock()
    ydl.extract_info.return_value = info
    ydl.__enter__.return_value = ydl
    ydl.__exit__.return_value = None
    return MagicMock(return_value=ydl)


@pytest.mark.parametrize(
    ("formats", "expected"),
    [
        ([{"format_id": "audio", "vcodec": "none", "acodec": "mp3"}], True),
        ([{"format_id": "h264", "vcodec": "h264"}, {"vcodec": "none"}], False),
        ([], False),
        (None, False),
    ],
)
def test_fetch_video_metadata_reports_audio_only(
    monkeypatch: pytest.MonkeyPatch, formats: Any, expected: bool
) -> None:
    monkeypatch.setattr(media, "assert_public_url", lambda _url: None)
    monkeypatch.setattr(media.yt_dlp, "YoutubeDL", _fake_ydl({"title": "t", "formats": formats}))
    meta = media._fetch_video_metadata_sync("https://www.tiktok.com/@dev/video/1")
    assert meta["is_audio_only"] is expected
    assert meta["title"] == "t"


def test_detect_image_mime() -> None:
    assert media._detect_image_mime(JPEG) == "image/jpeg"
    assert media._detect_image_mime(PNG) == "image/png"
    assert media._detect_image_mime(WEBP) == "image/webp"
    assert media._detect_image_mime(b"GIF89a") is None


def test_photo_post_vision_skips_broken_images(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    payloads = {"https://cdn/1.jpg": JPEG, "https://cdn/3.png": PNG, "https://cdn/4.gif": b"GIF89a"}

    def fake_download(url: str, dest: Path, settings: Settings | None = None) -> Path:
        if url not in payloads:
            raise RuntimeError("404")
        dest.write_bytes(payloads[url])
        return dest

    captured: dict[str, Any] = {}

    def fake_ask(prompt: str, images: list[tuple[bytes, str]], settings: Settings) -> str:
        captured["images"] = images
        return "Ảnh 1: METR 2025"

    monkeypatch.setattr(media, "_download_direct_media_sync", fake_download)
    monkeypatch.setattr(media, "_ask_gemini_vision", fake_ask)

    text = media._extract_photo_post_vision_sync(
        ["https://cdn/1.jpg", "https://cdn/2.jpg", "https://cdn/3.png", "https://cdn/4.gif"],
        str(tmp_path),
        Settings(gemini_api_key="k"),
    )
    assert text == "Ảnh 1: METR 2025"
    assert [mime for _, mime in captured["images"]] == ["image/jpeg", "image/png"]


def test_photo_post_vision_raises_when_no_image(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def failing_download(url: str, dest: Path, settings: Settings | None = None) -> Path:
        raise RuntimeError("403")

    monkeypatch.setattr(media, "_download_direct_media_sync", failing_download)
    with pytest.raises(RuntimeError, match=r"\[PHOTO_POST\]"):
        media._extract_photo_post_vision_sync(
            ["https://cdn/1.jpg"], str(tmp_path), Settings(gemini_api_key="k")
        )


def test_photo_post_vision_respects_image_limit(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    downloaded: list[str] = []

    def fake_download(url: str, dest: Path, settings: Settings | None = None) -> Path:
        downloaded.append(url)
        dest.write_bytes(JPEG)
        return dest

    monkeypatch.setattr(media, "_download_direct_media_sync", fake_download)
    monkeypatch.setattr(media, "_ask_gemini_vision", lambda *_args: "ok")
    media._extract_photo_post_vision_sync(
        [f"https://cdn/{i}.jpg" for i in range(5)],
        str(tmp_path),
        Settings(gemini_api_key="k", max_photo_images=2),
    )
    assert downloaded == ["https://cdn/0.jpg", "https://cdn/1.jpg"]
