"""Roadmap RAG Assistant — Config via pydantic-settings."""

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    # ── LLM ──
    gemini_api_key: str = ""
    llm_model: str = "gemini-flash-latest"
    llm_provider: str = "google_genai"

    # ── Adapter ──
    rag_adapter_mode: str = Field(default="http")
    nextjs_api_base_url: str = "http://127.0.0.1:3334"
    sqlite_db_path: str = "../prisma/dev.db"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
