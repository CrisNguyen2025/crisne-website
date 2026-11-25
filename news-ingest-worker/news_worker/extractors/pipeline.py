from __future__ import annotations

import asyncio
import shutil
import tempfile

from news_worker.config import Settings
from news_worker.extractors import article, media, tiktok, youtube
from news_worker.extractors.base import (
    ExtractionResult,
    count_meaningful_words,
    has_meaningful_text,
)
from news_worker.schemas import ClaimedJob

MEDIA_TIER_TIMEOUT_SECONDS = 180.0


async def _extract_video_tiers(
    url: str,
    job_id: str,
    settings: Settings,
    title: str | None,
    author: str | None,
    thumbnail_url: str | None,
    published_at: str | None,
    errors: list[str],
    duration: float | None,
    media_url: str | None = None,
) -> ExtractionResult:
    tmp_dir = tempfile.mkdtemp(prefix=f"news-{job_id}-")
    try:
        # Tier 2: Audio transcript via Groq Whisper
        try:
            transcript = await asyncio.wait_for(
                media.transcribe_audio_with_whisper(
                    url, tmp_dir, settings, duration=duration, media_url=media_url
                ),
                timeout=MEDIA_TIER_TIMEOUT_SECONDS,
            )
            if count_meaningful_words(transcript) >= settings.min_transcript_words:
                return ExtractionResult(
                    text=transcript,
                    method="whisper",
                    title=title,
                    author=author,
                    thumbnail_url=thumbnail_url,
                    published_at=published_at,
                )
            if transcript:
                errors.append("Transcript audio quá ngắn, chuyển sang đọc frame.")
        except Exception as exc:
            errors.append(f"Whisper: {exc}")

        # Tier 3: Keyframe / slide extraction via Gemini Vision
        try:
            vision_text = await asyncio.wait_for(
                media.extract_slides_with_vision(
                    url, tmp_dir, settings, duration=duration, media_url=media_url
                ),
                timeout=MEDIA_TIER_TIMEOUT_SECONDS,
            )
            if vision_text.strip():
                return ExtractionResult(
                    text=vision_text.strip(),
                    method="vision",
                    title=title,
                    author=author,
                    thumbnail_url=thumbnail_url,
                    published_at=published_at,
                )
            errors.append("Vision không đọc được chữ/nội dung trên frame.")
        except Exception as exc:
            errors.append(f"Vision: {exc}")

        return ExtractionResult(
            text="",
            method="metadata_only",
            title=title,
            author=author,
            thumbnail_url=thumbnail_url,
            published_at=published_at,
            error=" | ".join(errors) if errors else "Không trích xuất được nội dung video.",
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def extract_content(job: ClaimedJob, settings: Settings) -> ExtractionResult:
    url = job.canonicalUrl

    if job.platform in {"article", "rss"}:
        return await article.extract_article(url)

    errors: list[str] = []
    title: str | None = None
    author: str | None = None
    thumbnail_url: str | None = None
    published_at: str | None = None
    description = ""
    duration: float | None = None
    media_url: str | None = None

    if job.platform == "youtube":
        oembed = await youtube.fetch_youtube_oembed(url)
        title = oembed.get("title") or title
        author = oembed.get("author") or author
        thumbnail_url = oembed.get("thumbnail_url") or thumbnail_url

        video_id = youtube.extract_youtube_video_id(url)
        if video_id and not job.forceDeep:
            captions = await youtube.fetch_youtube_captions(video_id)
            if has_meaningful_text(captions, settings.min_description_chars):
                return ExtractionResult(
                    text=captions or "",
                    method="captions",
                    title=title,
                    author=author,
                    thumbnail_url=thumbnail_url,
                    published_at=published_at,
                )
    elif job.platform == "tiktok":
        oembed = await tiktok.fetch_tiktok_oembed(url)
        title = oembed.get("title") or title
        author = oembed.get("author") or author
        thumbnail_url = oembed.get("thumbnail_url") or thumbnail_url

    try:
        meta = await media.fetch_video_metadata(url, settings=settings)
        title = meta.get("title") or title
        author = meta.get("author") or author
        thumbnail_url = meta.get("thumbnail_url") or thumbnail_url
        published_at = meta.get("published_at") or published_at
        description = str(meta.get("description") or "")
        raw_duration = meta.get("duration")
        duration = float(raw_duration) if isinstance(raw_duration, (int, float)) else None
    except Exception as exc:
        if job.platform == "tiktok" and tiktok.is_permanent_media_block_error(exc):
            if not job.forceDeep and has_meaningful_text(title, settings.min_description_chars):
                return ExtractionResult(
                    text=(title or "").strip(),
                    method="description",
                    title=title,
                    author=author,
                    thumbnail_url=thumbnail_url,
                    published_at=published_at,
                )
            media_url = await tiktok.resolve_tiktok_via_fallback_api(url, settings)
            if not media_url:
                return ExtractionResult(
                    text="",
                    method="metadata_only",
                    title=title,
                    author=author,
                    thumbnail_url=thumbnail_url,
                    published_at=published_at,
                    error=tiktok.format_blocked_error(exc),
                )
        else:
            errors.append(f"Metadata: {exc}")

    if not job.forceDeep and has_meaningful_text(description, settings.min_description_chars):
        return ExtractionResult(
            text=description.strip(),
            method="description",
            title=title,
            author=author,
            thumbnail_url=thumbnail_url,
            published_at=published_at,
        )

    return await _extract_video_tiers(
        url=url,
        job_id=job.jobId,
        settings=settings,
        title=title,
        author=author,
        thumbnail_url=thumbnail_url,
        published_at=published_at,
        errors=errors,
        duration=duration,
        media_url=media_url,
    )
