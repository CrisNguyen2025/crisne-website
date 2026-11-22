from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_WORKER_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _WORKER_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Worker-local .env wins over repo root .env.local / .env when running locally
        env_file=(_REPO_ROOT / ".env", _REPO_ROOT / ".env.local", _WORKER_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    nextjs_api_base_url: str = "http://127.0.0.1:3334"
    admin_api_key: str = ""
    internal_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("INTERNAL_API_KEY", "NEWS_WORKER_INTERNAL_KEY"),
    )

    gemini_api_key: str = ""
    groq_api_key: str = ""

    llm_model: str = "gemini-flash-latest"
    vision_model: str = "gemini-flash-latest"
    whisper_model: str = "whisper-large-v3-turbo"
    groq_llm_model: str = "openai/gpt-oss-120b"

    poll_interval_seconds: float = 10.0
    max_video_duration_seconds: int = 1200
    max_vision_frames: int = 6
    min_description_chars: int = 300
    min_transcript_words: int = 40


settings = Settings()
