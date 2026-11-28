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
    gemini_api_keys: str = ""
    groq_api_key: str = ""
    groq_api_keys: str = ""

    llm_model: str = "gemini-flash-latest"
    vision_model: str = "gemini-flash-latest"
    whisper_model: str = "whisper-large-v3-turbo"
    groq_llm_model: str = "openai/gpt-oss-120b"

    poll_interval_seconds: float = 10.0
    worker_concurrency: int = 2
    max_video_duration_seconds: int = 1200
    max_vision_frames: int = 6
    max_photo_images: int = 10
    min_description_chars: int = 300
    min_transcript_words: int = 40
    media_proxy_url: str = ""
    tiktok_fallback_api_url: str = ""
    tiktok_fallback_api_key: str = ""

    @staticmethod
    def _merge_keys(multi: str, single: str) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for raw in [*multi.split(","), single]:
            key = raw.strip()
            if key and key not in seen:
                seen.add(key)
                result.append(key)
        return result

    def get_gemini_keys(self) -> list[str]:
        return self._merge_keys(self.gemini_api_keys, self.gemini_api_key)

    def get_groq_keys(self) -> list[str]:
        return self._merge_keys(self.groq_api_keys, self.groq_api_key)


settings = Settings()
