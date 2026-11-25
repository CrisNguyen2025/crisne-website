"""Pydantic request/response schemas for the FastAPI endpoints."""

from __future__ import annotations

from typing import Annotated, Optional

from pydantic import field_validator, BaseModel, Field



def reject_shared_thread(value: str) -> str:
    """"default" (alone or scoped as "visitor:default") is the thread every id-less caller would share."""
    if value.strip().lower().rsplit(":", 1)[-1] in ("", "default"):
        raise ValueError("thread_id must identify one conversation; generate one per chat (e.g. a UUID)")
    return value

class PreviewTargetEdit(BaseModel):
    """Target fields (topic and/or section) the Owner edited on a Preview card."""

    topic: Optional[str] = Field(default=None, max_length=200)
    section: Optional[str] = Field(default=None, max_length=200)


class ChatRequest(BaseModel):
    """POST /chat request body."""

    message: str = Field(max_length=2000, description="Natural language prompt from user")
    # Required: a shared default thread let one caller read another's conversation and confirm their preview
    thread_id: str = Field(min_length=1, max_length=200, description="Conversation thread ID for memory continuity")

    _thread = field_validator("thread_id")(lambda cls, v: reject_shared_thread(v))
    context: Optional[dict] = Field(
        default=None,
        description="Page context from the web client: roadmapSlug, layerId, itemId",
    )
    # Names the Owner edited on a create Preview; applied when this message confirms it (commands.handle_pending)
    titles: Optional[list[Annotated[str, Field(min_length=1, max_length=200)]]] = Field(default=None, max_length=20)
    target: Optional[PreviewTargetEdit] = Field(default=None)


class ContextRequest(BaseModel):
    """POST /chat/context request body."""

    thread_id: str = Field(min_length=1, max_length=200)

    _thread = field_validator("thread_id")(lambda cls, v: reject_shared_thread(v))


class ToolCallResult(BaseModel):
    """Represents a single tool call executed by the agent."""

    name: str
    args: dict
    result: str


class ChatResponse(BaseModel):
    """POST /chat response body."""

    message: str = Field(description="Agent's final text response")
    tool_calls: list[ToolCallResult] = Field(
        default_factory=list,
        description="List of tools invoked during this turn",
    )


class IndexHealthInfo(BaseModel):
    """Index freshness and state in GET /health."""

    synced: bool
    current: bool
    documents: int
    age_seconds: Optional[float] = None
    last_error: Optional[str] = None
    vectors_pending: int = 0
    chunks: int = 0  # lesson sections indexed on their own (full-export `chunks`)
    last_sync_ms: Optional[float] = None  # duration of the last full sync
    version_checks_skipped: int = 0  # TTL refreshes that skipped full-export: index-version unchanged
    sync_count: int = 0
    change_generation: int = 0
    indexed_generation: int = 0
    sync_task_active: bool = False


class HealthResponse(BaseModel):
    """GET /health response body."""

    status: str
    adapter_mode: str
    llm_model: str
    tools_count: int
    index: IndexHealthInfo


class ActionConfirmRequest(BaseModel):
    """POST /chat/confirm and /chat/cancel request body."""

    thread_id: str = Field(min_length=1, max_length=200, description="Conversation thread ID")

    _thread = field_validator("thread_id")(lambda cls, v: reject_shared_thread(v))
    action_id: str | None = Field(default=None, description="Optional action or thread ID alias")


class ActionConfirmResponse(BaseModel):
    """Response body for confirm/cancel."""

    success: bool
    message: str
    # What the confirmed action wrote (see rag_service/execution/changes.py); absent when nothing changed
    changes: dict | None = None



class PlanRequest(BaseModel):
    """POST /chat/plan: choose one WebMCP tool for a message (the browser runs it)."""

    message: str
    tools: list[dict] = Field(default_factory=list, description="WebMCP tools: name, description, inputSchema")
    context: Optional[dict] = None


class PlanResponse(BaseModel):
    tool: Optional[str] = None
    args: dict = Field(default_factory=dict)
    reply: str = ""


class MatchLessonsRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    tldr: str = Field(default="", max_length=1000)
    takeaways: list[Annotated[str, Field(max_length=400)]] = Field(default_factory=list, max_length=15)
    tags: list[Annotated[str, Field(max_length=64)]] = Field(default_factory=list, max_length=15)
    limit: int = Field(default=5, ge=1, le=10)


class MatchedLessonItem(BaseModel):
    lesson_id: str
    lesson_slug: str
    title: str
    topic_slug: str
    topic_title: str
    section: Optional[str] = None
    score: float
    duplicate_warning: bool = False
    version_update_hint: bool = False


class MatchLessonsResponse(BaseModel):
    suggested_topic_slug: Optional[str] = None
    suggested_topic_title: Optional[str] = None
    suggested_section: Optional[str] = None
    matches: list[MatchedLessonItem] = Field(default_factory=list)

