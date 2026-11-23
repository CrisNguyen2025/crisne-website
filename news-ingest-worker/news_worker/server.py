from __future__ import annotations

import asyncio
import hmac
from contextlib import asynccontextmanager, suppress
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from news_worker.client import NextJsJobClient
from news_worker.config import Settings, settings
from news_worker.processor import process_single_job


def is_valid_internal_key(provided: str | None, expected: str) -> bool:
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


async def _run_job_with_semaphore(
    semaphore: asyncio.Semaphore,
    job: Any,
    client: NextJsJobClient,
    active_settings: Settings,
) -> None:
    try:
        await process_single_job(job, client, active_settings)
    finally:
        semaphore.release()


async def _worker_loop(
    app: FastAPI,
    active_settings: Settings,
    wake_event: asyncio.Event,
) -> None:
    client = NextJsJobClient(
        base_url=active_settings.nextjs_api_base_url,
        admin_api_key=active_settings.admin_api_key,
    )
    concurrency = max(1, min(active_settings.worker_concurrency, 5))
    semaphore = asyncio.Semaphore(concurrency)
    in_flight: set[asyncio.Task[None]] = set()

    try:
        while not getattr(app.state, "stopping", False):
            wake_event.clear()
            claimed_any = False
            try:
                while not getattr(app.state, "stopping", False):
                    if not active_settings.admin_api_key:
                        break
                    await semaphore.acquire()
                    try:
                        job = await client.claim_next_job()
                    except Exception:
                        semaphore.release()
                        raise
                    if not job:
                        semaphore.release()
                        break
                    claimed_any = True
                    task = asyncio.create_task(
                        _run_job_with_semaphore(semaphore, job, client, active_settings)
                    )
                    in_flight.add(task)
                    task.add_done_callback(in_flight.discard)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                print(f"[news-worker] poll error: {exc}")

            if claimed_any:
                continue

            with suppress(TimeoutError):
                await asyncio.wait_for(
                    wake_event.wait(),
                    timeout=max(1.0, active_settings.poll_interval_seconds),
                )
    finally:
        for task in list(in_flight):
            task.cancel()
        if in_flight:
            await asyncio.gather(*in_flight, return_exceptions=True)
        await client.aclose()


def create_app(custom_settings: Settings | None = None, enable_worker_loop: bool = True) -> FastAPI:
    active_settings = custom_settings or settings

    @asynccontextmanager
    async def lifespan(app_instance: FastAPI):
        load_dotenv()
        wake_event = asyncio.Event()
        app_instance.state.wake_event = wake_event
        app_instance.state.stopping = False
        app_instance.state.settings = active_settings

        worker_task: asyncio.Task[None] | None = None
        if enable_worker_loop:
            missing = [
                name
                for name, val in (
                    ("ADMIN_API_KEY", active_settings.admin_api_key),
                    ("GEMINI_API_KEY", bool(active_settings.get_gemini_keys())),
                    ("GROQ_API_KEY", bool(active_settings.get_groq_keys())),
                )
                if not val
            ]
            if missing:
                print(
                    f"[news-worker] WARNING: missing {', '.join(missing)}. "
                    f"{'Polling paused until ADMIN_API_KEY is set.' if 'ADMIN_API_KEY' in missing else 'Some extractors/summarizers may fail.'}"
                )
            else:
                print(
                    f"[news-worker] ready: target={active_settings.nextjs_api_base_url}, "
                    f"poll={active_settings.poll_interval_seconds}s"
                )
            worker_task = asyncio.create_task(
                _worker_loop(app_instance, active_settings, wake_event)
            )
        try:
            yield
        finally:
            app_instance.state.stopping = True
            wake_event.set()
            if worker_task is not None:
                worker_task.cancel()
                with suppress(asyncio.CancelledError):
                    await worker_task

    app_instance = FastAPI(
        title="Crisne News Ingest Worker",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app_instance.get("/health")
    async def health():
        return {"status": "ok"}

    @app_instance.post("/internal/wake")
    async def internal_wake(request: Request):
        provided = request.headers.get("x-internal-key")
        if not is_valid_internal_key(provided, active_settings.internal_api_key):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
        wake_event: asyncio.Event | None = getattr(app_instance.state, "wake_event", None)
        if wake_event is not None:
            wake_event.set()
        return JSONResponse({"accepted": True}, status_code=202)

    return app_instance


app = create_app()
