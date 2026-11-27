"""Shared typing contract for domain mixins composed into NextGenRoadmapAgent."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, AsyncGenerator, Optional

if TYPE_CHECKING:
    from rag_service.domains.roadmap.router import StructuredEntityExtractor
    from rag_service.domains.roadmap.router.schemas import StructuredRoadmapAction
    from rag_service.execution.executor import ActionExecutor


class AgentHostMixin:
    """Declares host attributes and cross-mixin methods for static type checkers."""

    if TYPE_CHECKING:
        llm: Any
        router_llm: Any
        extractor: StructuredEntityExtractor
        tools: dict[str, Any]
        executor: ActionExecutor

        def _stream_text(self, text: str, delay: float) -> AsyncGenerator[dict, None]: ...

        async def _topic_known(self, slug: str) -> bool: ...

        def _ask_topic_choice(
            self, action: StructuredRoadmapAction, identifier: Optional[str], delay: float
        ) -> AsyncGenerator[dict, None]: ...

        async def _resolve_target_topic(
            self, topic_hint: Optional[str], content: str, page_context: Any, session_ctx: Any
        ) -> Optional[dict]: ...

        def handle_quiz_command(
            self,
            *,
            content: str,
            page_context: Any,
            session_id: str,
            session_ctx: Any,
            delay: float,
            outcome: dict,
        ) -> AsyncGenerator[dict, None]: ...

        def handle_topic_quiz_menu(
            self,
            *,
            topic_ref: str,
            page_context: Any,
            session_id: str,
            session_ctx: Any,
            delay: float,
            outcome: dict,
        ) -> AsyncGenerator[dict, None]: ...

        def handle_listing(
            self,
            *,
            content: str,
            lower: str,
            delay: float,
            outcome: dict,
        ) -> AsyncGenerator[dict, None]: ...

        def handle_memory_command(
            self,
            *,
            content: str,
            page_context: Any,
            session_ctx: Any,
            delay: float,
            outcome: dict,
        ) -> AsyncGenerator[dict, None]: ...

        async def _build_status_query_reply(
            self,
            adapter: Any,
            content: str,
            page_context: Any,
            session_ctx: Any,
            is_kwn: bool,
            is_rev: bool,
        ) -> tuple[str, str]: ...

        async def _list_active_owner_memories(
            self, active_topic: Optional[str], query: str
        ) -> list[Any]: ...
