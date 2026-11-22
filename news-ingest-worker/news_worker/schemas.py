from __future__ import annotations

from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator

# Limits mirror the Zod schemas in lib/news/schemas.ts; a payload that exceeds them is rejected
# with HTTP 400 and the job burns its retries, so values are trimmed here instead.
MAX_TITLE_CHARS = 240
MAX_AUTHOR_CHARS = 120
MAX_ERROR_CHARS = 500
MIN_TAKEAWAY_CHARS = 5
MAX_TAKEAWAY_CHARS = 240
MAX_TAGS = 5

# Exactly one content-type tag leads the tag list so the Owner can filter tips from news.
# Keep in sync with NEWS_CONTENT_TYPE_TAGS in lib/news/content-type.ts.
ContentType = Literal["tip", "tutorial", "tin-moi", "quan-diem"]
CONTENT_TYPE_TAGS: tuple[str, ...] = ("tip", "tutorial", "tin-moi", "quan-diem")


def _clip(value: object, limit: int) -> object:
    if isinstance(value, str):
        return value.strip()[:limit]
    return value


def _clip_optional(value: object, limit: int) -> object:
    if isinstance(value, str):
        cleaned = value.strip()[:limit]
        return cleaned or None
    return value


def _http_url_or_none(value: object) -> object:
    if isinstance(value, str):
        cleaned = value.strip()
        if urlparse(cleaned).scheme in {"http", "https"} and urlparse(cleaned).netloc:
            return cleaned
        return None
    return value


ExtractionMethod = Literal[
    "description",
    "article",
    "captions",
    "whisper",
    "vision",
    "metadata_only",
]


class ClaimedJob(BaseModel):
    jobId: str
    newsItemId: str
    sourceUrl: str
    canonicalUrl: str
    domain: str
    platform: Literal["youtube", "tiktok", "article", "rss"]
    origin: Literal["cron", "share", "manual"]
    forceDeep: bool = False
    attempts: int = 1


class NewsSummaryOutput(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    tldr: str = Field(min_length=10, max_length=400)
    takeaways: list[str] = Field(min_length=1, max_length=6)
    tags: list[str] = Field(min_length=1, max_length=MAX_TAGS)
    language: Literal["vi", "en", "other"]
    # Merged into `tags` below and left out of the payload sent to Next.js
    contentType: ContentType | None = Field(default=None, exclude=True)

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()[:180]
        return value

    @field_validator("tldr", mode="before")
    @classmethod
    def trim_tldr(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()[:400]
        return value

    @field_validator("takeaways", mode="before")
    @classmethod
    def normalize_takeaways(cls, value: object) -> object:
        if isinstance(value, list):
            cleaned = [
                str(item).strip()[:MAX_TAKEAWAY_CHARS]
                for item in value
                if len(str(item).strip()) >= MIN_TAKEAWAY_CHARS
            ]
            return cleaned[:6]
        return value

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: object) -> object:
        if isinstance(value, list):
            seen: set[str] = set()
            result: list[str] = []
            for raw in value:
                cleaned = str(raw).strip().lower()[:32]
                if cleaned and cleaned not in seen:
                    seen.add(cleaned)
                    result.append(cleaned)
                if len(result) >= MAX_TAGS:
                    break
            return result
        return value

    @model_validator(mode="after")
    def lead_with_one_content_type(self) -> "NewsSummaryOutput":
        type_tags = [tag for tag in self.tags if tag in CONTENT_TYPE_TAGS]
        content_type = self.contentType or (type_tags[0] if type_tags else None)
        topic_tags = [tag for tag in self.tags if tag not in CONTENT_TYPE_TAGS]
        if content_type is None:
            self.tags = topic_tags[:MAX_TAGS] or self.tags
            return self
        self.tags = [content_type, *topic_tags][:MAX_TAGS]
        return self


class JobCompleteReadyPayload(BaseModel):
    outcome: Literal["ready"] = "ready"
    attempt: int | None = None
    summary: NewsSummaryOutput
    extractionMethod: ExtractionMethod
    author: str | None = None
    thumbnailUrl: str | None = None
    publishedAt: str | None = None

    @field_validator("author", mode="before")
    @classmethod
    def clip_author(cls, value: object) -> object:
        return _clip_optional(value, MAX_AUTHOR_CHARS)

    @field_validator("thumbnailUrl", mode="before")
    @classmethod
    def clean_thumbnail(cls, value: object) -> object:
        return _http_url_or_none(value)


class JobCompletePartialPayload(BaseModel):
    outcome: Literal["partial"] = "partial"
    attempt: int | None = None
    extractionError: str = Field(min_length=1, max_length=MAX_ERROR_CHARS)
    title: str | None = None
    author: str | None = None
    thumbnailUrl: str | None = None
    publishedAt: str | None = None
    extractionMethod: ExtractionMethod = "metadata_only"

    @field_validator("extractionError", mode="before")
    @classmethod
    def clip_extraction_error(cls, value: object) -> object:
        return _clip(value, MAX_ERROR_CHARS)

    @field_validator("title", mode="before")
    @classmethod
    def clip_title(cls, value: object) -> object:
        return _clip_optional(value, MAX_TITLE_CHARS)

    @field_validator("author", mode="before")
    @classmethod
    def clip_author(cls, value: object) -> object:
        return _clip_optional(value, MAX_AUTHOR_CHARS)

    @field_validator("thumbnailUrl", mode="before")
    @classmethod
    def clean_thumbnail(cls, value: object) -> object:
        return _http_url_or_none(value)


class JobCompleteFailedPayload(BaseModel):
    outcome: Literal["failed"] = "failed"
    attempt: int | None = None
    error: str = Field(min_length=1, max_length=MAX_ERROR_CHARS)
    retryable: bool = True

    @field_validator("error", mode="before")
    @classmethod
    def clip_error(cls, value: object) -> object:
        return _clip(value, MAX_ERROR_CHARS)


JobCompletePayload = JobCompleteReadyPayload | JobCompletePartialPayload | JobCompleteFailedPayload
