from __future__ import annotations

import httpx

from news_worker.client import NextJsJobClient
from news_worker.config import Settings
from news_worker.extractors.pipeline import extract_content
from news_worker.schemas import (
    ClaimedJob,
    JobCompleteFailedPayload,
    JobCompletePartialPayload,
    JobCompleteReadyPayload,
)
from news_worker.summarizer import summarize_content


def _is_stale_job_conflict(exc: BaseException) -> bool:
    """Next.js answers 409 when this attempt no longer owns the job (lease reclaimed or reingested)."""
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 409


async def process_single_job(
    job: ClaimedJob,
    client: NextJsJobClient,
    settings: Settings,
) -> str:
    try:
        extraction = await extract_content(job, settings)
        if not extraction.text.strip() or extraction.method == "metadata_only":
            await client.complete_job(
                job.jobId,
                JobCompletePartialPayload(
                    attempt=job.attempts,
                    extractionError=extraction.error or "Không trích xuất được nội dung.",
                    title=extraction.title,
                    author=extraction.author,
                    thumbnailUrl=extraction.thumbnail_url,
                    publishedAt=extraction.published_at,
                    extractionMethod="metadata_only",
                ),
            )
            return "partial"

        summary = await summarize_content(
            job=job,
            extracted_text=extraction.text,
            settings=settings,
            fallback_title=extraction.title,
        )
        await client.complete_job(
            job.jobId,
            JobCompleteReadyPayload(
                attempt=job.attempts,
                summary=summary,
                extractionMethod=extraction.method,
                author=extraction.author,
                thumbnailUrl=extraction.thumbnail_url,
                publishedAt=extraction.published_at,
            ),
        )
        return "ready"
    except Exception as exc:
        if _is_stale_job_conflict(exc):
            # Another attempt owns the job now; reporting a failure would clobber its result
            return "stale"
        message = str(exc).strip()[:500] or "Lỗi xử lý worker"
        try:
            await client.complete_job(
                job.jobId,
                JobCompleteFailedPayload(attempt=job.attempts, error=message, retryable=True),
            )
        except Exception:
            pass
        return "failed"
