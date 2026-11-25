from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from news_worker.config import Settings
from news_worker.extractors import media, tiktok, youtube
from news_worker.extractors.pipeline import extract_content
from news_worker.schemas import ClaimedJob


def make_job(
    *,
    platform: str = "youtube",
    url: str = "https://youtube.com/watch?v=abc123",
    force_deep: bool = False,
) -> ClaimedJob:
    return ClaimedJob(
        jobId="job-test-1",
        newsItemId="news-test-1",
        sourceUrl=url,
        canonicalUrl=url,
        domain="youtube.com" if platform == "youtube" else "tiktok.com",
        platform=platform,  # type: ignore[arg-type]
        origin="manual",
        forceDeep=force_deep,
        attempts=1,
    )


def make_settings() -> Settings:
    return Settings(
        gemini_api_key="test-gemini",
        groq_api_key="test-groq",
        min_description_chars=300,
        min_transcript_words=40,
    )


async def test_youtube_stops_at_tier1_captions(monkeypatch: pytest.MonkeyPatch) -> None:
    long_captions = " ".join(["Next.js Turbopack builds faster and improves developer workflow."] * 10)
    monkeypatch.setattr(
        youtube,
        "fetch_youtube_oembed",
        AsyncMock(return_value={"title": "Next.js 16", "author": "Vercel", "thumbnail_url": None}),
    )
    monkeypatch.setattr(youtube, "fetch_youtube_captions", AsyncMock(return_value=long_captions))
    whisper_mock = AsyncMock()
    vision_mock = AsyncMock()
    monkeypatch.setattr(media, "transcribe_audio_with_whisper", whisper_mock)
    monkeypatch.setattr(media, "extract_slides_with_vision", vision_mock)

    result = await extract_content(make_job(platform="youtube"), make_settings())

    assert result.method == "captions"
    assert result.title == "Next.js 16"
    whisper_mock.assert_not_called()
    vision_mock.assert_not_called()


async def test_tiktok_ignores_hashtag_spam_description_and_escalates_to_whisper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    hashtag_spam = " ".join(["#ai #coding #trending #fyp https://example.com/promo"] * 20)
    transcript = " ".join(["Đây là đoạn phân tích kiến trúc AI mới vừa ra mắt tuần này."] * 8)

    monkeypatch.setattr(
        tiktok,
        "fetch_tiktok_oembed",
        AsyncMock(return_value={"title": None, "author": "@dev", "thumbnail_url": None}),
    )
    monkeypatch.setattr(
        media,
        "fetch_video_metadata",
        AsyncMock(
            return_value={
                "title": "AI Architecture Clip",
                "author": "@dev",
                "thumbnail_url": None,
                "description": hashtag_spam,
                "duration": 45,
                "published_at": None,
            }
        ),
    )
    monkeypatch.setattr(media, "transcribe_audio_with_whisper", AsyncMock(return_value=transcript))
    vision_mock = AsyncMock()
    monkeypatch.setattr(media, "extract_slides_with_vision", vision_mock)

    result = await extract_content(
        make_job(platform="tiktok", url="https://tiktok.com/@dev/video/123"),
        make_settings(),
    )

    assert result.method == "whisper"
    assert result.text == transcript
    vision_mock.assert_not_called()


async def test_escalates_to_vision_when_whisper_has_too_few_words(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        tiktok,
        "fetch_tiktok_oembed",
        AsyncMock(return_value={"title": None, "author": "@slides", "thumbnail_url": None}),
    )
    monkeypatch.setattr(
        media,
        "fetch_video_metadata",
        AsyncMock(
            return_value={
                "title": "Slide Deck Carousel",
                "author": "@slides",
                "thumbnail_url": None,
                "description": "Short caption",
                "duration": 20,
                "published_at": None,
            }
        ),
    )
    monkeypatch.setattr(
        media,
        "transcribe_audio_with_whisper",
        AsyncMock(return_value="background music only"),
    )
    monkeypatch.setattr(
        media,
        "extract_slides_with_vision",
        AsyncMock(return_value="Slide 1: PostgreSQL vs Turso tradeoffs for serverless Next.js"),
    )

    result = await extract_content(
        make_job(platform="tiktok", url="https://tiktok.com/@slides/video/456"),
        make_settings(),
    )

    assert result.method == "vision"
    assert "Turso" in result.text


async def test_force_deep_bypasses_tier1_captions_and_description(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    long_text = " ".join(["Long transcript content for testing forceDeep flag."] * 15)
    captions_mock = AsyncMock(return_value=long_text)
    monkeypatch.setattr(
        youtube,
        "fetch_youtube_oembed",
        AsyncMock(return_value={"title": "Deep Video", "author": "Cris", "thumbnail_url": None}),
    )
    monkeypatch.setattr(youtube, "fetch_youtube_captions", captions_mock)
    monkeypatch.setattr(
        media,
        "fetch_video_metadata",
        AsyncMock(return_value={"description": long_text, "duration": 60}),
    )
    monkeypatch.setattr(media, "transcribe_audio_with_whisper", AsyncMock(return_value=long_text))

    result = await extract_content(
        make_job(platform="youtube", force_deep=True),
        make_settings(),
    )

    assert result.method == "whisper"
    captions_mock.assert_not_called()


async def test_returns_metadata_only_and_cleans_temp_dir_on_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created_dirs: list[Path] = []
    real_mkdtemp = tempfile.mkdtemp

    def tracking_mkdtemp(*args, **kwargs) -> str:
        path_str = real_mkdtemp(*args, **kwargs)
        created_dirs.append(Path(path_str))
        # Create a dummy media file to verify recursive deletion in finally
        (Path(path_str) / "temp_audio.mp3").write_bytes(b"fake-bytes")
        return path_str

    monkeypatch.setattr(tempfile, "mkdtemp", tracking_mkdtemp)
    monkeypatch.setattr(
        tiktok,
        "fetch_tiktok_oembed",
        AsyncMock(return_value={"title": None, "author": "@creator", "thumbnail_url": None}),
    )
    monkeypatch.setattr(
        media,
        "fetch_video_metadata",
        AsyncMock(
            return_value={
                "title": "Blocked TikTok",
                "author": "@creator",
                "thumbnail_url": "https://cdn.example.com/thumb.jpg",
                "description": "Tiny",
                "duration": 30,
                "published_at": None,
            }
        ),
    )
    monkeypatch.setattr(
        media,
        "transcribe_audio_with_whisper",
        AsyncMock(side_effect=RuntimeError("403 Forbidden")),
    )
    monkeypatch.setattr(
        media,
        "extract_slides_with_vision",
        AsyncMock(side_effect=RuntimeError("Download blocked")),
    )

    result = await extract_content(
        make_job(platform="tiktok", url="https://tiktok.com/@creator/video/999"),
        make_settings(),
    )

    assert result.method == "metadata_only"
    assert result.title == "Blocked TikTok"
    assert result.error is not None
    assert "403 Forbidden" in result.error
    assert len(created_dirs) == 1
    assert not created_dirs[0].exists()


async def test_tiktok_ip_block_fails_fast_preserving_oembed_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        tiktok,
        "fetch_tiktok_oembed",
        AsyncMock(
            return_value={
                "title": "Highlight trận đấu",
                "author": "@tv360.bongda",
                "thumbnail_url": "https://cdn.example.com/thumb.jpg",
            }
        ),
    )
    monkeypatch.setattr(
        media,
        "fetch_video_metadata",
        AsyncMock(
            side_effect=RuntimeError(
                "ERROR: [TikTok] 7711882164685573382: Your IP address is blocked from accessing this post"
            )
        ),
    )
    whisper_mock = AsyncMock()
    vision_mock = AsyncMock()
    monkeypatch.setattr(media, "transcribe_audio_with_whisper", whisper_mock)
    monkeypatch.setattr(media, "extract_slides_with_vision", vision_mock)

    result = await extract_content(
        make_job(
            platform="tiktok",
            url="https://tiktok.com/@tv360.bongda/video/7711882164685573382",
        ),
        make_settings(),
    )

    assert result.method == "metadata_only"
    assert result.title == "Highlight trận đấu"
    assert result.author == "@tv360.bongda"
    assert result.thumbnail_url == "https://cdn.example.com/thumb.jpg"
    assert result.error is not None
    assert result.error.startswith("[IP_BLOCKED]")
    whisper_mock.assert_not_called()
    vision_mock.assert_not_called()


async def test_tiktok_ip_block_uses_fallback_resolver_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    transcript = " ".join(["Bàn thắng mở tỷ số đẹp mắt trong hiệp một trận chung kết."] * 8)
    monkeypatch.setattr(
        tiktok,
        "fetch_tiktok_oembed",
        AsyncMock(return_value={"title": "Bàn thắng", "author": "@tv360.bongda", "thumbnail_url": None}),
    )
    monkeypatch.setattr(
        media,
        "fetch_video_metadata",
        AsyncMock(
            side_effect=RuntimeError(
                "ERROR: [TikTok] 7711882164685573382: Your IP address is blocked from accessing this post"
            )
        ),
    )
    monkeypatch.setattr(
        tiktok,
        "resolve_tiktok_via_fallback_api",
        AsyncMock(return_value="https://cdn.example.com/media.mp4"),
    )
    whisper_mock = AsyncMock(return_value=transcript)
    monkeypatch.setattr(media, "transcribe_audio_with_whisper", whisper_mock)

    settings = Settings(
        gemini_api_key="test-gemini",
        groq_api_key="test-groq",
        tiktok_fallback_api_url="https://resolver.example.com/api",
        min_transcript_words=40,
    )
    result = await extract_content(
        make_job(
            platform="tiktok",
            url="https://tiktok.com/@tv360.bongda/video/7711882164685573382",
        ),
        settings,
    )

    assert result.method == "whisper"
    assert result.text == transcript
    assert whisper_mock.call_args.kwargs.get("media_url") == "https://cdn.example.com/media.mp4"
