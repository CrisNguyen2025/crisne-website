"""Generation phase (S1–S5) as one pipeline. To adapt to a new domain, edit domain_profile.py only."""

from rag_service.generation.context import GenerationRequest
from rag_service.generation.delivery import record_turn
from rag_service.generation.history import HistoryStore, InMemoryHistoryStore, history_store
from rag_service.generation.pipeline import GenerationFailed, GenerationPipeline, generation_pipeline

__all__ = [
    "GenerationFailed",
    "GenerationPipeline",
    "GenerationRequest",
    "HistoryStore",
    "InMemoryHistoryStore",
    "generation_pipeline",
    "history_store",
    "record_turn",
]
