"""Roadmap binding of the generic generation pipeline and Owner Memory API field mapping."""

from rag_service.core.generation.pipeline import GenerationFailed, GenerationPipeline
from rag_service.core.memory import owner_memory_store
from rag_service.domains.roadmap.profile import PROFILE

generation_pipeline = GenerationPipeline(PROFILE)
# Next.js /api/v1/memories names the scope field `scopeTopicSlug` (roadmap domain, ADR-0015)
owner_memory_store.configure_scope_field("scopeTopicSlug")

__all__ = ["GenerationFailed", "generation_pipeline"]
