"""Compatibility entry point: the roadmap agent lives in rag_service/domains/roadmap/agent.py."""

from rag_service.config import settings  # noqa: F401
from rag_service.domains.roadmap.profile import PROFILE  # noqa: F401
from rag_service.domains.roadmap.agent import (  # noqa: F401
    FallbackAgent,
    NextGenRoadmapAgent,
    _build_gemini,
    _build_groq,
    _resolve_gemini_api_key,
    build_agent,
    log_turn,
)

__all__ = ["FallbackAgent", "NextGenRoadmapAgent", "build_agent", "log_turn"]
