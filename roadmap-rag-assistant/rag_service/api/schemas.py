"""Pydantic request/response schemas for the FastAPI endpoints."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """POST /chat request body."""

    message: str = Field(max_length=2000, description="Natural language prompt from user")
    thread_id: str = Field(
        default="default",
        description="Conversation thread ID for memory continuity",
    )
    context: Optional[dict] = Field(
        default=None,
        description="Page context from the web client: roadmapSlug, layerId, itemId",
    )


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


class HealthResponse(BaseModel):
    """GET /health response body."""

    status: str
    adapter_mode: str
    llm_model: str
    tools_count: int


class ActionConfirmRequest(BaseModel):
    """POST /chat/confirm and /chat/cancel request body."""

    thread_id: str = Field(default="default", description="Conversation thread ID")
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
