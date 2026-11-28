from __future__ import annotations

import asyncio
import shutil
import tempfile
from dataclasses import dataclass, field
from typing import Any

from news_worker.config import Settings
from news_worker.extractors import article, media, tiktok, youtube
from news_worker.extractors.base import (
    ExtractionResult,
    count_meaningful_words,
    has_meaningful_text,
)
from news_worker.schemas import ClaimedJob, ExtractionMethod

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


async def _try_youtube_oembed_and_captions(
    url: str,
    job: ClaimedJob,
    settings: Settings,
) -> tuple[str | None, str | None, str | None, ExtractionResult | None]:
    oembed = await youtube.fetch_youtube_oembed(url)
    title = oembed.get("title")
    author = oembed.get("author")
    thumbnail_url = oembed.get("thumbnail_url")

    video_id = youtube.extract_youtube_video_id(url)
    if video_id and not job.forceDeep:
        captions = await youtube.fetch_youtube_captions(video_id)
        if has_meaningful_text(captions, settings.min_description_chars):
            return (
                title,
                author,
                thumbnail_url,
                ExtractionResult(
                    text=captions or "",
                    method="captions",
                    title=title,
                    author=author,
                    thumbnail_url=thumbnail_url,
                    published_at=None,
                ),
            )
    return title, author, thumbnail_url, None


async def _handle_metadata_error(
    url: str,
    job: ClaimedJob,
    settings: Settings,
    exc: Exception,
    title: str | None,
    author: str | None,
    thumbnail_url: str | None,
    published_at: str | None,
    errors: list[str],
) -> tuple[str | None, ExtractionResult | None]:
    if job.platform != "tiktok" or not tiktok.is_permanent_media_block_error(exc):
        errors.append(f"Metadata: {exc}")
        return None, None

    if not job.forceDeep and has_meaningful_text(title, settings.min_description_chars):
        return None, ExtractionResult(
            text=(title or "").strip(),
            method="description",
            title=title,
            author=author,
            thumbnail_url=thumbnail_url,
            published_at=published_at,
        )

    media_url = await tiktok.resolve_tiktok_via_fallback_api(url, settings)
    if media_url:
        return media_url, None

    return None, ExtractionResult(
        text="",
        method="metadata_only",
        title=title,
        author=author,
        thumbnail_url=thumbnail_url,
        published_at=published_at,
        error=tiktok.format_blocked_error(exc),
    )


@dataclass
class _MediaInfo:
    title: str | None = None
    author: str | None = None
    thumbnail_url: str | None = None
    published_at: str | None = None
    description: str = ""
    duration: float | None = None
    media_url: str | None = None
    is_audio_only: bool = False
    errors: list[str] = field(default_factory=list)

    def result(
        self, text: str, method: ExtractionMethod, error: str | None = None
    ) -> ExtractionResult:
        return ExtractionResult(
            text=text,
            method=method,
            title=self.title,
            author=self.author,
            thumbnail_url=self.thumbnail_url,
            published_at=self.published_at,
            error=error,
        )


def _apply_metadata(info: _MediaInfo, meta: dict[str, Any]) -> None:
    info.title = meta.get("title") or info.title
    info.author = meta.get("author") or info.author
    info.thumbnail_url = meta.get("thumbnail_url") or info.thumbnail_url
    info.published_at = meta.get("published_at") or info.published_at
    info.description = str(meta.get("description") or "")
    raw_duration = meta.get("duration")
    info.duration = float(raw_duration) if isinstance(raw_duration, (int, float)) else None
    info.is_audio_only = meta.get("is_audio_only") is True


async def _load_media_info(
    url: str,
    lookup_url: str,
    is_photo_url: bool,
    job: ClaimedJob,
    settings: Settings,
) -> tuple[_MediaInfo, ExtractionResult | None]:
    info = _MediaInfo()
    if job.platform == "youtube":
        info.title, info.author, info.thumbnail_url, early = await _try_youtube_oembed_and_captions(
            url, job, settings
        )
        if early is not None:
            return info, early
    elif job.platform == "tiktok":
        oembed = await tiktok.fetch_tiktok_oembed(lookup_url)
        info.title = oembed.get("title")
        info.author = oembed.get("author")
        info.thumbnail_url = oembed.get("thumbnail_url")

    try:
        _apply_metadata(info, await media.fetch_video_metadata(lookup_url, settings=settings))
    except Exception as exc:
        if is_photo_url:
            # Photo posts still have the page HTML / fallback picker to read slides from.
            info.errors.append(f"Metadata: {exc}")
            return info, None
        info.media_url, fallback_result = await _handle_metadata_error(
            url,
            job,
            settings,
            exc,
            info.title,
            info.author,
            info.thumbnail_url,
            info.published_at,
            info.errors,
        )
        if fallback_result is not None:
            return info, fallback_result
    return info, None


def _photo_post_error(message: str, errors: list[str]) -> str:
    combined = " | ".join([*errors, message])
    if any(tiktok.is_ip_or_geo_block_error(err) for err in errors):
        return tiktok.format_blocked_error(combined)
    return combined


async def _extract_tiktok_photo_post(
    url: str,
    lookup_url: str,
    job_id: str,
    settings: Settings,
    info: _MediaInfo,
) -> ExtractionResult:
    image_urls = await tiktok.fetch_tiktok_photo_image_urls(lookup_url, settings)
    if not image_urls:
        image_urls = await tiktok.resolve_tiktok_photos_via_fallback_api(url, settings)
    if not image_urls:
        return info.result(
            "",
            "metadata_only",
            _photo_post_error(
                "[PHOTO_POST] Không lấy được danh sách ảnh của bài ảnh TikTok.", info.errors
            ),
        )

    tmp_dir = tempfile.mkdtemp(prefix=f"news-{job_id}-")
    try:
        vision_text = await asyncio.wait_for(
            media.extract_photo_post_with_vision(image_urls, tmp_dir, settings),
            timeout=MEDIA_TIER_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        info.errors.append(f"Vision: {exc}")
        vision_text = ""
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    vision_text = vision_text.strip()
    if not vision_text:
        return info.result(
            "",
            "metadata_only",
            _photo_post_error("[PHOTO_POST] Vision không đọc được nội dung ảnh.", info.errors),
        )
    caption = (info.description or info.title or "").strip()
    text = f"{caption}\n\n{vision_text}" if caption else vision_text
    return info.result(text, "vision")


async def extract_content(job: ClaimedJob, settings: Settings) -> ExtractionResult:
    url = job.canonicalUrl

    if job.platform in {"article", "rss"}:
        return await article.extract_article(url)

    photo_video_url = tiktok.photo_url_to_video_url(url) if job.platform == "tiktok" else None
    lookup_url = photo_video_url or url
    info, early = await _load_media_info(
        url, lookup_url, photo_video_url is not None, job, settings
    )
    if early is not None:
        return early

    if not job.forceDeep and has_meaningful_text(info.description, settings.min_description_chars):
        return info.result(info.description.strip(), "description")

    if job.platform == "tiktok" and (photo_video_url is not None or info.is_audio_only):
        return await _extract_tiktok_photo_post(url, lookup_url, job.jobId, settings, info)

    return await _extract_video_tiers(
        url=url,
        job_id=job.jobId,
        settings=settings,
        title=info.title,
        author=info.author,
        thumbnail_url=info.thumbnail_url,
        published_at=info.published_at,
        errors=info.errors,
        duration=info.duration,
        media_url=info.media_url,
    )
