"""Roadmap binding of the generic generation pipeline: the singleton the agent uses."""

from rag_service.core.generation.pipeline import GenerationFailed, GenerationPipeline
from rag_service.domains.roadmap.profile import PROFILE

generation_pipeline = GenerationPipeline(PROFILE)

__all__ = ["GenerationFailed", "generation_pipeline"]
