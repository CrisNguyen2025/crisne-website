"""Roadmap RAG Assistant — Config via pydantic-settings."""

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    # ── LLM ──
    gemini_api_key: str = ""
    llm_model: str = "gemini-flash-latest"
    llm_provider: str = "google_genai"
    groq_api_key: str = ""
    # More Groq keys, comma-separated; a rate-limited key hands the call to the next (rag_service/llm_keys.py)
    groq_api_keys: str = ""

    # ── Adapter ──
    rag_adapter_mode: str = Field(default="http")
    nextjs_api_base_url: str = "http://127.0.0.1:3334"
    # Sent as `x-admin-key`; must match ADMIN_API_KEY of the Next.js app, or writes get 401.
    admin_api_key: str = ""
    sqlite_db_path: str = "../prisma/dev.db"
    # Conversation memory file; empty keeps it in RAM (lost on restart)
    rag_history_db: str = ""
    # Rewrite, expand and split the question with the LLM before searching (one extra LLM call per question)
    rag_query_transform: bool = False
    # Reorder the retrieved candidates with the LLM before answering (one extra LLM call per question)
    rag_rerank: bool = False
    # Ask the LLM which claims of a RAG answer the documents do not support; any fails the answer
    # (one extra LLM call per answer, and the answer is held until it returns)
    rag_semantic_grounding: bool = False

    # ── Access ──
    # Shared with the Next.js proxy (RAG_INTERNAL_KEY there); empty = every request is rejected.
    internal_api_key: str = ""
    # Comma-separated browser origins; empty because browsers go through the Next.js proxy.
    cors_origins: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
