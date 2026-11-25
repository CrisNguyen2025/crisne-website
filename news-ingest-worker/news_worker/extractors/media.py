from __future__ import annotations

import asyncio
import shutil
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import httpx
from google import genai
from google.genai import types
from groq import Groq
import yt_dlp

from news_worker.config import Settings
from news_worker.ssrf import assert_public_url


MAX_WHISPER_BYTES = 24 * 1024 * 1024
MAX_MEDIA_DOWNLOAD_BYTES = 100 * 1024 * 1024
MAX_MEDIA_REDIRECTS = 3
YTDLP_SOCKET_TIMEOUT_SECONDS = 20
LLM_API_TIMEOUT_SECONDS = 90.0


def _build_ydl_opts(settings: Settings | None = None, **extra: Any) -> dict[str, Any]:
    ydl_opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "no_color": True,
        "noplaylist": True,
        "socket_timeout": YTDLP_SOCKET_TIMEOUT_SECONDS,
        **extra,
    }
    proxy_url = settings.media_proxy_url.strip() if settings else ""
    if proxy_url:
        ydl_opts["proxy"] = proxy_url
    return ydl_opts


def _download_direct_media_sync(
    media_url: str,
    dest_path: Path,
    settings: Settings | None = None,
) -> Path:
    proxy_url = settings.media_proxy_url.strip() if settings else ""
    current = media_url
    with httpx.Client(
        timeout=float(YTDLP_SOCKET_TIMEOUT_SECONDS),
        follow_redirects=False,
        proxy=proxy_url or None,
    ) as client:
        for _ in range(MAX_MEDIA_REDIRECTS + 1):
            assert_public_url(current)
            with client.stream("GET", current) as response:
                if 300 <= response.status_code < 400:
                    location = response.headers.get("location")
                    if not location:
                        break
                    current = urljoin(current, location)
                    continue
                response.raise_for_status()
                declared_length = response.headers.get("content-length")
                if declared_length and declared_length.strip().isdigit():
                    if int(declared_length.strip()) > MAX_MEDIA_DOWNLOAD_BYTES:
                        raise RuntimeError("File media vượt giới hạn kích thước tải (100MB).")

                received = 0
                with dest_path.open("wb") as out:
                    for chunk in response.iter_bytes():
                        received += len(chunk)
                        if received > MAX_MEDIA_DOWNLOAD_BYTES:
                            raise RuntimeError("File media vượt giới hạn kích thước tải (100MB).")
                        out.write(chunk)
                return dest_path
    raise RuntimeError("Quá nhiều redirect khi tải file media.")


def _format_upload_date(raw: str | None) -> str | None:
    if raw and len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}T00:00:00Z"
    return None


def _fetch_video_metadata_sync(url: str, settings: Settings | None = None) -> dict[str, Any]:
    assert_public_url(url)
    ydl_opts = _build_ydl_opts(settings, skip_download=True, socket_timeout=15)
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False) or {}
    return {
        "title": info.get("title"),
        "author": info.get("uploader") or info.get("channel"),
        "thumbnail_url": info.get("thumbnail"),
        "description": info.get("description") or "",
        "duration": info.get("duration"),
        "published_at": _format_upload_date(info.get("upload_date")),
    }


async def fetch_video_metadata(url: str, settings: Settings | None = None) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_video_metadata_sync, url, settings)


def _find_downloaded_file(directory: Path, prefix: str) -> Path:
    candidates = sorted(
        p for p in directory.iterdir() if p.is_file() and p.name.startswith(prefix)
    )
    if not candidates:
        raise RuntimeError(f"Không tìm thấy file tải về trong {directory}")
    return candidates[0]


def _transcribe_audio_sync(
    url: str,
    tmp_dir: str,
    settings: Settings,
    duration: float | None = None,
    media_url: str | None = None,
) -> str:
    groq_keys = settings.get_groq_keys()
    if not groq_keys:
        raise RuntimeError("Thiếu GROQ_API_KEY cho bước Whisper.")
    if duration is not None and duration > settings.max_video_duration_seconds:
        raise RuntimeError(
            f"Video dài {int(duration)}s vượt giới hạn {settings.max_video_duration_seconds}s."
        )
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin is None:
        raise RuntimeError("Không tìm thấy ffmpeg trên máy để tách audio.")

    tmp_path = Path(tmp_dir)
    if media_url:
        src_file = _download_direct_media_sync(
            media_url, tmp_path / "audio_src.bin", settings=settings
        )
    else:
        assert_public_url(url)
        ydl_opts = _build_ydl_opts(
            settings,
            max_filesize=MAX_MEDIA_DOWNLOAD_BYTES,
            format="bestaudio/best",
            outtmpl=str(tmp_path / "audio_src.%(ext)s"),
        )
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        src_file = _find_downloaded_file(tmp_path, "audio_src")

    mp3_file = tmp_path / "audio_16k.mp3"

    proc = subprocess.run(  # noqa: S603 -- fixed ffmpeg arguments and validated local temp paths, shell=False
        [
            ffmpeg_bin,
            "-nostdin",
            "-y",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(src_file),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "32k",
            str(mp3_file),
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0 or not mp3_file.exists():
        raise RuntimeError(f"ffmpeg chuyển đổi audio thất bại: {proc.stderr[:240]}")

    if mp3_file.stat().st_size > MAX_WHISPER_BYTES:
        raise RuntimeError("File audio nén vẫn vượt giới hạn kích thước Whisper (24MB).")

    audio_bytes = mp3_file.read_bytes()
    last_exc: Exception | None = None
    for api_key in groq_keys:
        try:
            client = Groq(api_key=api_key, timeout=LLM_API_TIMEOUT_SECONDS)
            transcription = client.audio.transcriptions.create(
                model=settings.whisper_model,
                file=(mp3_file.name, audio_bytes),
                response_format="text",
            )
            return str(transcription).strip()
        except Exception as exc:
            last_exc = exc
    raise last_exc or RuntimeError("Groq Whisper thất bại.")


async def transcribe_audio_with_whisper(
    url: str,
    tmp_dir: str,
    settings: Settings,
    duration: float | None = None,
    media_url: str | None = None,
) -> str:
    return await asyncio.to_thread(
        _transcribe_audio_sync, url, tmp_dir, settings, duration, media_url
    )


def _extract_slides_vision_sync(
    url: str,
    tmp_dir: str,
    settings: Settings,
    duration: float | None = None,
    media_url: str | None = None,
) -> str:
    gemini_keys = settings.get_gemini_keys()
    if not gemini_keys:
        raise RuntimeError("Thiếu GEMINI_API_KEY cho bước Vision.")
    if duration is not None and duration > settings.max_video_duration_seconds:
        raise RuntimeError(
            f"Video dài {int(duration)}s vượt giới hạn {settings.max_video_duration_seconds}s."
        )
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin is None:
        raise RuntimeError("Không tìm thấy ffmpeg trên máy để trích xuất frame.")

    tmp_path = Path(tmp_dir)
    if media_url:
        video_file = _download_direct_media_sync(
            media_url, tmp_path / "video_src.mp4", settings=settings
        )
    else:
        assert_public_url(url)
        ydl_opts = _build_ydl_opts(
            settings,
            max_filesize=MAX_MEDIA_DOWNLOAD_BYTES,
            format="bestvideo[height<=720][ext=mp4]/best[height<=720]/best",
            outtmpl=str(tmp_path / "video_src.%(ext)s"),
        )
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        video_file = _find_downloaded_file(tmp_path, "video_src")

    scene_pattern = str(tmp_path / "slide_%02d.jpg")

    subprocess.run(  # noqa: S603 -- fixed ffmpeg arguments and validated local temp paths, shell=False
        [
            ffmpeg_bin,
            "-nostdin",
            "-y",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(video_file),
            "-vf",
            "select='gt(scene,0.3)',scale='min(1024,iw)':-2",
            "-vsync",
            "vfr",
            "-frames:v",
            str(settings.max_vision_frames),
            "-q:v",
            "4",
            scene_pattern,
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )

    frame_paths = sorted(tmp_path.glob("slide_*.jpg"))
    if len(frame_paths) < 2:
        for old in frame_paths:
            old.unlink(missing_ok=True)
        step_sec = max(1, int(max(duration or 18, 6) / settings.max_vision_frames))
        subprocess.run(  # noqa: S603 -- fixed ffmpeg arguments and validated local temp paths, shell=False
            [
                ffmpeg_bin,
                "-nostdin",
                "-y",
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                str(video_file),
                "-vf",
                f"fps=1/{step_sec},scale='min(1024,iw)':-2",
                "-frames:v",
                str(settings.max_vision_frames),
                "-q:v",
                "4",
                scene_pattern,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        frame_paths = sorted(tmp_path.glob("slide_*.jpg"))

    if not frame_paths:
        raise RuntimeError("Không cắt được frame nào từ video.")

    parts: list[Any] = [
        (
            "Đây là các frame cắt từ một video/slide ngắn. Hãy trích xuất trung thực toàn bộ chữ, "
            "số liệu, code, tiêu đề và thông tin hiển thị trên các slide/frame thành văn bản súc tích "
            "để làm tư liệu tóm tắt. Chỉ mô tả đúng nội dung xuất hiện trong ảnh, không bịa thêm."
        )
    ]
    for frame in frame_paths[: settings.max_vision_frames]:
        parts.append(types.Part.from_bytes(data=frame.read_bytes(), mime_type="image/jpeg"))

    last_exc: Exception | None = None
    for api_key in gemini_keys:
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=settings.vision_model,
                contents=parts,
            )
            return (response.text or "").strip()
        except Exception as exc:
            last_exc = exc
    raise last_exc or RuntimeError("Gemini Vision thất bại.")


async def extract_slides_with_vision(
    url: str,
    tmp_dir: str,
    settings: Settings,
    duration: float | None = None,
    media_url: str | None = None,
) -> str:
    return await asyncio.to_thread(
        _extract_slides_vision_sync, url, tmp_dir, settings, duration, media_url
    )
