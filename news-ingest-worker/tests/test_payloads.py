from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from news_worker import processor
from news_worker.config import Settings
from news_worker.extractors.base import ExtractionResult
from news_worker.schemas import (
    ClaimedJob,
    JobCompleteFailedPayload,
    JobCompletePartialPayload,
    JobCompleteReadyPayload,
    NewsSummaryOutput,
)


def make_job() -> ClaimedJob:
    return ClaimedJob(
        jobId="job-1",
        newsItemId="news-1",
        sourceUrl="https://github.com/a/b",
        canonicalUrl="https://github.com/a/b",
        domain="github.com",
        platform="article",
        origin="manual",
        attempts=2,
    )


def make_summary(**overrides: object) -> NewsSummaryOutput:
    data: dict[str, object] = {
        "title": "Next.js 16 release notes",
        "tldr": "Next.js 16 ships Turbopack by default.",
        "takeaways": ["Turbopack is now the default bundler"],
        "tags": ["nextjs"],
        "language": "en",
    }
    data.update(overrides)
    return NewsSummaryOutput.model_validate(data)


def test_short_takeaways_are_dropped_to_match_zod_min_length() -> None:
    summary = make_summary(takeaways=["RAG", "  ", "Retrieval improves grounding"])
    assert summary.takeaways == ["Retrieval improves grounding"]


def test_keyword_markers_are_kept_in_takeaways_only() -> None:
    summary = make_summary(
        title="**Next.js 16.4** ra mắt",
        tldr="Bản **v16.4** bật Cache Components mặc định.",
        takeaways=["**Cache Components** thành mặc định"],
    )
    assert summary.title == "Next.js 16.4 ra mắt"
    assert summary.tldr == "Bản v16.4 bật Cache Components mặc định."
    assert summary.takeaways == ["**Cache Components** thành mặc định"]


def test_takeaways_accept_up_to_ten_and_clip_the_rest() -> None:
    points = [f"Concept number {index}" for index in range(1, 13)]
    assert make_summary(takeaways=points[:10]).takeaways == points[:10]
    assert make_summary(takeaways=points).takeaways == points[:10]


def test_ready_payload_clips_author_and_drops_non_http_thumbnail() -> None:
    payload = JobCompleteReadyPayload(
        attempt=2,
        summary=make_summary(),
        extractionMethod="article",
        author="A" * 200,
        thumbnailUrl="data:image/png;base64,xxx",
    )
    assert payload.author is not None and len(payload.author) == 120
    assert payload.thumbnailUrl is None


def test_partial_payload_clips_long_error_and_title() -> None:
    payload = JobCompletePartialPayload(
        extractionError="Whisper: boom | " * 80,
        title="T" * 400,
        author="   ",
    )
    assert len(payload.extractionError) <= 500
    assert payload.title is not None and len(payload.title) == 240
    assert payload.author is None


def test_failed_payload_clips_long_error() -> None:
    payload = JobCompleteFailedPayload(error="x" * 900)
    assert len(payload.error) == 500


def _conflict_error() -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "http://next/api/news/jobs/job-1/complete")
    response = httpx.Response(409, request=request)
    return httpx.HTTPStatusError("conflict", request=request, response=response)


async def test_stale_conflict_does_not_report_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        processor,
        "extract_content",
        AsyncMock(return_value=ExtractionResult(text="Body text " * 50, method="article", title="T")),
    )
    monkeypatch.setattr(processor, "summarize_content", AsyncMock(return_value=make_summary()))
    client = AsyncMock()
    client.complete_job.side_effect = _conflict_error()

    outcome = await processor.process_single_job(make_job(), client, Settings())

    assert outcome == "stale"
    assert client.complete_job.await_count == 1
    sent = client.complete_job.await_args.args[1]
    assert isinstance(sent, JobCompleteReadyPayload)
    assert sent.attempt == 2


async def test_failure_report_carries_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(processor, "extract_content", AsyncMock(side_effect=RuntimeError("boom")))
    client = AsyncMock()

    outcome = await processor.process_single_job(make_job(), client, Settings())

    assert outcome == "failed"
    sent = client.complete_job.await_args.args[1]
    assert isinstance(sent, JobCompleteFailedPayload)
    assert sent.attempt == 2
    assert sent.error == "boom"
